import 'server-only';

import type { DocumentReference } from 'firebase-admin/firestore';
import type { BackupCategoryCounts, BackupData } from '@/lib/types';
import {
  completeBackupData,
  getBackupCategoryCounts,
  getBackupContentSignature,
} from '@/lib/backup';
import { adminFirestore, firebaseUserForEmail } from './firebase-admin';
import { exportBackupForUid } from './backup-store';
import { runRestoreWrites, settleRestoreOperations } from '../restore-operations.ts';

const RESTORE_LOCK_MS = 10 * 60 * 1_000;
const RECOVERY_SNAPSHOTS_TO_KEEP = 3;

export class RestoreInProgressError extends Error {
  constructor() {
    super('Another restore is already in progress');
    this.name = 'RestoreInProgressError';
  }
}

export class RestoreRolledBackError extends Error {
  constructor(readonly recoveryId: string) {
    super('Restore failed and the previous data was restored automatically');
    this.name = 'RestoreRolledBackError';
  }
}

export class RestoreRollbackFailedError extends Error {
  constructor(readonly recoveryId: string) {
    super('Restore and automatic rollback both failed');
    this.name = 'RestoreRollbackFailedError';
  }
}

function countsEqual(expected: BackupCategoryCounts, actual: BackupCategoryCounts): boolean {
  return Object.keys(expected).every((key) => (
    expected[key as keyof BackupCategoryCounts] === actual[key as keyof BackupCategoryCounts]
  ));
}

async function recursivelyDelete(refs: DocumentReference[]): Promise<void> {
  const db = adminFirestore();
  const concurrency = 12;
  for (let start = 0; start < refs.length; start += concurrency) {
    await settleRestoreOperations(refs.slice(start, start + concurrency).map((ref) => db.recursiveDelete(ref)));
  }
}

async function clearBackupCollections(root: DocumentReference): Promise<void> {
  const [stocks, files, informations, cashTransactions, bankAccounts] = await Promise.all([
    root.collection('stocks').get(),
    root.collection('files').get(),
    root.collection('informations').get(),
    root.collection('cash_transactions').get(),
    root.collection('bank_accounts').get(),
  ]);
  await recursivelyDelete([
    ...stocks.docs.map((item) => item.ref),
    ...files.docs.map((item) => item.ref),
    ...informations.docs.map((item) => item.ref),
    ...cashTransactions.docs.map((item) => item.ref),
    ...bankAccounts.docs.map((item) => item.ref),
  ]);
}

async function writeBackupCollections(root: DocumentReference, backup: BackupData): Promise<void> {
  const writer = adminFirestore().bulkWriter();
  await runRestoreWrites((track) => {
    const set = (reference: DocumentReference, data: Record<string, unknown>) => {
      const operation = writer.set(reference, data);
      track(operation);
      return operation;
    };

    backup.files?.forEach(({ id, ...data }) => set(root.collection('files').doc(id), data));
    backup.informations?.forEach(({ id, ...data }) => set(root.collection('informations').doc(id), data));
    backup.cash_transactions?.forEach(({ id, ...data }) => set(root.collection('cash_transactions').doc(id), data));
    backup.bank_accounts?.forEach(({ id, ...data }) => set(root.collection('bank_accounts').doc(id), data));

    backup.stocks.forEach((stock) => {
      const {
        id,
        buy_rounds = [],
        realized_trades = [],
        dividend_payments = [],
        ...stockData
      } = stock;
      const stockRef = root.collection('stocks').doc(id);
      set(stockRef, stockData);
      buy_rounds.forEach(({ id: itemId, ...data }) => {
        set(stockRef.collection('buy_rounds').doc(itemId), { ...data, stock_id: id });
      });
      realized_trades.forEach(({ id: itemId, ...data }) => {
        set(stockRef.collection('realized_trades').doc(itemId), { ...data, stock_id: id });
      });
      dividend_payments.forEach(({ id: itemId, ...data }) => {
        set(stockRef.collection('dividend_payments').doc(itemId), { ...data, stock_id: id });
      });
    });

  }, () => writer.close());
}

async function replaceUserBackup(uid: string, backup: BackupData): Promise<void> {
  const userRoot = adminFirestore().collection('users').doc(uid);
  await clearBackupCollections(userRoot);
  await writeBackupCollections(userRoot, backup);
}

async function verifyStoredBackup(uid: string, expectedBackup: BackupData): Promise<BackupCategoryCounts> {
  const storedBackup = await exportBackupForUid(uid);
  const expected = getBackupCategoryCounts(expectedBackup);
  const actual = getBackupCategoryCounts(storedBackup);
  if (!countsEqual(expected, actual)) {
    throw new Error('Stored category counts do not match the restore file');
  }
  if (getBackupContentSignature(expectedBackup) !== getBackupContentSignature(storedBackup)) {
    throw new Error('Stored backup content does not match the restore file');
  }
  return actual;
}

async function acquireRestoreLock(uid: string, jobId: string): Promise<void> {
  const db = adminFirestore();
  const lockRef = db.collection('_system_restore_locks').doc(uid);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const expiresAt = Number(snapshot.data()?.expires_at ?? 0);
    if (snapshot.exists && expiresAt > now) throw new RestoreInProgressError();
    transaction.set(lockRef, {
      job_id: jobId,
      created_at: now,
      expires_at: now + RESTORE_LOCK_MS,
    });
  });
}

async function releaseRestoreLock(uid: string, jobId: string): Promise<void> {
  const db = adminFirestore();
  const lockRef = db.collection('_system_restore_locks').doc(uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    if (snapshot.data()?.job_id === jobId) transaction.delete(lockRef);
  });
}

async function createRecoverySnapshot(
  uid: string,
  jobId: string,
  backup: BackupData,
): Promise<DocumentReference> {
  const recoveryRef = adminFirestore()
    .collection('_system_restore_recovery')
    .doc(uid)
    .collection('snapshots')
    .doc(jobId);
  await recoveryRef.set({
    created_at: Date.now(),
    status: 'creating',
    counts: getBackupCategoryCounts(backup),
  });
  await writeBackupCollections(recoveryRef, backup);
  await recoveryRef.update({ status: 'ready' });
  return recoveryRef;
}

async function pruneRecoverySnapshots(uid: string): Promise<void> {
  const snapshots = await adminFirestore()
    .collection('_system_restore_recovery')
    .doc(uid)
    .collection('snapshots')
    .orderBy('created_at', 'desc')
    .get();
  await recursivelyDelete(snapshots.docs.slice(RECOVERY_SNAPSHOTS_TO_KEEP).map((item) => item.ref));
}

export async function restoreJsonBackupForEmail(
  email: string,
  input: BackupData,
): Promise<{ counts: BackupCategoryCounts; recoveryId: string }> {
  const uid = (await firebaseUserForEmail(email)).uid;
  const db = adminFirestore();
  const jobId = db.collection('_system_restore_jobs').doc().id;
  const backup = completeBackupData(input);
  await acquireRestoreLock(uid, jobId);

  let recoveryRef: DocumentReference | null = null;
  let currentBackup: BackupData | null = null;
  let mutationStarted = false;
  try {
    currentBackup = await exportBackupForUid(uid);
    recoveryRef = await createRecoverySnapshot(uid, jobId, currentBackup);
    mutationStarted = true;
    await replaceUserBackup(uid, backup);
    const counts = await verifyStoredBackup(uid, backup);
    await recoveryRef.update({ status: 'verified', completed_at: Date.now() })
      .catch((error) => console.warn('Restore verified, but recovery status update failed:', error));
    await pruneRecoverySnapshots(uid).catch(() => undefined);
    return { counts, recoveryId: jobId };
  } catch (error) {
    if (!mutationStarted || !recoveryRef || !currentBackup) throw error;

    try {
      await replaceUserBackup(uid, currentBackup);
      await verifyStoredBackup(uid, currentBackup);
      await recoveryRef.update({ status: 'rolled_back', completed_at: Date.now() })
        .catch((error) => console.warn('Rollback verified, but recovery status update failed:', error));
      throw new RestoreRolledBackError(jobId);
    } catch (rollbackError) {
      if (rollbackError instanceof RestoreRolledBackError) throw rollbackError;
      await recoveryRef.update({ status: 'rollback_failed', completed_at: Date.now() }).catch(() => undefined);
      throw new RestoreRollbackFailedError(jobId);
    }
  } finally {
    await releaseRestoreLock(uid, jobId).catch(() => undefined);
  }
}

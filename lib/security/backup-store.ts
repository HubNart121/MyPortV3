import 'server-only';

import type { DocumentData } from 'firebase-admin/firestore';
import type { BackupData, BankAccount, BuyRound, CashTransaction, DividendPayment, FileResource, InfoResource, RealizedTrade, Stock } from '@/lib/types';
import { completeBackupData } from '@/lib/backup';
import { adminFirestore, firebaseUserForEmail } from './firebase-admin';

function withId<T>(id: string, data: DocumentData): T {
  return { ...data, id } as T;
}

async function firebaseUidForEmail(email: string): Promise<string> {
  return (await firebaseUserForEmail(email)).uid;
}

export async function exportBackupForEmail(email: string): Promise<BackupData> {
  const uid = await firebaseUidForEmail(email);
  return exportBackupForUid(uid);
}

export async function exportBackupForUid(uid: string): Promise<BackupData> {
  const db = adminFirestore();
  const userRoot = db.collection('users').doc(uid);
  const stocksSnapshot = await userRoot.collection('stocks').get();

  const stocks = await Promise.all(
    stocksSnapshot.docs.map(async (stockDoc) => {
      const [buyRounds, realizedTrades, dividendPayments] = await Promise.all([
        stockDoc.ref.collection('buy_rounds').get(),
        stockDoc.ref.collection('realized_trades').get(),
        stockDoc.ref.collection('dividend_payments').get(),
      ]);

      return {
        ...withId<Stock>(stockDoc.id, stockDoc.data()),
        buy_rounds: buyRounds.docs.map((doc) => withId<BuyRound>(doc.id, doc.data())),
        realized_trades: realizedTrades.docs.map((doc) => withId<RealizedTrade>(doc.id, doc.data())),
        dividend_payments: dividendPayments.docs.map((doc) => withId<DividendPayment>(doc.id, doc.data())),
      };
    }),
  );

  const [filesSnapshot, informationSnapshot, cashTransactionsSnapshot, bankAccountsSnapshot] = await Promise.all([
    userRoot.collection('files').get(),
    userRoot.collection('informations').get(),
    userRoot.collection('cash_transactions').get(),
    userRoot.collection('bank_accounts').get(),
  ]);

  return completeBackupData({
    version: '7.0 (Integrity-checked Firebase account backup)',
    exported_at: new Date().toISOString(),
    stocks,
    files: filesSnapshot.docs.map((doc) => withId<FileResource>(doc.id, doc.data())),
    informations: informationSnapshot.docs.map((doc) => withId<InfoResource>(doc.id, doc.data())),
    cash_transactions: cashTransactionsSnapshot.docs.map((doc) => withId<CashTransaction>(doc.id, doc.data())),
    bank_accounts: bankAccountsSnapshot.docs.map((doc) => withId<BankAccount>(doc.id, doc.data())),
  });
}

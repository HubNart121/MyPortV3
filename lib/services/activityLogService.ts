import { waitForBestEffort } from '../best-effort';
import {
  addDoc,
  collection,
  deleteDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { getSupabase } from '../supabase';
import type { ActivityAction, ActivityCategory, ActivityLog } from '../types';

export const ACTIVITY_LOG_RETENTION_DAYS = 30;
const DEFAULT_ACTIVITY_LOG_LIMIT = 200;

export type ActivityLogInput = Pick<
  ActivityLog,
  'action' | 'category' | 'target_label' | 'summary'
> & {
  metadata?: ActivityLog['metadata'];
};

function cutoffIso(): string {
  return new Date(Date.now() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function activityCollection() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Firebase user is required for activity logs');
  if (!db) throw new Error('Firebase Firestore is not configured');
  return collection(db, 'users', uid, 'activity_logs');
}

function actorEmail(): string {
  return auth?.currentUser?.email || 'Local PostgreSQL';
}

function cleanMetadata(metadata: ActivityLog['metadata'] | undefined): ActivityLog['metadata'] {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => (
      value === null
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    )),
  );
}

export async function pruneActivityLogs(): Promise<void> {
  const cutoff = cutoffIso();
  if (isFirebaseConfigured && db) {
    const snapshot = await getDocs(query(activityCollection(), where('created_at', '<', cutoff)));
    for (let start = 0; start < snapshot.docs.length; start += 400) {
      const batch = writeBatch(db);
      snapshot.docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
    return;
  }

  const { error } = await getSupabase()
    .from('activity_logs')
    .delete()
    .lt('created_at', cutoff);
  if (error) throw error;
}

export async function recordActivityLog(input: ActivityLogInput): Promise<void> {
  await waitForBestEffort(() => writeActivityLog(input), 'Activity log write');
}

async function writeActivityLog(input: ActivityLogInput): Promise<void> {
  try {
    const payload = {
      created_at: new Date().toISOString(),
      actor_email: actorEmail(),
      action: input.action,
      category: input.category,
      target_label: input.target_label.slice(0, 500),
      summary: input.summary.slice(0, 1000),
      metadata: cleanMetadata(input.metadata) ?? {},
    };

    if (isFirebaseConfigured && db) {
      await addDoc(activityCollection(), payload);
    } else {
      const { error } = await getSupabase().from('activity_logs').insert(payload);
      if (error) throw error;
    }

    void pruneActivityLogs().catch((error) => {
      console.warn('Activity log prune failed:', error);
    });
  } catch (error) {
    console.warn('Activity log write failed:', error);
  }
}

export async function fetchActivityLogs(maxRows = DEFAULT_ACTIVITY_LOG_LIMIT): Promise<ActivityLog[]> {
  void pruneActivityLogs().catch((error) => {
    console.warn('Activity log prune failed:', error);
  });

  const cutoff = cutoffIso();
  const rowLimit = Math.max(1, Math.min(maxRows, 500));

  if (isFirebaseConfigured && db) {
    const snapshot = await getDocs(query(
      activityCollection(),
      where('created_at', '>=', cutoff),
      orderBy('created_at', 'desc'),
      limit(rowLimit),
    ));

    return snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as ActivityLog[];
  }

  const { data, error } = await getSupabase()
    .from('activity_logs')
    .select('*')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(rowLimit);

  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  create: 'เพิ่ม',
  update: 'แก้ไข',
  delete: 'ลบ',
  import: 'นำเข้า',
  clear: 'ล้างข้อมูล',
  restore: 'กู้คืน',
};

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  stock: 'หุ้น',
  buy_round: 'รอบซื้อ',
  sell: 'รายการขาย',
  dividend: 'เงินปันผล',
  cash: 'ฝาก/ถอน',
  file: 'ไฟล์',
  information: 'คลังความรู้',
  system: 'ระบบ',
};

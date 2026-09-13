import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { getSupabase } from '../supabase';
import type { CashTransaction } from '../types';
import { recordActivityLog } from './activityLogService';
import { applyBankAccountMovement } from './bankAccountService';

const COLLECTION_NAME = 'cash_transactions';

function transactionCollection() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('กรุณาเข้าสู่ระบบ Firebase ก่อนใช้งานรายการฝากถอน');
  if (!db) throw new Error('Firebase Firestore ยังไม่ได้ตั้งค่า');
  return collection(db, 'users', uid, COLLECTION_NAME);
}

export type CashTransactionInput = Pick<
  CashTransaction,
  'transaction_date' | 'type' | 'amount' | 'port_type' | 'note'
>;

export async function fetchCashTransactions(): Promise<CashTransaction[]> {
  if (isFirebaseConfigured && db) {
    const snapshot = await getDocs(query(transactionCollection(), orderBy('transaction_date', 'desc')));
    return snapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }) as CashTransaction)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at));
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(COLLECTION_NAME)
    .select('*')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CashTransaction[];
}

export async function addCashTransaction(input: CashTransactionInput): Promise<void> {
  const now = new Date().toISOString();
  const payload = { ...input, amount: Number(input.amount), created_at: now, updated_at: now };
  if (isFirebaseConfigured && db) {
    const ref = await addDoc(transactionCollection(), payload);
    await applyBankAccountMovement(input.port_type as 'Business' | 'Private', input.type === 'deposit' ? -payload.amount : payload.amount);
    await recordActivityLog({
      action: 'create',
      category: 'cash',
      target_label: input.port_type,
      summary: `เพิ่มรายการ${input.type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน'}ของพอร์ต ${input.port_type}`,
      metadata: { target_id: ref.id, type: input.type, source: 'cash_transactions' },
    });
    return;
  }
  const supabase = getSupabase();
  const { data, error } = await supabase.from(COLLECTION_NAME).insert(payload).select('id').single();
  if (error) throw error;
  await applyBankAccountMovement(input.port_type as 'Business' | 'Private', input.type === 'deposit' ? -payload.amount : payload.amount);
  await recordActivityLog({
    action: 'create',
    category: 'cash',
    target_label: input.port_type,
    summary: `เพิ่มรายการ${input.type === 'deposit' ? 'ฝากเงิน' : 'ถอนเงิน'}ของพอร์ต ${input.port_type}`,
    metadata: { target_id: data?.id ?? null, type: input.type, source: 'cash_transactions' },
  });
}

export async function importCashTransactions(inputs: CashTransactionInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const now = new Date().toISOString();
  if (isFirebaseConfigured && db) {
    for (let start = 0; start < inputs.length; start += 400) {
      const batch = writeBatch(db);
      inputs.slice(start, start + 400).forEach((input, offset) => {
        const itemRef = doc(transactionCollection());
        batch.set(itemRef, {
          ...input,
          amount: Number(input.amount),
          created_at: new Date(Date.parse(now) + start + offset).toISOString(),
          updated_at: now,
        });
      });
      await batch.commit();
    }
    for (const input of inputs) {
      await applyBankAccountMovement(input.port_type as 'Business' | 'Private', input.type === 'deposit' ? -Number(input.amount) : Number(input.amount));
    }
    await recordActivityLog({
      action: 'import',
      category: 'cash',
      target_label: 'Cash Transactions',
      summary: `นำเข้ารายการฝาก/ถอน ${inputs.length} รายการ`,
      metadata: { count: inputs.length, source: 'cash_import' },
    });
    return inputs.length;
  }
  const supabase = getSupabase();
  const { error } = await supabase.from(COLLECTION_NAME).insert(inputs.map((input) => ({
    ...input,
    amount: Number(input.amount),
    created_at: now,
    updated_at: now,
  })));
  if (error) throw error;
  for (const input of inputs) {
    await applyBankAccountMovement(input.port_type as 'Business' | 'Private', input.type === 'deposit' ? -Number(input.amount) : Number(input.amount));
  }
  await recordActivityLog({
    action: 'import',
    category: 'cash',
    target_label: 'Cash Transactions',
    summary: `นำเข้ารายการฝาก/ถอน ${inputs.length} รายการ`,
    metadata: { count: inputs.length, source: 'cash_import' },
  });
  return inputs.length;
}

export async function updateCashTransaction(id: string, input: CashTransactionInput): Promise<void> {
  const previous = (await fetchCashTransactions()).find((item) => item.id === id);
  const payload = { ...input, amount: Number(input.amount), updated_at: new Date().toISOString() };
  if (isFirebaseConfigured && db) {
    await updateDoc(doc(transactionCollection(), id), payload);
    if (previous) await applyBankAccountMovement(previous.port_type as 'Business' | 'Private', previous.type === 'deposit' ? Number(previous.amount) : -Number(previous.amount));
    await applyBankAccountMovement(input.port_type as 'Business' | 'Private', input.type === 'deposit' ? -payload.amount : payload.amount);
    await recordActivityLog({
      action: 'update',
      category: 'cash',
      target_label: input.port_type,
      summary: `แก้ไขรายการฝาก/ถอนของพอร์ต ${input.port_type}`,
      metadata: { target_id: id, type: input.type, source: 'cash_transactions' },
    });
    return;
  }
  const supabase = getSupabase();
  const { error } = await supabase.from(COLLECTION_NAME).update(payload).eq('id', id);
  if (error) throw error;
  if (previous) await applyBankAccountMovement(previous.port_type as 'Business' | 'Private', previous.type === 'deposit' ? Number(previous.amount) : -Number(previous.amount));
  await applyBankAccountMovement(input.port_type as 'Business' | 'Private', input.type === 'deposit' ? -payload.amount : payload.amount);
  await recordActivityLog({
    action: 'update',
    category: 'cash',
    target_label: input.port_type,
    summary: `แก้ไขรายการฝาก/ถอนของพอร์ต ${input.port_type}`,
    metadata: { target_id: id, type: input.type, source: 'cash_transactions' },
  });
}

export async function deleteCashTransaction(id: string): Promise<void> {
  const previous = (await fetchCashTransactions()).find((item) => item.id === id);
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(transactionCollection(), id));
    if (previous) await applyBankAccountMovement(previous.port_type as 'Business' | 'Private', previous.type === 'deposit' ? Number(previous.amount) : -Number(previous.amount));
    await recordActivityLog({
      action: 'delete',
      category: 'cash',
      target_label: 'Cash Transactions',
      summary: 'ลบรายการฝาก/ถอน',
      metadata: { target_id: id, source: 'cash_transactions' },
    });
    return;
  }
  const supabase = getSupabase();
  const { error } = await supabase.from(COLLECTION_NAME).delete().eq('id', id);
  if (error) throw error;
  if (previous) await applyBankAccountMovement(previous.port_type as 'Business' | 'Private', previous.type === 'deposit' ? Number(previous.amount) : -Number(previous.amount));
  await recordActivityLog({
    action: 'delete',
    category: 'cash',
    target_label: 'Cash Transactions',
    summary: 'ลบรายการฝาก/ถอน',
    metadata: { target_id: id, source: 'cash_transactions' },
  });
}

export async function clearCashTransactions(): Promise<number> {
  if (isFirebaseConfigured && db) {
    const snapshot = await getDocs(transactionCollection());
    for (let start = 0; start < snapshot.docs.length; start += 400) {
      const batch = writeBatch(db);
      snapshot.docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
    for (const item of snapshot.docs) {
      const transaction = item.data() as CashTransaction;
      await applyBankAccountMovement(transaction.port_type as 'Business' | 'Private', transaction.type === 'deposit' ? Number(transaction.amount) : -Number(transaction.amount));
    }
    await recordActivityLog({
      action: 'clear',
      category: 'cash',
      target_label: 'Cash Transactions',
      summary: `ล้างประวัติฝาก/ถอนทั้งหมด ${snapshot.size} รายการ`,
      metadata: { count: snapshot.size, source: 'cash_clear' },
    });
    return snapshot.size;
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(COLLECTION_NAME)
    .delete()
    .not('id', 'is', null)
    .select('*');
  if (error) throw error;
  for (const item of data ?? []) {
    const transaction = item as CashTransaction;
    await applyBankAccountMovement(transaction.port_type as 'Business' | 'Private', transaction.type === 'deposit' ? Number(transaction.amount) : -Number(transaction.amount));
  }
  const count = data?.length ?? 0;
  await recordActivityLog({
    action: 'clear',
    category: 'cash',
    target_label: 'Cash Transactions',
    summary: `ล้างประวัติฝาก/ถอนทั้งหมด ${count} รายการ`,
    metadata: { count, source: 'cash_clear' },
  });
  return count;
}

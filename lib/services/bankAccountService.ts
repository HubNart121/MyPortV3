import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { getSupabase } from '../supabase';
import type { BankAccount, BankAccountType } from '../types';
import { recordActivityLog } from './activityLogService';

const COLLECTION_NAME = 'bank_accounts';

function firebaseCollection() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('กรุณาเข้าสู่ระบบ Firebase ก่อนใช้งานบัญชีเงินฝาก');
  if (!db) throw new Error('Firebase Firestore ยังไม่ได้ตั้งค่า');
  return collection(db, 'users', uid, COLLECTION_NAME);
}

export type BankAccountInput = Pick<
  BankAccount,
  'account_number' | 'account_type' | 'balance' | 'note'
>;

export async function fetchBankAccounts(): Promise<BankAccount[]> {
  if (isFirebaseConfigured && db) {
    const snapshot = await getDocs(query(firebaseCollection(), orderBy('account_type')));
    return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as BankAccount);
  }
  const { data, error } = await getSupabase().from(COLLECTION_NAME).select('*').order('account_type');
  if (error) throw error;
  return (data ?? []) as BankAccount[];
}

export async function addBankAccount(input: BankAccountInput): Promise<void> {
  const now = new Date().toISOString();
  const payload = { ...input, balance: Number(input.balance), created_at: now, updated_at: now };
  let id: string | null = null;
  if (isFirebaseConfigured && db) {
    id = (await addDoc(firebaseCollection(), payload)).id;
  } else {
    const { data, error } = await getSupabase().from(COLLECTION_NAME).insert(payload).select('id').single();
    if (error) throw error;
    id = data?.id ?? null;
  }
  await recordActivityLog({ action: 'create', category: 'cash', target_label: input.account_type, summary: `เพิ่มบัญชีเงินฝากประเภท ${input.account_type}`, metadata: { target_id: id, account_type: input.account_type } });
}

export async function updateBankAccount(id: string, input: BankAccountInput): Promise<void> {
  const payload = { ...input, balance: Number(input.balance), updated_at: new Date().toISOString() };
  if (isFirebaseConfigured && db) await updateDoc(doc(firebaseCollection(), id), payload);
  else {
    const { error } = await getSupabase().from(COLLECTION_NAME).update(payload).eq('id', id);
    if (error) throw error;
  }
  await recordActivityLog({ action: 'update', category: 'cash', target_label: input.account_type, summary: `แก้ไขบัญชีเงินฝากประเภท ${input.account_type}`, metadata: { target_id: id, account_type: input.account_type } });
}

export async function deleteBankAccount(id: string): Promise<void> {
  if (isFirebaseConfigured && db) await deleteDoc(doc(firebaseCollection(), id));
  else {
    const { error } = await getSupabase().from(COLLECTION_NAME).delete().eq('id', id);
    if (error) throw error;
  }
  await recordActivityLog({ action: 'delete', category: 'cash', target_label: 'Bank Account', summary: 'ลบบัญชีเงินฝาก', metadata: { target_id: id } });
}

export async function applyBankAccountMovement(
  accountType: BankAccountType,
  delta: number,
): Promise<void> {
  const account = (await fetchBankAccounts()).find((item) => item.account_type === accountType);
  if (!account) throw new Error(`ยังไม่มีบัญชีเงินฝากประเภท ${accountType} สำหรับรับรายการนี้`);
  const nextBalance = Number(account.balance) + Number(delta);
  if (nextBalance < 0) throw new Error(`ยอดบัญชี ${accountType} ไม่พอสำหรับรายการถอนเงิน`);
  await updateBankAccount(account.id, {
    account_number: account.account_number,
    account_type: account.account_type,
    balance: nextBalance,
    note: account.note,
  });
}

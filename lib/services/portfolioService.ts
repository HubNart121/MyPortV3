import { waitForBestEffort } from '../best-effort';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { getSupabase } from '../supabase';
import { recordActivityLog } from './activityLogService';
import type {
  BuyRound,
  DividendPayment,
  RealizedTrade,
  Stock,
} from '../types';
import { normalizeStockCountry, stockIdentityKey } from '../stock-country';

type StockBundle = Stock & {
  buy_rounds: BuyRound[];
  realized_trades: RealizedTrade[];
  dividend_payments: DividendPayment[];
};

function normalizeStock<T extends StockBundle>(stock: T): T {
  return { ...stock, country: normalizeStockCountry(stock.country) };
}

type ChildCollection = 'buy_rounds' | 'realized_trades' | 'dividend_payments';

const CHILD_ACTIVITY_CATEGORY: Record<ChildCollection, 'buy_round' | 'sell' | 'dividend'> = {
  buy_rounds: 'buy_round',
  realized_trades: 'sell',
  dividend_payments: 'dividend',
};

const CHILD_ACTIVITY_LABEL: Record<ChildCollection, string> = {
  buy_rounds: 'รอบซื้อ',
  realized_trades: 'รายการขาย',
  dividend_payments: 'เงินปันผล',
};

function firebaseUserId(): string {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    throw new Error('กรุณาเข้าสู่ระบบ Firebase ก่อนใช้งานข้อมูลพอร์ต');
  }
  return uid;
}

function userCollection(name: string) {
  const firestore = db;
  if (!firestore) throw new Error('Firebase Firestore ยังไม่ได้ตั้งค่า');
  return collection(firestore, 'users', firebaseUserId(), name);
}

function userDocument(name: string, id: string) {
  const firestore = db;
  if (!firestore) throw new Error('Firebase Firestore ยังไม่ได้ตั้งค่า');
  return doc(firestore, 'users', firebaseUserId(), name, id);
}

function childCollection(stockId: string, name: ChildCollection) {
  return collection(userDocument('stocks', stockId), name);
}

function withId<T>(id: string, value: Record<string, unknown>): T {
  return { ...value, id } as T;
}

async function loadStockChildren(id: string, data: Record<string, unknown>): Promise<StockBundle> {
  const [buySnap, sellSnap, dividendSnap] = await Promise.all([
    getDocs(childCollection(id, 'buy_rounds')),
    getDocs(childCollection(id, 'realized_trades')),
    getDocs(childCollection(id, 'dividend_payments')),
  ]);

  return normalizeStock({
    ...withId<Stock>(id, data),
    buy_rounds: buySnap.docs.map((item) => withId<BuyRound>(item.id, item.data())),
    realized_trades: sellSnap.docs.map((item) => withId<RealizedTrade>(item.id, item.data())),
    dividend_payments: dividendSnap.docs.map((item) => withId<DividendPayment>(item.id, item.data())),
  } as StockBundle);
}

async function firebaseStock(id: string): Promise<StockBundle | null> {
  const stockSnap = await getDoc(userDocument('stocks', id));
  return stockSnap.exists() ? loadStockChildren(stockSnap.id, stockSnap.data()) : null;
}

export async function fetchPortfolio(): Promise<StockBundle[]> {
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('stocks')
      .select('*, buy_rounds(*), realized_trades(*), dividend_payments(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as StockBundle[]).map(normalizeStock);
  }

  const snapshot = await getDocs(userCollection('stocks'));
  const stocks = await Promise.all(snapshot.docs.map((item) => loadStockChildren(item.id, item.data())));
  return stocks
    .filter((item): item is StockBundle => Boolean(item))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function fetchStock(id: string): Promise<StockBundle> {
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('stocks')
      .select('*, buy_rounds(*), realized_trades(*), dividend_payments(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return normalizeStock(data as StockBundle);
  }

  const stock = await firebaseStock(id);
  if (!stock) throw new Error('ไม่พบข้อมูลหุ้นนี้');
  return stock;
}

async function fetchStockMetadata(): Promise<Stock[]> {
  if (isFirebaseConfigured) {
    const snapshot = await getDocs(userCollection('stocks'));
    return snapshot.docs.map(item => withId<Stock>(item.id, item.data()));
  }
  const { data, error } = await getSupabase().from('stocks').select('*');
  if (error) throw error;
  return (data ?? []) as Stock[];
}

export async function fetchStockOptions() {
  const stocks = await fetchStockMetadata();
  return {
    ports: Array.from(new Set(stocks.map((stock) => stock.port_type).filter(Boolean))),
    statuses: Array.from(new Set(stocks.map((stock) => stock.status).filter(Boolean))),
    assetTypes: Array.from(new Set(stocks.map((stock) => stock.asset_type).filter(Boolean))),
    platforms: Array.from(new Set(stocks.map((stock) => stock.platform_trade?.trim() || '').filter(Boolean))),
    countries: Array.from(new Set(stocks.map((stock) => stock.country || 'THAI').filter(Boolean))),
  };
}

export async function findDuplicateStock(symbol: string, portType: string, country: string, excludeId?: string) {
  const stocks = await fetchStockMetadata();
  const identity = stockIdentityKey(symbol, portType, country);
  return stocks.find(
    (stock) =>
      stock.id !== excludeId &&
      stockIdentityKey(stock.symbol, stock.port_type, stock.country) === identity,
  );
}

export async function createStock(
  data: Omit<Stock, 'id' | 'created_at' | 'updated_at' | 'buy_rounds' | 'realized_trades' | 'dividend_payments'>,
): Promise<Stock> {
  const now = new Date().toISOString();
  const normalizedData = {
    ...data,
    country: normalizeStockCountry(data.country),
  };
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { data: inserted, error } = await supabase
      .from('stocks')
      .insert(normalizedData)
      .select()
      .single();
    if (error) throw error;
    await recordActivityLog({
      action: 'create',
      category: 'stock',
      target_label: inserted.symbol,
      summary: `เพิ่มหุ้น ${inserted.symbol}`,
      metadata: { stock_id: inserted.id, source: 'portfolio' },
    });
    return inserted as Stock;
  }

  const stockRef = doc(userCollection('stocks'));
  const stock = { ...normalizedData, id: stockRef.id, created_at: now, updated_at: now } as Stock;
  const { id, ...payload } = stock;
  await setDoc(stockRef, payload);
  await recordActivityLog({
    action: 'create',
    category: 'stock',
    target_label: stock.symbol,
    summary: `เพิ่มหุ้น ${stock.symbol}`,
    metadata: { stock_id: stock.id, source: 'portfolio' },
  });
  return stock;
}

export async function updateStock(id: string, data: Partial<Stock>): Promise<void> {
  const before = await fetchStock(id).catch(() => null);
  const normalizedData = data.country === undefined
    ? data
    : { ...data, country: normalizeStockCountry(data.country) };
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { error } = await supabase.from('stocks').update(normalizedData).eq('id', id);
    if (error) throw error;
    await recordActivityLog({
      action: 'update',
      category: 'stock',
      target_label: before?.symbol ?? id,
      summary: `แก้ไขข้อมูลหุ้น ${before?.symbol ?? id}`,
      metadata: { stock_id: id, source: 'portfolio' },
    });
    return;
  }

  const { id: _id, buy_rounds, realized_trades, dividend_payments, ...payload } = normalizedData;
  await setDoc(
    userDocument('stocks', id),
    { ...payload, updated_at: new Date().toISOString() },
    { merge: true },
  );
  await recordActivityLog({
    action: 'update',
    category: 'stock',
    target_label: before?.symbol ?? id,
    summary: `แก้ไขข้อมูลหุ้น ${before?.symbol ?? id}`,
    metadata: { stock_id: id, source: 'portfolio' },
  });
}

async function deleteFirebaseCollection(stockId: string, name: ChildCollection) {
  const snapshot = await getDocs(childCollection(stockId, name));
  for (let start = 0; start < snapshot.docs.length; start += 450) {
    if (!db) throw new Error('Firebase Firestore ยังไม่ได้ตั้งค่า');
    const batch = writeBatch(db);
    snapshot.docs.slice(start, start + 450).forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
}

export async function deleteStock(id: string): Promise<void> {
  const before = await fetchStock(id).catch(() => null);
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { error } = await supabase.from('stocks').delete().eq('id', id);
    if (error) throw error;
    await recordActivityLog({
      action: 'delete',
      category: 'stock',
      target_label: before?.symbol ?? id,
      summary: `ลบหุ้น ${before?.symbol ?? id}`,
      metadata: { stock_id: id, source: 'portfolio' },
    });
    return;
  }

  await Promise.all([
    deleteFirebaseCollection(id, 'buy_rounds'),
    deleteFirebaseCollection(id, 'realized_trades'),
    deleteFirebaseCollection(id, 'dividend_payments'),
  ]);
  await deleteDoc(userDocument('stocks', id));
  await recordActivityLog({
    action: 'delete',
    category: 'stock',
    target_label: before?.symbol ?? id,
    summary: `ลบหุ้น ${before?.symbol ?? id}`,
    metadata: { stock_id: id, source: 'portfolio' },
  });
}

export async function clearPortfolio(): Promise<number> {
  const stocks = await fetchPortfolio();
  let deletedCount = 0;

  try {
    for (const stock of stocks) {
      await deleteStock(stock.id);
      deletedCount += 1;
    }
  } catch (caught: unknown) {
    const detail = caught instanceof Error ? caught.message : 'Unknown error';
    throw new Error(
      `ลบสำเร็จ ${deletedCount} จาก ${stocks.length} หุ้น ก่อนเกิดข้อผิดพลาด: ${detail}`,
    );
  }

  await recordActivityLog({
    action: 'clear',
    category: 'stock',
    target_label: 'Portfolio',
    summary: `ล้างข้อมูลซื้อขายหุ้นทั้งหมด ${deletedCount} หุ้น`,
    metadata: { count: deletedCount, source: 'portfolio_clear' },
  });

  return deletedCount;
}

// Activity labels only need the stock header, not every buy/sell/dividend record.
async function fetchActivityStock(stockId: string): Promise<{ symbol?: string } | null> {
  if (isFirebaseConfigured) {
    const snapshot = await getDoc(userDocument('stocks', stockId));
    return snapshot.exists() ? { symbol: snapshot.data().symbol } : null;
  }
  const { data, error } = await getSupabase().from('stocks').select('symbol').eq('id', stockId).single();
  if (error) throw error;
  return data;
}

export async function addStockChild<T extends { id?: string; stock_id?: string }>(
  stockId: string,
  name: ChildCollection,
  data: Omit<T, 'id' | 'stock_id' | 'created_at'>,
): Promise<string> {
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { data: inserted, error } = await supabase
      .from(name)
      .insert({ ...data, stock_id: stockId })
      .select('id')
      .single();
    if (error) throw error;
    await waitForBestEffort(async () => {
      const stock = await fetchActivityStock(stockId).catch(() => null);
      await recordActivityLog({
        action: 'create',
        category: CHILD_ACTIVITY_CATEGORY[name],
        target_label: stock?.symbol ?? stockId,
        summary: `เพิ่ม${CHILD_ACTIVITY_LABEL[name]}ของ ${stock?.symbol ?? stockId}`,
        metadata: { stock_id: stockId, target_id: inserted.id, source: name },
      });
    }, 'Stock activity log');
    return inserted.id as string;
  }

  const itemRef = doc(childCollection(stockId, name));
  await setDoc(itemRef, {
    ...data,
    stock_id: stockId,
    created_at: new Date().toISOString(),
  });
  await waitForBestEffort(async () => {
    const stock = await fetchActivityStock(stockId).catch(() => null);
    await recordActivityLog({
      action: 'create',
      category: CHILD_ACTIVITY_CATEGORY[name],
      target_label: stock?.symbol ?? stockId,
      summary: `เพิ่ม${CHILD_ACTIVITY_LABEL[name]}ของ ${stock?.symbol ?? stockId}`,
      metadata: { stock_id: stockId, target_id: itemRef.id, source: name },
    });
  }, 'Stock activity log');
  return itemRef.id;
}

export async function updateStockChild(
  stockId: string,
  name: ChildCollection,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { error } = await supabase.from(name).update(data).eq('id', id);
    if (error) throw error;
    await waitForBestEffort(async () => {
      const stock = await fetchActivityStock(stockId).catch(() => null);
      await recordActivityLog({
        action: 'update',
        category: CHILD_ACTIVITY_CATEGORY[name],
        target_label: stock?.symbol ?? stockId,
        summary: `แก้ไข${CHILD_ACTIVITY_LABEL[name]}ของ ${stock?.symbol ?? stockId}`,
        metadata: { stock_id: stockId, target_id: id, source: name },
      });
    }, 'Stock activity log');
    return;
  }
  await setDoc(doc(childCollection(stockId, name), id), data, { merge: true });
  await waitForBestEffort(async () => {
    const stock = await fetchActivityStock(stockId).catch(() => null);
    await recordActivityLog({
      action: 'update',
      category: CHILD_ACTIVITY_CATEGORY[name],
      target_label: stock?.symbol ?? stockId,
      summary: `แก้ไข${CHILD_ACTIVITY_LABEL[name]}ของ ${stock?.symbol ?? stockId}`,
      metadata: { stock_id: stockId, target_id: id, source: name },
    });
  }, 'Stock activity log');
}

export async function deleteStockChild(
  stockId: string,
  name: ChildCollection,
  id: string,
): Promise<void> {
  if (!isFirebaseConfigured) {
    const supabase = getSupabase();
    const { error } = await supabase.from(name).delete().eq('id', id);
    if (error) throw error;
    await waitForBestEffort(async () => {
      const stock = await fetchActivityStock(stockId).catch(() => null);
      await recordActivityLog({
        action: 'delete',
        category: CHILD_ACTIVITY_CATEGORY[name],
        target_label: stock?.symbol ?? stockId,
        summary: `ลบ${CHILD_ACTIVITY_LABEL[name]}ของ ${stock?.symbol ?? stockId}`,
        metadata: { stock_id: stockId, target_id: id, source: name },
      });
    }, 'Stock activity log');
    return;
  }
  await deleteDoc(doc(childCollection(stockId, name), id));
  await waitForBestEffort(async () => {
    const stock = await fetchActivityStock(stockId).catch(() => null);
    await recordActivityLog({
      action: 'delete',
      category: CHILD_ACTIVITY_CATEGORY[name],
      target_label: stock?.symbol ?? stockId,
      summary: `ลบ${CHILD_ACTIVITY_LABEL[name]}ของ ${stock?.symbol ?? stockId}`,
      metadata: { stock_id: stockId, target_id: id, source: name },
    });
  }, 'Stock activity log');
}

export async function fetchAllTrades() {
  const stocks = await fetchPortfolio();
  return stocks.flatMap((stock) =>
    stock.realized_trades.map((trade) => ({
      ...trade,
      symbol: stock.symbol,
      port_type: trade.port_type || stock.port_type,
      country: stock.country,
      asset_type: stock.asset_type,
      stocks: stock,
    })),
  );
}

export async function fetchAllDividends() {
  const stocks = await fetchPortfolio();
  return stocks.flatMap((stock) =>
    stock.dividend_payments.map((payment) => ({
      ...payment,
      symbol: stock.symbol,
      port_type: stock.port_type,
      country: stock.country,
      asset_type: stock.asset_type,
      stocks: stock,
    })),
  );
}

export async function fetchGlobalHistory() {
  const stocks = await fetchPortfolio();
  return {
    buys: stocks.flatMap((stock) =>
      stock.buy_rounds.map((round) => ({ ...round, stocks: stock })),
    ),
    sells: stocks.flatMap((stock) =>
      stock.realized_trades.map((trade) => ({ ...trade, stocks: stock })),
    ),
  };
}

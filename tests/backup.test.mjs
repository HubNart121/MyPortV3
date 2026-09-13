import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_SCHEMA_VERSION,
  completeBackupData,
  createBackupManifest,
  getBackupCategoryCounts,
  getBackupContentChecksum,
  getBackupContentSignature,
} from '../lib/backup.ts';
import { backupDataSchema } from '../lib/security/backup-schema.ts';
import { runRestoreWrites, settleRestoreOperations } from '../lib/restore-operations.ts';

test('failed deletes drain pending work before rollback can run', async () => {
  let finish;
  let finished = false;
  const slow = new Promise((resolve) => { finish = () => { finished = true; resolve(); }; });
  const failure = new Error('delete failed');
  const work = settleRestoreOperations([Promise.reject(failure), slow]);
  let rejected = false;
  const result = work.catch((error) => { rejected = true; assert.equal(error, failure); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rejected, false);
  finish();
  await result;
  assert.equal(finished, true);
  assert.equal(rejected, true);
});

test('snapshot write failure propagates even when BulkWriter close succeeds', async () => {
  const failure = new Error('snapshot write denied');
  let closed = false;
  await assert.rejects(runRestoreWrites((track) => {
    track(Promise.resolve());
    track(Promise.reject(failure));
  }, async () => { closed = true; }), (error) => error === failure);
  assert.equal(closed, true);
});

test('synchronous enqueue failure still drains queued writes and closes writer', async () => {
  const failure = new Error('invalid document');
  let drained = false;
  await assert.rejects(runRestoreWrites((track) => {
    track(new Promise((resolve) => setImmediate(() => { drained = true; resolve(); })));
    throw failure;
  }, async () => {}), (error) => error === failure);
  assert.equal(drained, true);
});

test('successful snapshot writes finish normally', async () => {
  await runRestoreWrites((track) => track(Promise.resolve()), async () => {});
});

function legacyBackup() {
  return {
    version: '4.0 (legacy backup)',
    schema_version: 4,
    exported_at: '2026-08-22T00:00:00.000Z',
    stocks: [{
      id: 'stock-1',
      symbol: 'PTT',
      name: null,
      sector: null,
      status: 'Hold',
      asset_type: 'StockThai',
      port_type: 'Private',
      dividend_per_share: 2,
      current_price: 30,
      target_price: 35,
      graph_url: null,
      link_url: null,
      note: null,
      created_at: '2026-08-22T00:00:00.000Z',
      updated_at: '2026-08-22T00:00:00.000Z',
      buy_rounds: [{
        id: 'buy-1',
        stock_id: 'stock-1',
        buy_date: '2026-08-22',
        price: 30,
        shares: 100,
        note: null,
        link_url: null,
        created_at: '2026-08-22T00:00:00.000Z',
      }],
      realized_trades: [],
    }],
  };
}

test('upgrades a legacy backup with current defaults and manifest', () => {
  const upgraded = completeBackupData(legacyBackup());

  assert.equal(BACKUP_SCHEMA_VERSION, 7);
  assert.equal(upgraded.schema_version, 7);
  assert.equal(upgraded.stocks[0].country, 'THAI');
  assert.equal(upgraded.stocks[0].expected_dividend_per_year, 0);
  assert.equal(upgraded.stocks[0].risk_category, null);
  assert.equal(upgraded.stocks[0].buy_rounds[0].buy_fee, 0);
  assert.equal(upgraded.stocks[0].buy_rounds[0].stock_id, 'stock-1');
  assert.deepEqual(upgraded.stocks[0].dividend_payments, []);
  assert.deepEqual(upgraded.files, []);
  assert.deepEqual(upgraded.informations, []);
  assert.deepEqual(upgraded.cash_transactions, []);
  assert.deepEqual(upgraded.manifest?.excluded_categories, ['activity_logs']);
  assert.deepEqual(upgraded.manifest?.categories, getBackupCategoryCounts(upgraded));
  assert.equal(upgraded.manifest?.content_checksum, getBackupContentChecksum(upgraded));
});

test('preserves the annual expected dividend in a current backup', () => {
  const current = legacyBackup();
  current.stocks[0].expected_dividend_per_year = 11;
  current.stocks[0].risk_category = '🟢 Income / Dividend';
  current.stocks[0].country = ' usa ';

  const completed = completeBackupData(current);

  assert.equal(completed.stocks[0].expected_dividend_per_year, 11);
  assert.equal(completed.stocks[0].risk_category, '🟢 Income / Dividend');
  assert.equal(completed.stocks[0].country, 'USA');
});

function completeCurrentBackup() {
  const backup = legacyBackup();
  Object.assign(backup.stocks[0], {
    risk_category: '🟡 Quality / Core',
    expected_dividend_per_year: 3.25,
    dividend_payments: [{
      id: 'dividend-1',
      stock_id: 'stock-1',
      pay_date: '2026-08-30',
      dividend_per_share: 1.25,
      shares_held: 100,
      tax_pct: 10,
      gross_amount: 125,
      net_amount: 112.5,
      created_at: '2026-08-22T00:00:00.000Z',
    }],
    realized_trades: [{
      id: 'trade-1',
      stock_id: 'stock-1',
      sell_date: '2026-08-31',
      shares: 10,
      sell_price: 34,
      sell_fee: 0.5,
      avg_cost_at_sell: 30,
      profit: 39.5,
      port_type: 'Private',
      created_at: '2026-08-22T00:00:00.000Z',
    }],
  });
  Object.assign(backup.stocks[0].buy_rounds[0], { buy_fee: 0.25 });
  backup.files = [{
    id: 'file-1',
    name: 'Factsheet',
    detail: 'Latest factsheet',
    link: 'https://example.com/factsheet.pdf',
    created_at: '2026-08-22T00:00:00.000Z',
    storage_kind: 'link',
    stored_name: null,
    original_name: null,
    mime_type: null,
    size_bytes: null,
  }];
  backup.informations = [{
    id: 'info-1',
    title: 'Investment thesis',
    link: 'https://example.com/thesis',
    detail: 'Core holding',
    created_at: '2026-08-22T00:00:00.000Z',
  }];
  backup.cash_transactions = [{
    id: 'cash-1',
    transaction_date: '2026-08-22',
    type: 'deposit',
    amount: 5000,
    port_type: 'Private',
    note: 'Initial cash',
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
  }];
  return completeBackupData(backup);
}

test('validates a complete current backup across all eight categories', () => {
  const backup = completeCurrentBackup();
  const parsed = backupDataSchema.safeParse(backup);

  assert.equal(parsed.success, true);
  assert.deepEqual(getBackupCategoryCounts(backup), {
    stocks: 1,
    buy_rounds: 1,
    realized_trades: 1,
    dividend_payments: 1,
    cash_transactions: 1,
    files: 1,
    informations: 1,
    bank_accounts: 0,
  });
  assert.equal(parsed.data.stocks[0].risk_category, '🟡 Quality / Core');
  assert.equal(parsed.data.stocks[0].expected_dividend_per_year, 3.25);
  assert.equal(parsed.data.stocks[0].country, 'THAI');
});

test('rejects invalid risk categories and inconsistent manifests', () => {
  const invalidRisk = structuredClone(completeCurrentBackup());
  invalidRisk.stocks[0].risk_category = 'High Risk';
  assert.equal(backupDataSchema.safeParse(invalidRisk).success, false);

  const invalidCount = structuredClone(completeCurrentBackup());
  invalidCount.manifest.categories.stocks = 2;
  assert.equal(backupDataSchema.safeParse(invalidCount).success, false);
});

test('rejects changed v7 content and keeps legacy v6 checksum optional', () => {
  const changed = structuredClone(completeCurrentBackup());
  changed.stocks[0].current_price += 1;
  assert.equal(backupDataSchema.safeParse(changed).success, false);

  const missingManifest = structuredClone(completeCurrentBackup());
  delete missingManifest.manifest;
  assert.equal(backupDataSchema.safeParse(missingManifest).success, false);

  const legacyV6 = structuredClone(completeCurrentBackup());
  legacyV6.schema_version = 6;
  delete legacyV6.manifest.content_checksum;
  assert.equal(backupDataSchema.safeParse(legacyV6).success, true);
});

test('rejects duplicate child IDs and invalid stock references', () => {
  const duplicate = structuredClone(completeCurrentBackup());
  duplicate.stocks[0].buy_rounds.push(structuredClone(duplicate.stocks[0].buy_rounds[0]));
  duplicate.manifest.categories.buy_rounds = 2;
  assert.equal(backupDataSchema.safeParse(duplicate).success, false);

  const wrongParent = structuredClone(completeCurrentBackup());
  wrongParent.stocks[0].dividend_payments[0].stock_id = 'another-stock';
  assert.equal(backupDataSchema.safeParse(wrongParent).success, false);
});

test('content verification ignores ordering but detects changed values', () => {
  const expected = completeCurrentBackup();
  expected.files.push({ ...expected.files[0], id: 'file-2', name: 'Annual report' });
  const reordered = structuredClone(expected);
  reordered.files.reverse();
  assert.equal(getBackupContentSignature(expected), getBackupContentSignature(reordered));

  const changed = structuredClone(expected);
  changed.stocks[0].expected_dividend_per_year = 9.99;
  assert.notEqual(getBackupContentSignature(expected), getBackupContentSignature(changed));
});

test('accepts legacy v5 manifests without bank accounts and defaults country', () => {
  const old = completeCurrentBackup();
  old.schema_version = 5;
  delete old.bank_accounts;
  delete old.manifest.categories.bank_accounts;
  delete old.stocks[0].country;
  const parsed = backupDataSchema.parse(old);
  assert.equal(parsed.stocks[0].country, 'THAI');
  assert.deepEqual(parsed.bank_accounts, []);
  assert.equal(parsed.manifest.categories.bank_accounts, 0);
});

test('round trips all eight categories including country and bank balances', () => {
  const backup = completeCurrentBackup();
  backup.stocks[0].country = 'JAPAN';
  backup.bank_accounts = [{ id: 'bank-1', account_number: '001-test', account_type: 'Business', balance: 1234.56, note: null, created_at: backup.exported_at, updated_at: backup.exported_at }];
  const expected = completeBackupData(backup);
  const restored = completeBackupData(backupDataSchema.parse(JSON.parse(JSON.stringify(expected))));
  assert.equal(getBackupContentSignature(restored), getBackupContentSignature(expected));
  restored.bank_accounts[0].balance += 1;
  assert.notEqual(getBackupContentSignature(restored), getBackupContentSignature(expected));
  const invalid = structuredClone(expected);
  delete invalid.manifest.categories.bank_accounts;
  assert.equal(backupDataSchema.safeParse(invalid).success, false);
});

test('rejects duplicate stock identities but allows different countries or ports', () => {
  const backup = completeCurrentBackup();
  backup.stocks.push({ ...backup.stocks[0], id: 'stock-2', symbol: ' ptt ', buy_rounds: [], realized_trades: [], dividend_payments: [] });
  backup.manifest = createBackupManifest(backup);
  assert.equal(backupDataSchema.safeParse(backup).success, false);
  backup.stocks[1].country = 'USA';
  backup.manifest = createBackupManifest(backup);
  assert.equal(backupDataSchema.safeParse(backup).success, true);
  backup.stocks[1].country = 'THAI';
  backup.stocks[1].port_type = 'Business';
  backup.manifest = createBackupManifest(backup);
  assert.equal(backupDataSchema.safeParse(backup).success, true);
});

test('platform trade survives backup validation for defaults and custom platforms', () => {
  for (const platform of ['streaming', 'innovestx', 'Dime', 'Custom Broker']) {
    const source = legacyBackup();
    source.stocks[0].platform_trade = platform;
    const parsed = backupDataSchema.parse(completeBackupData(source));
    assert.equal(parsed.stocks[0].platform_trade, platform);
    assert.equal(completeBackupData(parsed).stocks[0].platform_trade, platform);
  }
  assert.equal(backupDataSchema.parse(completeBackupData(legacyBackup())).stocks[0].platform_trade, null);
});

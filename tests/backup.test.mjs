import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_SCHEMA_VERSION,
  completeBackupData,
  getBackupCategoryCounts,
  getBackupContentSignature,
} from '../lib/backup.ts';
import { backupDataSchema } from '../lib/security/backup-schema.ts';

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

  assert.equal(BACKUP_SCHEMA_VERSION, 5);
  assert.equal(upgraded.schema_version, 5);
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
});

test('preserves the annual expected dividend in a current backup', () => {
  const current = legacyBackup();
  current.stocks[0].expected_dividend_per_year = 11;
  current.stocks[0].risk_category = '🟢 Income / Dividend';

  const completed = completeBackupData(current);

  assert.equal(completed.stocks[0].expected_dividend_per_year, 11);
  assert.equal(completed.stocks[0].risk_category, '🟢 Income / Dividend');
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

test('validates a complete current backup across all seven categories', () => {
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
  });
  assert.equal(parsed.data.stocks[0].risk_category, '🟡 Quality / Core');
  assert.equal(parsed.data.stocks[0].expected_dividend_per_year, 3.25);
});

test('rejects invalid risk categories and inconsistent manifests', () => {
  const invalidRisk = structuredClone(completeCurrentBackup());
  invalidRisk.stocks[0].risk_category = 'High Risk';
  assert.equal(backupDataSchema.safeParse(invalidRisk).success, false);

  const invalidCount = structuredClone(completeCurrentBackup());
  invalidCount.manifest.categories.stocks = 2;
  assert.equal(backupDataSchema.safeParse(invalidCount).success, false);
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

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { waitForBestEffort } from '../lib/best-effort.ts';

test('secondary work releases the caller and handles a later rejection', async () => {
  let rejectWork;
  const pending = new Promise((_, reject) => { rejectWork = reject; });
  await waitForBestEffort(() => pending, 'Test log', 5);
  rejectWork(new Error('late log error'));
  await new Promise((resolve) => setImmediate(resolve));
});

test('fast secondary work finishes before returning', async () => {
  let completed = false;
  await waitForBestEffort(async () => { completed = true; }, 'Test log', 100);
  assert.equal(completed, true);
});

function portfolioService(write) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(new URL('../lib/services/portfolioService.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modules = {
    '../best-effort': { waitForBestEffort: (task, label) => waitForBestEffort(task, label, 5) },
    '../stock-country': {
      normalizeStockCountry: (value) => String(value || 'THAI').trim().toUpperCase(),
      stockIdentityKey: (symbol, port, country) => [symbol.trim().toUpperCase(), port.trim(), String(country || 'THAI').trim().toUpperCase()].join('|'),
    },
    '../firebase': { isFirebaseConfigured: true, db: {}, auth: { currentUser: { uid: 'test-user' } } },
    '../supabase': {},
    './activityLogService': { recordActivityLog: async () => {} },
    'firebase/firestore': {
      collection: () => ({}), doc: () => ({ id: 'test-record' }),
      setDoc: write, deleteDoc: write,
      // A stalled post-write read must not hold the financial mutation open.
      getDoc: () => new Promise(() => {}),
    },
  };
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  }});
  return exports;
}

test('buy, sell and dividend writes finish even when the activity lookup stalls', async () => {
  let writes = 0;
  const service = portfolioService(async () => { writes++; });
  for (const collection of ['buy_rounds', 'realized_trades', 'dividend_payments']) {
    assert.equal(await service.addStockChild('stock', collection, {}), 'test-record');
    await service.updateStockChild('stock', collection, 'record', {});
    await service.deleteStockChild('stock', collection, 'record');
  }
  assert.equal(writes, 9);
});

test('financial write failures still reject instead of reporting success', async () => {
  const failure = new Error('permission-denied');
  const service = portfolioService(async () => { throw failure; });
  await assert.rejects(service.addStockChild('stock', 'dividend_payments', {}), failure);
  await assert.rejects(service.updateStockChild('stock', 'buy_rounds', 'record', {}), failure);
  await assert.rejects(service.deleteStockChild('stock', 'realized_trades', 'record'), failure);
});

test('a pending financial write cannot time out into success', async () => {
  let confirmWrite;
  let finished = false;
  const service = portfolioService(() => new Promise((resolve) => { confirmWrite = resolve; }));
  const saving = service.addStockChild('stock', 'dividend_payments', {}).then(() => { finished = true; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(finished, false);
  confirmWrite();
  await saving;
  assert.equal(finished, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStockCountry, stockIdentityKey } from '../lib/stock-country.ts';

test('normalizes countries and gives legacy stocks the THAI default', () => {
  assert.equal(normalizeStockCountry(undefined), 'THAI');
  assert.equal(normalizeStockCountry(' usa '), 'USA');
  assert.equal(normalizeStockCountry('japan'), 'JAPAN');
});

test('stock identity includes symbol, port and company country', () => {
  assert.equal(stockIdentityKey(' main ', 'Private', 'thai'), 'MAIN|Private|THAI');
  assert.notEqual(
    stockIdentityKey('MAIN', 'Private', 'THAI'),
    stockIdentityKey('MAIN', 'Private', 'USA'),
  );
  assert.equal(
    stockIdentityKey('main', 'Private', ' usa '),
    stockIdentityKey('MAIN', 'Private', 'USA'),
  );
});

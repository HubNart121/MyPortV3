import assert from 'node:assert/strict';
import test from 'node:test';
import { calcStats } from '../lib/calculations.ts';
import { summarizePlatformProfit } from '../lib/platform-profit.ts';

function position(platform, port, sellPrice, shares = 10) {
  const stock = { platform_trade: platform, port_type: port, status: 'Hold' };
  return calcStats(stock,
    [{ id: 'buy', buy_date: '2026-01-01', price: 100, shares: 10, buy_fee: 10 }],
    [{ id: 'sell', sell_date: '2026-02-01', sell_price: sellPrice, shares, sell_fee: 5 }]);
}

test('includes sold-out and partially sold stocks with fees, losses and custom platforms', () => {
  const stocks = [position('Dime', 'Private', 120), position('Dime', 'Business', 90, 5),
    position('My Broker', 'Private', 101), position(null, 'Private', 110)];
  const data = summarizePlatformProfit(stocks);
  assert.equal(data.find((row) => row.name === 'Dime').profit, 125);
  assert.equal(data.find((row) => row.name === 'Dime').tradeCount, 2);
  assert.equal(data.find((row) => row.name === 'My Broker').profit, -5);
  assert.equal(data.find((row) => row.name === 'ไม่ระบุ').profit, 85);
  assert.equal(data.reduce((sum, row) => sum + row.profit, 0),
    stocks.reduce((sum, stock) => sum + stock.total_realized_profit, 0));
  assert.equal(summarizePlatformProfit(stocks.filter((s) => s.port_type === 'Business'))[0].profit, -60);
});

test('preserves break-even sales and excludes positions without sales', () => {
  const even = position('streaming', 'Private', 101.5);
  assert.deepEqual(summarizePlatformProfit([even]), [{ name: 'streaming', profit: 0, tradeCount: 1 }]);
  assert.deepEqual(summarizePlatformProfit([{ realized_trades: [], total_realized_profit: 0 }]), []);
  assert.deepEqual(summarizePlatformProfit([]), []);
});

test('groups only selected trades and matches the performance total', async () => {
  const { summarizeFilteredPlatformProfit } = await import('../lib/platform-profit.ts');
  const stocks = [{ id: 'a', platform_trade: 'Dime' }, { id: 'b', platform_trade: 'streaming' }];
  const trades = [
    { stock_id: 'a', sell_date: '2025-12-31', profit: 900 },
    { stock_id: 'a', sell_date: '2026-09-01', profit: 100 },
    { stock_id: 'a', sell_date: '2026-09-12', profit: -20 },
    { stock_id: 'b', sell_date: '2026-09-12', profit: 50 },
    { stock_id: 'missing', sell_date: '2026-09-13', profit: -5 },
  ];
  const selected = trades.filter(t => t.sell_date >= '2026-09-01' && t.sell_date <= '2026-09-12');
  const grouped = summarizeFilteredPlatformProfit(selected, stocks);
  assert.deepEqual(grouped, [
    { name: 'Dime', profit: 80, tradeCount: 2 },
    { name: 'streaming', profit: 50, tradeCount: 1 },
  ]);
  assert.equal(grouped.reduce((sum, row) => sum + row.profit, 0), selected.reduce((sum, t) => sum + t.profit, 0));
  assert.deepEqual(summarizeFilteredPlatformProfit([], stocks), []);
  assert.equal(summarizeFilteredPlatformProfit(trades, stocks).find(row => row.name === 'ไม่ระบุ').profit, -5);
});

import type { StockWithStats, Stock, RealizedTrade } from './types';

export interface PlatformProfit {
  name: string;
  profit: number;
  tradeCount: number;
}

/** Group the exact trades selected by the performance date and port filters. */
export function summarizeFilteredPlatformProfit(
  trades: Pick<RealizedTrade, 'stock_id' | 'profit'>[],
  stocks: Pick<Stock, 'id' | 'platform_trade'>[],
): PlatformProfit[] {
  const platforms = new Map(stocks.map((stock) => [stock.id, stock.platform_trade?.trim() || 'ไม่ระบุ']));
  const totals = new Map<string, PlatformProfit>();
  for (const trade of trades) {
    const name = platforms.get(trade.stock_id) || 'ไม่ระบุ';
    const item = totals.get(name) ?? { name, profit: 0, tradeCount: 0 };
    item.profit += trade.profit;
    item.tradeCount++;
    totals.set(name, item);
  }
  return [...totals.values()].sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));
}

/** Uses the same recalculated, fee-inclusive realized profit as the dashboard. */
export function summarizePlatformProfit(stocks: StockWithStats[]): PlatformProfit[] {
  const totals = new Map<string, PlatformProfit>();
  for (const stock of stocks) {
    const tradeCount = stock.realized_trades?.length ?? 0;
    if (tradeCount === 0) continue;
    const name = stock.platform_trade?.trim() || 'ไม่ระบุ';
    const item = totals.get(name) ?? { name, profit: 0, tradeCount: 0 };
    item.profit += stock.total_realized_profit;
    item.tradeCount += tradeCount;
    totals.set(name, item);
  }
  return [...totals.values()].sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));
}

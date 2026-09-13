'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  fetchPortfolio,
} from '@/lib/services/portfolioService';
import { fetchCashTransactions } from '@/lib/services/cashTransactionService';
import { calcStats, formatCurrency, formatNumber } from '@/lib/calculations';
import { RISK_CATEGORY, type PortType } from '@/lib/types';
import { DashboardCharts } from '@/components/DashboardCharts';
import { PerformanceAnalytics } from '@/components/PerformanceAnalytics';
import { ToastContainer } from '@/components/Toast';
import { normalizeStockCountry } from '@/lib/stock-country';

export default function DashboardPage() {
  const [filterPort, setFilterPort] = useState<PortType | 'All'>('All');

  const { data: rawStocks = [], isLoading, error } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
  });

  const { data: cashTransactions = [] } = useQuery({
    queryKey: ['cash-transactions'],
    queryFn: fetchCashTransactions,
  });

  const stocks = useMemo(() =>
    rawStocks.map((s) => calcStats(s, s.buy_rounds ?? [], s.realized_trades ?? [], s.dividend_payments ?? [])),
    [rawStocks]
  );

  // Reuse the portfolio request and its recalculated profits for every chart.
  const allTrades = useMemo(() => stocks.flatMap(stock => (stock.realized_trades ?? []).map(trade => ({
    ...trade, symbol: stock.symbol, port_type: trade.port_type || stock.port_type,
  }))), [stocks]);
  const allDividends = useMemo(() => stocks.flatMap(stock => (stock.dividend_payments ?? []).map(payment => ({
    ...payment, symbol: stock.symbol, port_type: stock.port_type,
  }))), [stocks]);

  const uniquePorts = useMemo(() => {
    const ports = new Set<string>();
    rawStocks.forEach((s) => {
      if (s.port_type) ports.add(s.port_type);
    });
    ports.add('Private');
    ports.add('Business');
    return Array.from(ports).sort();
  }, [rawStocks]);

  const dashboardStocks = useMemo(
    () => filterPort === 'All'
      ? stocks
      : stocks.filter((stock) => stock.port_type === filterPort),
    [filterPort, stocks],
  );

  // Portfolio summary stats on Dashboard are scoped only by the top port filter.
  const totalInvested = dashboardStocks.reduce((a, s) => a + s.total_invested, 0);
  const totalExpectedProfit = dashboardStocks.reduce((a, s) => a + s.expected_profit, 0);
  const totalDividend = dashboardStocks.reduce((a, s) => a + s.expected_dividend, 0);
  const expectedDividendYieldPct = totalInvested > 0
    ? (totalDividend / totalInvested) * 100
    : 0;
  const totalRealizedProfit = dashboardStocks.reduce((a, s) => a + s.total_realized_profit, 0);
  const totalReceivedDividend = dashboardStocks.reduce((a, s) => a + s.total_received_dividend, 0);
  const holdCountInFiltered = dashboardStocks.filter((s) => s.status === 'Hold').length;

  const portCashBalance = useMemo(() => {
    const portStocks = filterPort === 'All'
      ? stocks
      : stocks.filter((stock) => stock.port_type === filterPort);
    const portTransactions = filterPort === 'All'
      ? cashTransactions
      : cashTransactions.filter((transaction) => transaction.port_type === filterPort);

    const deposits = portTransactions
      .filter((transaction) => transaction.type === 'deposit')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const withdrawals = portTransactions
      .filter((transaction) => transaction.type === 'withdrawal')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const currentInvestment = portStocks.reduce((sum, stock) => sum + stock.total_invested, 0);
    const realizedProfit = portStocks.reduce((sum, stock) => sum + stock.total_realized_profit, 0);
    const receivedDividend = portStocks.reduce((sum, stock) => sum + stock.total_received_dividend, 0);

    return (deposits - withdrawals) - currentInvestment + realizedProfit + receivedDividend;
  }, [cashTransactions, filterPort, stocks]);

  // Realized Trade Win / Loss stats for top summary
  const topTradeStats = useMemo(() => {
    const trades = filterPort === 'All' ? allTrades : allTrades.filter((t) => (t.port_type || 'Private') === filterPort);
    let winCount = 0;
    let lossCount = 0;
    let maxGainPct = 0;
    let maxLossPct = 0;

    trades.forEach((t) => {
      if (t.profit > 0) winCount++;
      else if (t.profit < 0) lossCount++;

      const totalCost = t.avg_cost_at_sell && t.avg_cost_at_sell > 0
        ? t.shares * t.avg_cost_at_sell
        : (t.sell_price * t.shares) - (t.sell_fee ?? 0) - t.profit;

      const pct = totalCost > 0 ? (t.profit / totalCost) * 100 : 0;

      if (pct > maxGainPct) maxGainPct = pct;
      if (pct < maxLossPct) maxLossPct = pct;
    });

    const totalClosed = winCount + lossCount;
    const winRate = totalClosed > 0 ? (winCount / totalClosed) * 100 : 0;

    return { winCount, lossCount, totalClosed, winRate, maxGainPct, maxLossPct };
  }, [allTrades, filterPort]);

  // Pie Chart Data
  const portData = useMemo(() => {
    const map: Record<string, number> = {};
    dashboardStocks.forEach(s => {
      if (s.total_invested <= 0) return;
      map[s.port_type] = (map[s.port_type] || 0) + s.total_invested;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [dashboardStocks]);

  const countryData = useMemo(() => {
    const totals = new Map<string, number>();
    dashboardStocks.forEach((stock) => {
      if (stock.total_invested <= 0) return;
      const country = normalizeStockCountry(stock.country);
      totals.set(country, (totals.get(country) ?? 0) + stock.total_invested);
    });
    return Array.from(totals, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [dashboardStocks]);

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    dashboardStocks.forEach(s => {
      if (s.total_invested <= 0) return;
      const key = s.sector || 'Other';
      map[key] = (map[key] || 0) + s.total_invested;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [dashboardStocks]);

  const assetData = useMemo(() => {
    const map: Record<string, number> = {};
    dashboardStocks.forEach(s => {
      if (s.total_invested <= 0) return;
      map[s.asset_type] = (map[s.asset_type] || 0) + s.total_invested;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [dashboardStocks]);

  const riskData = useMemo(() => {
    const map: Record<string, number> = {};
    dashboardStocks.forEach((stock) => {
      if (stock.total_invested <= 0) return;
      const key = stock.risk_category || '⚪ ไม่ระบุ';
      map[key] = (map[key] || 0) + stock.total_invested;
    });

    return [...RISK_CATEGORY, '⚪ ไม่ระบุ']
      .filter((name) => map[name] > 0)
      .map((name) => ({ name, value: map[name] }));
  }, [dashboardStocks]);

  const symbolData = useMemo(() => dashboardStocks
    .filter((stock) => stock.active_shares > 0 && stock.total_invested > 0)
    .map((stock) => ({ name: stock.symbol.toUpperCase(), value: stock.total_invested }))
    .sort((a, b) => b.value - a.value),
  [dashboardStocks]);

  const stackedData = useMemo(() => {
    const portMap: Record<string, any> = {};
    const sectorSet = new Set<string>();
    
    dashboardStocks.forEach(s => {
      if (s.total_invested <= 0) return;
      const port = s.port_type;
      const sector = s.sector || 'Other';
      sectorSet.add(sector);
      
      if (!portMap[port]) {
        portMap[port] = { name: port, total: 0 };
      }
      portMap[port][sector] = (portMap[port][sector] || 0) + s.total_invested;
      portMap[port].total += s.total_invested;
    });
    
    return {
      data: Object.values(portMap).sort((a, b) => b.total - a.total),
      sectors: Array.from(sectorSet).sort()
    };
  }, [dashboardStocks]);

  if (isLoading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="mono" style={{ fontSize: '12px' }}>LOADING PORTFOLIO...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ color: 'var(--red)', fontSize: '13px' }}>
          ⚠ ไม่สามารถโหลดข้อมูลได้: {(error as Error).message}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          กรุณาตรวจสอบ Supabase credentials ใน .env.local
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="animate-fade-in">
        {/* Portfolio Summary */}
        <div className="page-header">
          <div>
            <div className="page-title">PORTFOLIO OVERVIEW</div>
            <div className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
              <span className="mono" style={{ color: 'var(--amber)' }}>{dashboardStocks.length}</span> หุ้นที่แสดง ·{' '}
              <span className="mono" style={{ color: 'var(--amber)' }}>{holdCountInFiltered}</span> Hold (จากทั้งหมด {stocks.length})
            </div>
          </div>
          <Link href="/portfolio" className="btn btn-secondary">
            Portfolio
          </Link>
          <Link href="/stocks/new" className="btn btn-primary">
            + เพิ่มหุ้นใหม่
          </Link>
        </div>

        {/* Prominent Top Port Type Filter Bar */}
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              💼 FILTER BY PORT TYPE:
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                className={`filter-chip ${filterPort === 'All' ? 'active' : ''}`}
                onClick={() => setFilterPort('All')}
                style={{ fontSize: '12px', padding: '4px 14px', fontWeight: 600 }}
              >
                All Ports (พอร์ตทั้งหมด)
              </button>
              {uniquePorts.map((p) => (
                <button
                  key={p}
                  className={`filter-chip ${filterPort === p ? 'active' : ''}`}
                  onClick={() => setFilterPort(p as any)}
                  style={{ fontSize: '12px', padding: '4px 14px', fontWeight: 600 }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          {filterPort !== 'All' && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setFilterPort('All')}
              style={{ color: 'var(--amber)', fontSize: '11px' }}
            >
              ✕ แสดงพอร์ตทั้งหมด ({filterPort})
            </button>
          )}
        </div>

        {/* Row 1 Stats (4 Cards) */}
        <div className="animate-stagger stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '12px' }}>
          <div className="stat-card">
            <div className="stat-label">เงินลงทุนปัจจุบัน</div>
            <div className="stat-value amber">{formatCurrency(totalInvested)}</div>
            <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>Current holdings only</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `2px solid ${portCashBalance >= 0 ? '#4A9EF5' : 'var(--red)'}` }}>
            <div className="stat-label">เงินคงเหลือในพอร์ต</div>
            <div
              className={`stat-value ${portCashBalance >= 0 ? '' : 'red'}`}
              style={{ color: portCashBalance >= 0 ? '#4A9EF5' : undefined }}
            >
              {formatCurrency(portCashBalance)}
            </div>
            <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
              ฝากสุทธิ − ทุนปัจจุบัน + กำไรขาย + ปันผลรับจริง · {filterPort === 'All' ? 'ทุกพอร์ต' : filterPort}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">เงินปันผลคาดการณ์/ปี</div>
            <div className="stat-value violet">{formatCurrency(totalDividend)}</div>
            <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
              คิดเป็น <strong className="mono violet">{formatNumber(expectedDividendYieldPct)}%</strong> ของเงินลงทุนปัจจุบัน
            </div>
          </div>
          <div className="stat-card" style={{ borderLeft: '2px solid var(--green)' }}>
            <div className="stat-label">ปันผลที่ได้รับจริง</div>
            <div className="stat-value green">{formatCurrency(totalReceivedDividend)}</div>
            <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>Actual net dividend received</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">กำไรสุทธิคาดการณ์</div>
            <div className={`stat-value ${totalExpectedProfit >= 0 ? 'green' : 'red'}`}>
              {formatCurrency(totalExpectedProfit)}
            </div>
            <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>Unrealized performance</div>
          </div>
        </div>

        {/* Row 2 Realized Trades Stats (Move "กำไรที่ทำได้จริง" & "WIN/LOSS" to Row 2) */}
        <div className="animate-stagger stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: '32px' }}>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--amber)' }}>
            <div className="stat-label">กำไรที่ทำได้จริง</div>
            <div className={`stat-value ${totalRealizedProfit >= 0 ? 'green' : 'red'}`}>
              {formatCurrency(totalRealizedProfit)}
            </div>
            <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>Total realized (closed trades)</div>
          </div>

          <div className="stat-card" style={{ borderLeft: '3px solid #B06AE0' }}>
            <div className="stat-label">สถิติการปิดขาย (WIN / LOSS)</div>
            <div className="stat-value mono" style={{ fontSize: '18px', display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--green)', fontWeight: 700 }}>Win {topTradeStats.winCount}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>/</span>
              <span style={{ color: 'var(--red)', fontWeight: 700 }}>Loss {topTradeStats.lossCount}</span>
              {topTradeStats.totalClosed > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                  ({topTradeStats.winRate.toFixed(0)}% Win)
                </span>
              )}
            </div>
            <div className="stat-sub" style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', flexWrap: 'wrap' }}>
              <span>
                กำไรสูงสุด:{' '}
                <strong className="green mono">
                  {topTradeStats.maxGainPct > 0 ? `+${topTradeStats.maxGainPct.toFixed(2)}%` : '0.00%'}
                </strong>
              </span>
              <span style={{ color: 'var(--border-bright)' }}>|</span>
              <span>
                ขาดทุนสูงสุด:{' '}
                <strong className="red mono">
                  {topTradeStats.maxLossPct < 0 ? `${topTradeStats.maxLossPct.toFixed(2)}%` : '0.00%'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="divider" />

        {/* Realized Performance & Dividend Analytics Section */}
        {(() => {
          return (
            <PerformanceAnalytics
              allTrades={allTrades}
              allDividends={allDividends}
              selectedPort={filterPort}
              onPortChange={setFilterPort}
              platformStocks={rawStocks}
            />
          );
        })()}

        {/* Charts Section */}
        <DashboardCharts 
          portData={portData} 
          countryData={countryData}
          sectorData={sectorData} 
          assetData={assetData} 
          riskData={riskData}
          symbolData={symbolData}
          stackedData={stackedData}
        />

      </div>
      <ToastContainer />
    </>
  );
}

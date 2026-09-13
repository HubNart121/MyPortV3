'use client';

import { useState, useMemo } from 'react';
import type { RealizedTrade, DividendPayment, Stock } from '@/lib/types';
import { summarizeFilteredPlatformProfit } from '@/lib/platform-profit';
import { PlatformProfitChart } from '@/components/PlatformProfitChart';
import { formatCurrency, formatThaiYear } from '@/lib/calculations';
import { ThaiDateInput } from '@/components/ThaiDateInput';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const CHART_INITIAL_DIMENSION = { width: 1, height: 1 };

interface PerformanceAnalyticsProps {
  allTrades: (RealizedTrade & { symbol: string; port_type?: string })[];
  allDividends: (DividendPayment & { symbol: string; port_type?: string })[];
  selectedPort?: string;
  onPortChange?: (port: string) => void;
  platformStocks?: Pick<Stock, 'id' | 'platform_trade'>[];
}

type PeriodPreset = 'all' | 'this_year' | '6m' | '3m' | 'custom';

const extractCEYear = (dateStr?: string): string => {
  if (!dateStr) return 'Unknown';
  const rawYr = parseInt(dateStr.slice(0, 4), 10);
  if (isNaN(rawYr)) return 'Unknown';
  const yrCE = rawYr > 2400 ? rawYr - 543 : rawYr;
  return String(yrCE);
};

export function PerformanceAnalytics({
  allTrades,
  allDividends,
  selectedPort: externalPort,
  onPortChange,
  platformStocks,
}: PerformanceAnalyticsProps) {
  const [preset, setPreset] = useState<PeriodPreset>('all');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [internalPort, setInternalPort] = useState<string>('All');

  const selectedPort = externalPort !== undefined ? externalPort : internalPort;

  const handlePortSelect = (port: string) => {
    setInternalPort(port);
    if (onPortChange) onPortChange(port);
  };

  // Extract unique port types
  const availablePorts = useMemo(() => {
    const ports = new Set<string>();
    allTrades.forEach((t) => t.port_type && ports.add(t.port_type));
    allDividends.forEach((d) => d.port_type && ports.add(d.port_type));
    ports.add('Private');
    ports.add('Business');
    return ['All', ...Array.from(ports).sort()];
  }, [allTrades, allDividends]);

  // Filter trades, dividends, and buys by Port Type first
  const portFilteredTrades = useMemo(() => {
    if (selectedPort === 'All') return allTrades;
    return allTrades.filter((t) => (t.port_type || 'Private') === selectedPort);
  }, [allTrades, selectedPort]);

  const portFilteredDividends = useMemo(() => {
    if (selectedPort === 'All') return allDividends;
    return allDividends.filter((d) => (d.port_type || 'Private') === selectedPort);
  }, [allDividends, selectedPort]);

  // Compute active date boundaries
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (preset === 'this_year') {
      const yearStart = `${now.getFullYear()}-01-01`;
      return { startDate: yearStart, endDate: todayStr };
    }
    if (preset === '6m') {
      const d = new Date();
      d.setMonth(d.getMonth() - 6);
      return { startDate: d.toISOString().slice(0, 10), endDate: todayStr };
    }
    if (preset === '3m') {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      return { startDate: d.toISOString().slice(0, 10), endDate: todayStr };
    }
    if (preset === 'custom') {
      return { startDate: customStart, endDate: customEnd };
    }
    return { startDate: '', endDate: '' };
  }, [preset, customStart, customEnd]);

  // Filter trades and dividends by date range
  const filteredTrades = useMemo(() => {
    return portFilteredTrades.filter((t) => {
      if (startDate && t.sell_date < startDate) return false;
      if (endDate && t.sell_date > endDate) return false;
      return true;
    });
  }, [portFilteredTrades, startDate, endDate]);

  const filteredDividends = useMemo(() => {
    return portFilteredDividends.filter((d) => {
      if (startDate && d.pay_date < startDate) return false;
      if (endDate && d.pay_date > endDate) return false;
      return true;
    });
  }, [portFilteredDividends, startDate, endDate]);

  const platformProfitData = useMemo(
    () => summarizeFilteredPlatformProfit(filteredTrades, platformStocks ?? []),
    [filteredTrades, platformStocks],
  );

  // Period summary metrics
  const periodRealizedProfit = useMemo(
    () => filteredTrades.reduce((acc, t) => acc + t.profit, 0),
    [filteredTrades]
  );
  const periodNetDividend = useMemo(
    () => filteredDividends.reduce((acc, d) => acc + d.net_amount, 0),
    [filteredDividends]
  );
  const periodTotalReturn = periodRealizedProfit + periodNetDividend;

  // Trade Win / Loss and Max Gain / Loss % Stats
  const tradeStats = useMemo(() => {
    let winCount = 0;
    let lossCount = 0;
    let maxGainPct = 0;
    let maxLossPct = 0;

    filteredTrades.forEach((t) => {
      if (t.profit > 0) winCount++;
      else if (t.profit < 0) lossCount++;

      // Compute Return % for this trade
      const totalCost = t.avg_cost_at_sell && t.avg_cost_at_sell > 0
        ? t.shares * t.avg_cost_at_sell
        : (t.sell_price * t.shares) - (t.sell_fee ?? 0) - t.profit;

      const pct = totalCost > 0 ? (t.profit / totalCost) * 100 : 0;

      if (pct > maxGainPct) maxGainPct = pct;
      if (pct < maxLossPct) maxLossPct = pct;
    });

    const totalClosed = winCount + lossCount;
    const winRate = totalClosed > 0 ? (winCount / totalClosed) * 100 : 0;

    return {
      winCount,
      lossCount,
      totalClosed,
      winRate,
      maxGainPct,
      maxLossPct,
    };
  }, [filteredTrades]);

  // Yearly breakdown data — uses filtered data when a period is active, all-time when 'all'
  const yearlyData = useMemo(() => {
    const trades = preset === 'all' ? portFilteredTrades : filteredTrades;
    const dividends = preset === 'all' ? portFilteredDividends : filteredDividends;
    const map: Record<string, { year: string; realizedProfit: number; netDividend: number; total: number }> = {};
    const createYear = (year: string) => ({ year, realizedProfit: 0, netDividend: 0, total: 0 });

    trades.forEach((t) => {
      const yr = extractCEYear(t.sell_date);
      if (!map[yr]) map[yr] = createYear(yr);
      map[yr].realizedProfit += t.profit;
      map[yr].total += t.profit;
    });

    dividends.forEach((d) => {
      const yr = extractCEYear(d.pay_date);
      if (!map[yr]) map[yr] = createYear(yr);
      map[yr].netDividend += d.net_amount;
      map[yr].total += d.net_amount;
    });

    const list = Object.values(map);
    list.sort((a, b) => a.year.localeCompare(b.year));
    return list;
  }, [portFilteredTrades, portFilteredDividends, filteredTrades, filteredDividends, preset]);

  // Table sorted descending
  const yearlyTableData = useMemo(() => {
    return [...yearlyData].sort((a, b) => b.year.localeCompare(a.year));
  }, [yearlyData]);

  const monthlyDividendData = useMemo(() => {
    const dividends = preset === 'all' ? portFilteredDividends : filteredDividends;
    const map: Record<string, { year: string; months: number[]; total: number }> = {};

    dividends.forEach((dividend) => {
      const year = extractCEYear(dividend.pay_date);
      const monthIndex = Number(dividend.pay_date.slice(5, 7)) - 1;
      if (year === 'Unknown' || monthIndex < 0 || monthIndex > 11) return;
      if (!map[year]) map[year] = { year, months: Array(12).fill(0), total: 0 };
      const netAmount = Number(dividend.net_amount);
      map[year].months[monthIndex] += netAmount;
      map[year].total += netAmount;
    });

    return Object.values(map)
      .map((row) => {
        const annualTotalCents = Math.round(row.total * 100);
        const monthCents = row.months.map((amount) => Math.round(amount * 100));
        const displayedMonthTotalCents = monthCents.reduce((sum, amount) => sum + amount, 0);
        const roundingDifferenceCents = annualTotalCents - displayedMonthTotalCents;
        const lastPaidMonth = monthCents.findLastIndex((amount) => amount !== 0);

        if (roundingDifferenceCents !== 0 && lastPaidMonth >= 0) {
          monthCents[lastPaidMonth] += roundingDifferenceCents;
        }

        return {
          year: row.year,
          months: monthCents.map((amount) => amount / 100),
          total: annualTotalCents / 100,
        };
      })
      .sort((a, b) => b.year.localeCompare(a.year));
  }, [filteredDividends, portFilteredDividends, preset]);

  const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-bright)',
            padding: '10px 14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            borderRadius: '2px',
          }}
        >
          <div className="mono" style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 700, marginBottom: '6px' }}>
            ปี พ.ศ. {formatThaiYear(label)}
          </div>
          {payload.map((item: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
              <span className="mono" style={{ fontSize: '11px', color: item.color }}>
                {item.name}:
              </span>
              <span className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
          {payload.length > 1 && (
            <div
              style={{
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <span className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>
                รวมผลตอบแทน:
              </span>
              <span className="mono green" style={{ fontSize: '11px', fontWeight: 700 }}>
                {formatCurrency((payload[0]?.value || 0) + (payload[1]?.value || 0))}
              </span>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const hasAnalyticsData = allTrades.length > 0 || allDividends.length > 0;

  if (!hasAnalyticsData) return null;

  return (
    <div className="performance-analytics" style={{ marginBottom: '32px' }}>
      {/* Section Header */}
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div
          className="panel-header"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div>
            <div className="panel-title" style={{ fontSize: '15px' }}>
              📊 วิเคราะห์ผลตอบแทนจริง & ปันผลสุทธิ (Realized Performance Analytics)
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              สรุปรายได้จากกำไรการขายและเงินปันผลสุทธิรับจริงตามช่วงเวลา
            </div>
          </div>

          {/* Presets & Port Filter Control Bar */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Port Type Filter */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', background: 'var(--bg-primary)', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '6px', fontWeight: 600 }}>Port:</span>
              {availablePorts.map((p) => (
                <button
                  key={p}
                  className={`btn btn-xs ${selectedPort === p ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={() => handlePortSelect(p)}
                >
                  {p === 'All' ? 'ทั้งหมด' : p}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className={`btn btn-sm ${preset === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPreset('all')}
              >
                ทั้งหมด
              </button>
              <button
                className={`btn btn-sm ${preset === 'this_year' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPreset('this_year')}
              >
                ปีนี้ (พ.ศ. {formatThaiYear(new Date().getFullYear())})
              </button>
              <button
                className={`btn btn-sm ${preset === '6m' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPreset('6m')}
              >
                6 เดือนล่าสุด
              </button>
              <button
                className={`btn btn-sm ${preset === '3m' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPreset('3m')}
              >
                3 เดือนล่าสุด
              </button>
              <button
                className={`btn btn-sm ${preset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setPreset('custom')}
              >
                กำหนดเอง...
              </button>
            </div>
          </div>
        </div>

        {/* Custom Range Inputs */}
        {preset === 'custom' && (
          <div className="performance-custom-range">
            <div className="performance-date-field">
              <span>ตั้งแต่วันที่ (พ.ศ.)</span>
              <ThaiDateInput value={customStart} onChange={setCustomStart} />
            </div>
            <div className="performance-date-field">
              <span>ถึงวันที่ (พ.ศ.)</span>
              <ThaiDateInput value={customEnd} onChange={setCustomEnd} />
            </div>
            {(customStart || customEnd) && (
              <button
                className="btn btn-ghost btn-sm performance-date-clear"
                onClick={() => {
                  setCustomStart('');
                  setCustomEnd('');
                }}
              >
                ✕ เคลียร์วันที่
              </button>
            )}
          </div>
        )}
      </div>

      {/* Period Summary Cards */}
      <div className="animate-stagger stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card" style={{ borderLeft: '3px solid var(--amber)' }}>
          <div className="stat-label">กำไรจากการขายจริง</div>
          <div className={`stat-value mono ${periodRealizedProfit >= 0 ? 'amber' : 'red'}`}>
            {formatCurrency(periodRealizedProfit)}
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
            {filteredTrades.length} รายการขายในช่วงเวลาที่เลือก
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid var(--green)' }}>
          <div className="stat-label">เงินปันผลสุทธิรับจริง</div>
          <div className="stat-value green mono">{formatCurrency(periodNetDividend)}</div>
          <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
            {filteredDividends.length} รายการปันผลหลังหักภาษี
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #3A8FE0' }}>
          <div className="stat-label">ผลตอบแทนรวมจริง</div>
          <div className={`stat-value mono ${periodTotalReturn >= 0 ? 'green' : 'red'}`}>
            {formatCurrency(periodTotalReturn)}
          </div>
          <div className="stat-sub" style={{ color: 'var(--text-secondary)' }}>
            กำไรจากการขาย + เงินปันผลรับจริง
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '3px solid #B06AE0' }}>
          <div className="stat-label">สถิติการปิดขาย (WIN / LOSS)</div>
          <div className="stat-value mono" style={{ fontSize: '18px', display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--green)', fontWeight: 700 }}>Win {tradeStats.winCount}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>/</span>
            <span style={{ color: 'var(--red)', fontWeight: 700 }}>Loss {tradeStats.lossCount}</span>
            {tradeStats.totalClosed > 0 && (
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                ({tradeStats.winRate.toFixed(0)}% Win)
              </span>
            )}
          </div>
          <div className="stat-sub" style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '11px', flexWrap: 'wrap' }}>
            <span>
              กำไรสูงสุด:{' '}
              <strong className="green mono">
                {tradeStats.maxGainPct > 0 ? `+${tradeStats.maxGainPct.toFixed(2)}%` : '0.00%'}
              </strong>
            </span>
            <span style={{ color: 'var(--border-bright)' }}>|</span>
            <span>
              ขาดทุนสูงสุด:{' '}
              <strong className="red mono">
                {tradeStats.maxLossPct < 0 ? `${tradeStats.maxLossPct.toFixed(2)}%` : '0.00%'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Yearly Breakdown Chart & Table Grid */}
      {yearlyData.length > 0 && (
        <div className="yearly-performance-grid">
          {/* Yearly Bar Chart */}
          <div className="panel yearly-chart-panel">
            <div className="panel-header">
              <div className="panel-title">เปรียบเทียบผลตอบแทนจริงรายปี (Yearly Performance)</div>
            </div>
            <div className="yearly-chart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={CHART_INITIAL_DIMENSION}
              >
                <BarChart data={yearlyData} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="year"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    className="mono"
                    tickFormatter={(val) => formatThaiYear(val)}
                  />
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={10}
                    tickFormatter={(val) => `฿${val / 1000}k`}
                    className="mono"
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)', opacity: 0.4 }} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="rect"
                    wrapperStyle={{ paddingBottom: '16px' }}
                    formatter={(val) => (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '10px', fontFamily: 'Space Mono' }}>
                        {val}
                      </span>
                    )}
                  />
                  <Bar dataKey="realizedProfit" name="กำไรจากการขาย" fill="#F5A623" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="netDividend" name="เงินปันผลสุทธิ" fill="#27AE60" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Yearly Summary Table */}
          <div className="panel yearly-table-panel">
            <div className="panel-header">
              <div className="panel-title">ตารางสรุปผลตอบแทนรายปี (พ.ศ.)</div>
            </div>
            <div className="yearly-table-scroll">
              <table className="data-table yearly-summary-table">
                <thead>
                  <tr>
                    <th>ปี (พ.ศ.)</th>
                    <th style={{ textAlign: 'right' }}>กำไรจากการขาย</th>
                    <th style={{ textAlign: 'right' }}>เงินปันผลสุทธิ</th>
                    <th style={{ textAlign: 'right' }}>ผลตอบแทนรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyTableData.map((row) => (
                    <tr key={row.year}>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--amber)' }}>
                        ปี พ.ศ. {formatThaiYear(row.year)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: row.realizedProfit > 0 ? 'var(--green)' : row.realizedProfit < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                        {row.realizedProfit === 0 ? '—' : formatCurrency(row.realizedProfit)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>
                        {row.netDividend === 0 ? '—' : formatCurrency(row.netDividend)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: row.total >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatCurrency(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-surface)', fontWeight: 700 }}>
                    <td style={{ fontSize: '12px' }}>
                      {preset === 'all' ? 'รวมประวัติทั้งหมด:' : 'รวมในช่วงที่เลือก:'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', color: periodRealizedProfit > 0 ? 'var(--amber)' : periodRealizedProfit < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                      {formatCurrency(periodRealizedProfit)}
                    </td>
                    <td className="mono green" style={{ textAlign: 'right' }}>
                      {formatCurrency(periodNetDividend)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: '14px', color: periodTotalReturn >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {formatCurrency(periodTotalReturn)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="yearly-mobile-cards">
              {yearlyTableData.map((row) => (
                <div className="yearly-mobile-card" key={row.year}>
                  <div className="yearly-mobile-year mono">ปี พ.ศ. {formatThaiYear(row.year)}</div>
                  <div className="yearly-mobile-metrics">
                    <div>
                      <span>กำไรจากการขาย</span>
                      <strong
                        className="mono"
                        style={{ color: row.realizedProfit > 0 ? 'var(--green)' : row.realizedProfit < 0 ? 'var(--red)' : 'var(--text-muted)' }}
                      >
                        {row.realizedProfit === 0 ? '—' : formatCurrency(row.realizedProfit)}
                      </strong>
                    </div>
                    <div>
                      <span>เงินปันผลสุทธิ</span>
                      <strong className="mono" style={{ color: 'var(--green)' }}>
                        {row.netDividend === 0 ? '—' : formatCurrency(row.netDividend)}
                      </strong>
                    </div>
                    <div className="yearly-mobile-total">
                      <span>ผลตอบแทนรวม</span>
                      <strong className="mono" style={{ color: row.total >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatCurrency(row.total)}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}

              <div className="yearly-mobile-grand-total">
                <span>{preset === 'all' ? 'รวมประวัติทั้งหมด' : 'รวมในช่วงที่เลือก'}</span>
                <strong className="mono" style={{ color: periodTotalReturn >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {formatCurrency(periodTotalReturn)}
                </strong>
                <small className="mono">
                  ขาย {formatCurrency(periodRealizedProfit)} · ปันผล {formatCurrency(periodNetDividend)}
                </small>
              </div>
            </div>

            {monthlyDividendData.length > 0 && (
              <div className="monthly-dividend-section">
                <div className="panel-header monthly-dividend-header">
                  <div>
                    <div className="panel-title">ตารางเงินปันผลสุทธิรายเดือน (พ.ศ.)</div>
                    <div className="monthly-dividend-subtitle">ยอดรับจริงหลังหักภาษี · {selectedPort === 'All' ? 'ทุกพอร์ต' : selectedPort}</div>
                  </div>
                </div>
                <div className="monthly-dividend-scroll">
                  <table className="data-table monthly-dividend-table">
                    <thead>
                      <tr>
                        <th>ปี (พ.ศ.)</th>
                        {monthLabels.map((month) => (
                          <th key={month} style={{ textAlign: 'right' }}>{month}</th>
                        ))}
                        <th style={{ textAlign: 'right' }}>รวมทั้งปี</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyDividendData.map((row) => (
                        <tr key={row.year}>
                          <td className="mono monthly-dividend-year">{formatThaiYear(row.year)}</td>
                          {row.months.map((amount, monthIndex) => (
                            <td key={`${row.year}-${monthIndex}`} className="mono monthly-dividend-value">
                              {amount === 0 ? '—' : formatCurrency(amount)}
                            </td>
                          ))}
                          <td className="mono monthly-dividend-total">{formatCurrency(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {platformStocks && (
        <div style={{ marginTop: '24px' }}>
          <PlatformProfitChart data={platformProfitData} />
        </div>
      )}
    </div>
  );
}

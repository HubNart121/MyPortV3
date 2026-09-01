'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchPortfolio } from '@/lib/services/portfolioService';
import { calcStats } from '@/lib/calculations';
import type { AssetType, PortType, StockStatus } from '@/lib/types';
import { FilterBar } from '@/components/FilterBar';
import type { RealizedOutcomeFilter, RiskCategoryFilter } from '@/components/FilterBar';
import { StockCard } from '@/components/StockCard';
import { ToastContainer } from '@/components/Toast';

function yearFromDate(dateValue?: string | null) {
  if (!dateValue) return null;
  const yearMatch = dateValue.match(/^(\d{4})/);
  if (yearMatch) return yearMatch[1];

  const parsedDate = new Date(dateValue);
  return Number.isNaN(parsedDate.getTime()) ? null : String(parsedDate.getFullYear());
}

export default function PortfolioPage() {
  const [filterStatus, setFilterStatus] = useState<StockStatus | 'All'>('All');
  const [realizedOutcome, setRealizedOutcome] = useState<RealizedOutcomeFilter>('All');
  const [filterType, setFilterType] = useState<AssetType | 'All'>('All');
  const [filterPort, setFilterPort] = useState<PortType | 'All'>('All');
  const [filterRiskCategory, setFilterRiskCategory] = useState<RiskCategoryFilter>('All');
  const [filterYear, setFilterYear] = useState('All');
  const [activeSort, setActiveSort] = useState<string>('created_desc');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: rawStocks = [], isLoading, error } = useQuery({
    queryKey: ['portfolio'],
    queryFn: fetchPortfolio,
  });

  const stocks = useMemo(
    () => rawStocks.map((s) => calcStats(s, s.buy_rounds ?? [], s.realized_trades ?? [], s.dividend_payments ?? [])),
    [rawStocks],
  );

  const uniquePorts = useMemo(() => {
    const ports = new Set<string>();
    rawStocks.forEach((s) => {
      if (s.port_type) ports.add(s.port_type);
    });
    ports.add('Private');
    ports.add('Business');
    return Array.from(ports).sort();
  }, [rawStocks]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();

    rawStocks.forEach((stock) => {
      const dates = [
        stock.created_at,
        ...(stock.buy_rounds ?? []).map((round) => round.buy_date),
        ...(stock.realized_trades ?? []).map((trade) => trade.sell_date),
      ];

      dates.forEach((dateValue) => {
        const year = yearFromDate(dateValue);
        if (year) years.add(year);
      });
    });

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [rawStocks]);

  const filtered = useMemo(() => {
    let result = stocks.filter((s) => {
      const statusOk = filterStatus === 'All' || s.status === filterStatus;
      const realizedOutcomeOk =
        filterStatus !== 'Sold Off'
        || realizedOutcome === 'All'
        || (realizedOutcome === 'Profit' && s.total_realized_profit > 0)
        || (realizedOutcome === 'Loss' && s.total_realized_profit < 0);
      const typeOk = filterType === 'All' || s.asset_type === filterType;
      const portOk = filterPort === 'All' || s.port_type === filterPort;
      const riskCategoryOk = filterRiskCategory === 'All'
        || (filterRiskCategory === 'Unspecified' && !s.risk_category)
        || s.risk_category === filterRiskCategory;
      const buyYears = (s.buy_rounds ?? []).map((round) => yearFromDate(round.buy_date));
      const sellYears = (s.realized_trades ?? []).map((trade) => yearFromDate(trade.sell_date));
      const relevantYears = filterStatus === 'Sold Off'
        ? sellYears
        : filterStatus === 'All'
          ? [...buyYears, ...sellYears]
          : buyYears;
      const fallbackYear = yearFromDate(s.created_at);
      const yearOk = filterYear === 'All'
        || (relevantYears.length > 0
          ? relevantYears.includes(filterYear)
          : fallbackYear === filterYear);
      const searchOk = searchQuery === '' || s.symbol.toUpperCase().includes(searchQuery.toUpperCase());
      return statusOk && realizedOutcomeOk && typeOk && portOk && riskCategoryOk && yearOk && searchOk;
    });

    result = result.sort((a, b) => {
      switch (activeSort) {
        case 'symbol_asc':
          return a.symbol.localeCompare(b.symbol);
        case 'invested_desc':
          return b.total_invested - a.total_invested;
        case 'profit_desc':
          return filterStatus === 'Sold Off'
            ? b.total_realized_profit - a.total_realized_profit
            : b.expected_profit - a.expected_profit;
        case 'profit_asc':
          return filterStatus === 'Sold Off'
            ? a.total_realized_profit - b.total_realized_profit
            : a.expected_profit - b.expected_profit;
        case 'yield_desc':
          return (b.dividend_yield_pct || 0) - (a.dividend_yield_pct || 0);
        case 'created_desc':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return result;
  }, [stocks, filterStatus, realizedOutcome, filterType, filterPort, filterRiskCategory, filterYear, activeSort, searchQuery]);

  const handleStatusChange = (status: StockStatus | 'All') => {
    setFilterStatus(status);
    if (status !== 'Sold Off') {
      setRealizedOutcome('All');
    }
  };

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
      </div>
    );
  }

  return (
    <>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <div className="page-title">PORTFOLIO</div>
            <div className="page-subtitle">รายการหุ้นทั้งหมด พร้อมตัวกรอง ค้นหา และเรียงลำดับ</div>
          </div>
          <Link href="/stocks/new" className="btn btn-primary">
            + เพิ่มหุ้นใหม่
          </Link>
        </div>

        <FilterBar
          onStatusChange={handleStatusChange}
          onRealizedOutcomeChange={setRealizedOutcome}
          onAssetTypeChange={setFilterType}
          onPortChange={setFilterPort}
          onRiskCategoryChange={setFilterRiskCategory}
          onYearChange={setFilterYear}
          onSortChange={setActiveSort}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeStatus={filterStatus}
          activeRealizedOutcome={realizedOutcome}
          activeType={filterType}
          activePort={filterPort}
          activeRiskCategory={filterRiskCategory}
          activeYear={filterYear}
          activeSort={activeSort}
          totalCount={stocks.length}
          filteredCount={filtered.length}
          availablePorts={uniquePorts}
          availableYears={availableYears}
        />

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◈</div>
            <div className="empty-state-title">
              {stocks.length === 0 ? 'ยังไม่มีหุ้นในพอร์ต' : 'ไม่พบหุ้นที่ตรงกับ Filter'}
            </div>
            <div className="empty-state-desc">
              {stocks.length === 0 ? 'เริ่มต้นด้วยการเพิ่มหุ้นตัวแรก' : 'ลองเปลี่ยน Filter เพื่อดูผลลัพธ์อื่น'}
            </div>
            {stocks.length === 0 && (
              <Link href="/stocks/new" className="btn btn-primary">+ เพิ่มหุ้นใหม่</Link>
            )}
          </div>
        ) : (
          <div className="animate-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              className="portfolio-stock-grid-layout desktop-only"
              style={{
                padding: '6px 20px',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--text-muted)',
              }}
            >
              <div>Symbol</div>
              <div>Avg Cost</div>
              <div className="tablet-hide">Invested</div>
              <div className="tablet-hide">Div Yield</div>
              <div className="tablet-hide">
                {filterStatus === 'Sold Off' ? 'Realized P/L' : 'Expected Net'}
              </div>
              <div style={{ textAlign: 'right' }}>Type / Status</div>
            </div>
            {filtered.map((s) => (
              <StockCard key={s.id} stock={s} />
            ))}
          </div>
        )}
      </div>
      <ToastContainer />
    </>
  );
}

'use client';

import { STOCK_STATUS, ASSET_TYPE, PORT_TYPE, RISK_CATEGORY, STOCK_COUNTRY } from '@/lib/types';
import type { StockStatus, AssetType, PortType, RiskCategory } from '@/lib/types';

export type RealizedOutcomeFilter = 'All' | 'Profit' | 'Loss';
export type RiskCategoryFilter = RiskCategory | 'All' | 'Unspecified';

interface FilterBarProps {
  onStatusChange: (status: StockStatus | 'All') => void;
  onRealizedOutcomeChange: (outcome: RealizedOutcomeFilter) => void;
  onAssetTypeChange: (type: AssetType | 'All') => void;
  onPortChange: (port: PortType | 'All') => void;
  onCountryChange: (country: string) => void;
  onRiskCategoryChange: (category: RiskCategoryFilter) => void;
  onYearChange: (year: string) => void;
  onSortChange: (sort: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeStatus: StockStatus | 'All';
  activeRealizedOutcome: RealizedOutcomeFilter;
  activeType: AssetType | 'All';
  activePort: PortType | 'All';
  activeCountry: string;
  activeRiskCategory: RiskCategoryFilter;
  activeYear: string;
  activeSort: string;
  totalCount: number;
  filteredCount: number;
  availablePorts?: string[];
  availableCountries?: string[];
  availableYears: string[];
}

export function FilterBar({
  onStatusChange,
  onRealizedOutcomeChange,
  onAssetTypeChange,
  onPortChange,
  onCountryChange,
  onRiskCategoryChange,
  onYearChange,
  onSortChange,
  activeStatus,
  activeRealizedOutcome,
  activeType,
  activePort,
  activeCountry,
  activeRiskCategory,
  activeYear,
  activeSort,
  searchQuery,
  onSearchChange,
  totalCount,
  filteredCount,
  availablePorts,
  availableCountries,
  availableYears,
}: FilterBarProps) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          {/* Port Type row */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Filter by Port Type
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className={`filter-chip ${activePort === 'All' ? 'active' : ''}`}
            onClick={() => onPortChange('All')}
          >
            All Ports
          </button>
          {(availablePorts || PORT_TYPE).map((p) => (
            <button
              key={p}
              className={`filter-chip ${activePort === p ? 'active' : ''}`}
              onClick={() => onPortChange(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Filter by Company Country
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className={`filter-chip ${activeCountry === 'All' ? 'active' : ''}`}
            onClick={() => onCountryChange('All')}
          >
            All Countries
          </button>
          {(availableCountries || [...STOCK_COUNTRY]).map((country) => (
            <button
              key={country}
              className={`filter-chip ${activeCountry === country ? 'active' : ''}`}
              onClick={() => onCountryChange(country)}
            >
              {country}
            </button>
          ))}
        </div>
      </div>

      {/* Status row */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Filter by Status
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className={`filter-chip ${activeStatus === 'All' ? 'active' : ''}`}
            onClick={() => onStatusChange('All')}
          >
            All
          </button>
          {STOCK_STATUS.map((s) => (
            <button
              key={s}
              className={`filter-chip ${activeStatus === s ? 'active' : ''}`}
              onClick={() => onStatusChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {activeStatus === 'Sold Off' && (
        <div style={{ marginBottom: '10px', paddingLeft: '12px', borderLeft: '2px solid var(--amber)' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
            Filter Sold Off by Result
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              className={`filter-chip ${activeRealizedOutcome === 'All' ? 'active' : ''}`}
              onClick={() => onRealizedOutcomeChange('All')}
            >
              ทั้งหมด
            </button>
            <button
              className={`filter-chip realized-profit-filter ${activeRealizedOutcome === 'Profit' ? 'active' : ''}`}
              onClick={() => onRealizedOutcomeChange('Profit')}
            >
              กำไร
            </button>
            <button
              className={`filter-chip realized-loss-filter ${activeRealizedOutcome === 'Loss' ? 'active' : ''}`}
              onClick={() => onRealizedOutcomeChange('Loss')}
            >
              ขาดทุน
            </button>
          </div>
        </div>
      )}

      {/* Asset Type row */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Filter by Asset Type
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className={`filter-chip ${activeType === 'All' ? 'active' : ''}`}
            onClick={() => onAssetTypeChange('All')}
          >
            All Types
          </button>
          {ASSET_TYPE.map((t) => (
            <button
              key={t}
              className={`filter-chip ${activeType === t ? 'active' : ''}`}
              onClick={() => onAssetTypeChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Risk Category row */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Filter by Risk Category
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            className={`filter-chip ${activeRiskCategory === 'All' ? 'active' : ''}`}
            onClick={() => onRiskCategoryChange('All')}
          >
            All Risk
          </button>
          {RISK_CATEGORY.map((category) => (
            <button
              key={category}
              className={`filter-chip ${activeRiskCategory === category ? 'active' : ''}`}
              onClick={() => onRiskCategoryChange(category)}
            >
              {category}
            </button>
          ))}
          <button
            className={`filter-chip ${activeRiskCategory === 'Unspecified' ? 'active' : ''}`}
            onClick={() => onRiskCategoryChange('Unspecified')}
          >
            ⚪ ไม่ระบุ
          </button>
        </div>
      </div>

      {/* Year row */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Filter by Year
        </div>
        <select
          aria-label="Filter by Year"
          value={activeYear}
          onChange={(e) => onYearChange(e.target.value)}
          style={{
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            padding: '8px 12px',
            borderRadius: '2px',
            fontFamily: 'Space Mono, monospace',
            fontSize: '11px',
            outline: 'none',
            cursor: 'pointer',
            minWidth: '210px',
          }}
        >
          <option value="All">ทุกปี (All Years)</option>
          {availableYears.map((year) => (
            <option key={year} value={year}>
              พ.ศ. {Number(year) + 543} / {year}
            </option>
          ))}
        </select>
      </div>

      {/* Sort By row */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
          Sort By
        </div>
        <div>
          <select 
            value={activeSort}
            onChange={(e) => onSortChange(e.target.value)}
            style={{ 
              background: 'var(--bg-primary)', 
              color: 'var(--text-primary)', 
              border: '1px solid var(--border)', 
              padding: '6px 12px', 
              borderRadius: '2px',
              fontFamily: 'Space Mono, monospace',
              fontSize: '11px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="created_desc">Latest Added (Default)</option>
            <option value="symbol_asc">Symbol (A-Z)</option>
            <option value="invested_desc">Invested Amount (High-Low)</option>
            <option value="profit_desc">
              {activeStatus === 'Sold Off' ? 'Realized P/L (High-Low)' : 'Expected Profit (High-Low)'}
            </option>
            <option value="profit_asc">
              {activeStatus === 'Sold Off' ? 'Realized P/L (Low-High)' : 'Expected Profit (Low-High)'}
            </option>
            <option value="yield_desc">Div Yield (High-Low)</option>
          </select>
        </div>
      </div>
      </div> {/* Close the left column */}

      {/* Search Input right column */}
      <div style={{ marginBottom: '10px', flex: '1', minWidth: '200px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: '250px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>
            Search Symbol
          </div>
          <div>
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value.toUpperCase())}
              placeholder="e.g. PTT, CPALL, TISCO"
              style={{
                background: 'var(--bg-primary)', 
                color: 'var(--text-primary)', 
                border: '1px solid var(--border)', 
                padding: '8px 12px', 
                borderRadius: '4px',
                fontFamily: 'Space Mono, monospace',
                fontSize: '13px',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>
      </div> {/* Close main flex row */}

      {/* Result count */}
      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-bright)', paddingTop: '12px' }}>
        <span className="mono" style={{ color: 'var(--amber)' }}>{filteredCount}</span>
        <span> of </span>
        <span className="mono">{totalCount}</span>
        <span> stocks</span>
      </div>
    </div>
  );
}

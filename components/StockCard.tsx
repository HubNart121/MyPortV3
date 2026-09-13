'use client';

import type { KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { StockWithStats } from '@/lib/types';
import { formatNumber, formatCurrency } from '@/lib/calculations';
import { StatusBadge, AssetBadge, CountryBadge, PortBadge, RiskBadge } from './Badges';
import { ShareStockButton } from './ShareStockButton';

interface StockCardProps {
  stock: StockWithStats;
}

function formatSignedCurrency(value: number) {
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}

function formatSignedPercent(value: number) {
  const formatted = `${formatNumber(value)}%`;
  return value > 0 ? `+${formatted}` : formatted;
}

export function StockCard({ stock }: StockCardProps) {
  const router = useRouter();
  const isSoldOff = stock.status === 'Sold Off';
  const hasRealizedTrades = (stock.realized_trades?.length ?? 0) > 0;
  const displayedProfit = isSoldOff ? stock.total_realized_profit : stock.expected_profit;
  const profitClass =
    displayedProfit > 0 ? 'profit' : displayedProfit < 0 ? 'loss' : 'neutral';
  const profitLabel = isSoldOff ? 'Realized P/L' : 'Expected Net';

  const computed_dividend = (stock.dividend_per_share || 0) * (stock.total_shares || 0);
  const stockHref = `/stocks/${stock.id}`;

  const openStockDetail = () => {
    router.push(stockHref);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    router.push(stockHref);
  };

  return (
    <div
      className="stock-row portfolio-stock-grid-layout"
      role="link"
      tabIndex={0}
      onClick={openStockDetail}
      onKeyDown={handleRowKeyDown}
      aria-label={`เปิดรายละเอียดหุ้น ${stock.symbol}`}
    >
      {/* Symbol + name */}
      <div>
        <div className="mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--amber)' }}>
          {stock.symbol}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stock.name || '—'}{stock.sector ? ` · ${stock.sector}` : ''}
        </div>
      </div>

      {/* Avg Cost */}
      <div>
        <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
          Avg Cost
        </div>
        <div className="mono" style={{ fontWeight: 700 }}>
          {stock.total_shares > 0 ? formatCurrency(stock.avg_cost) : '—'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {stock.total_shares > 0 ? `${formatNumber(stock.total_shares, 0)} shares` : 'No rounds'}
        </div>
      </div>

      {/* Invested */}
      <div className="tablet-hide">
        <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
          Invested
        </div>
        <div className="mono" style={{ fontWeight: 700 }}>
          {stock.total_shares > 0 ? formatCurrency(stock.total_invested) : '—'}
        </div>
      </div>

      {/* Dividend - Trigger Rebuild */}
      <div className="tablet-hide">
        <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
          Div Yield
        </div>
        <div className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>
          {stock.dividend_yield_pct > 0 ? `${formatNumber(stock.dividend_yield_pct)}%` : '—'}
        </div>
        <div className="mono" style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600, marginTop: '1px' }}>
          {computed_dividend > 0 ? `฿${formatNumber(computed_dividend)}` : ''}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {stock.dividend_per_share > 0 ? `฿${formatNumber(stock.dividend_per_share, 4)}/share` : ''}
        </div>
      </div>

      {/* Expected or realized profit */}
      <div className="tablet-hide">
        <div className="internal-label" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '3px' }}>
          {profitLabel}
        </div>
        <div className={`mono ${profitClass}`} style={{ fontWeight: 700 }}>
          {isSoldOff
            ? (hasRealizedTrades ? formatSignedCurrency(stock.total_realized_profit) : '—')
            : (stock.total_shares > 0 ? formatCurrency(stock.expected_profit) : '—')}
        </div>
        {isSoldOff && hasRealizedTrades && (
          <div className={`mono ${profitClass}`} style={{ fontSize: '11px', fontWeight: 700, marginTop: '1px' }}>
            {stock.realized_profit_pct > 0
              ? 'กำไร '
              : stock.realized_profit_pct < 0
                ? 'ขาดทุน '
                : ''}
            {formatSignedPercent(stock.realized_profit_pct)}
          </div>
        )}
        {!isSoldOff && stock.target_price > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            target ฿{formatNumber(stock.target_price)}
          </div>
        )}
      </div>

      {/* Mobile Only Stats Section */}
      <div className="mobile-stats-grid">
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>Invested</div>
          <div className="mono" style={{ fontSize: '13px', fontWeight: 700 }}>{formatCurrency(stock.total_invested)}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>{profitLabel}</div>
          <div className={`mono ${profitClass}`} style={{ fontSize: '13px', fontWeight: 700 }}>
            {isSoldOff
              ? (hasRealizedTrades ? formatSignedCurrency(stock.total_realized_profit) : '—')
              : formatCurrency(stock.expected_profit)}
          </div>
          {isSoldOff && hasRealizedTrades && (
            <div className={`mono ${profitClass}`} style={{ fontSize: '11px', fontWeight: 700, marginTop: '1px' }}>
              {stock.realized_profit_pct > 0
                ? 'กำไร '
                : stock.realized_profit_pct < 0
                  ? 'ขาดทุน '
                  : ''}
              {formatSignedPercent(stock.realized_profit_pct)}
            </div>
          )}
        </div>
        <div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '2px' }}>Div Yield</div>
          <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)' }}>{formatNumber(stock.dividend_yield_pct)}%</div>
          {stock.total_dividend > 0 && (
            <div className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>฿{formatNumber(stock.total_dividend)}</div>
          )}
        </div>
      </div>

      {/* Badges Container */}
      <div className="stock-badges-container">
        <ShareStockButton
          stockId={stock.id}
          symbol={stock.symbol}
          className="btn btn-ghost btn-sm"
          compact
        />
        <PortBadge portType={stock.port_type} />
        <StatusBadge status={stock.status} />
        <AssetBadge assetType={stock.asset_type} />
        <CountryBadge country={stock.country} />
        {stock.risk_category && <RiskBadge riskCategory={stock.risk_category} />}
      </div>
    </div>
  );
}

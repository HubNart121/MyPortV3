import type { StockStatus, AssetType, PortType, RiskCategory } from '@/lib/types';

interface BadgeProps {
  value: string;
  variant?: 'status' | 'asset';
}

const statusClass: Record<StockStatus, string> = {
  Hold: 'badge-hold',
  'Sold Off': 'badge-sold-off',
  'Plan-buy': 'badge-plan-buy',
  'Plan-sell': 'badge-plan-sell',
  Choice: 'badge-choice',
};

const assetClass: Record<AssetType, string> = {
  StockThai: 'badge-stockthai',
  DR: 'badge-dr',
  ETF: 'badge-etf',
  ReitThai: 'badge-reitthai',
  Fund: 'badge-fund',
  FundAllocation: 'badge-fundallocation',
};

const portClass: Record<PortType, string> = {
  Private: 'badge-private',
  Business: 'badge-business',
};

export function StatusBadge({ status }: { status: StockStatus }) {
  return (
    <span className={`badge ${statusClass[status] ?? ''}`}>
      {status}
    </span>
  );
}

export function AssetBadge({ assetType }: { assetType: AssetType }) {
  return (
    <span className={`badge ${assetClass[assetType] ?? ''}`}>
      {assetType}
    </span>
  );
}

export function PortBadge({ portType }: { portType: PortType }) {
  return (
    <span className={`badge ${portClass[portType] ?? ''}`} style={{ opacity: 0.8 }}>
      {portType}
    </span>
  );
}

export function CountryBadge({ country }: { country: string }) {
  return (
    <span className="badge" style={{ borderColor: 'var(--amber)', color: 'var(--amber)' }}>
      {country || 'THAI'}
    </span>
  );
}

export function RiskBadge({ riskCategory }: { riskCategory: RiskCategory }) {
  const riskLevel = riskCategory.startsWith('🟢')
    ? 'risk-low'
    : riskCategory.startsWith('🟡')
      ? 'risk-medium'
      : riskCategory.startsWith('🟠')
        ? 'risk-high'
        : 'risk-critical';

  return <span className={`badge ${riskLevel}`}>{riskCategory}</span>;
}

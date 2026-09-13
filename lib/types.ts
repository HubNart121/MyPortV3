export const STOCK_STATUS = ['Hold', 'Sold Off', 'Plan-buy', 'Plan-sell', 'Choice'] as const;
export type StockStatus = string;

export const ASSET_TYPE = ['StockThai', 'DR', 'ETF', 'ReitThai', 'Fund', 'FundAllocation'] as const;
export type AssetType = string;

export const PORT_TYPE = ['Private', 'Business'] as const;
export type PortType = string;

export const PLATFORM_TRADE = ['streaming', 'innovestx', 'Dime'] as const;

export const STOCK_COUNTRY = ['THAI', 'USA'] as const;
export type StockCountry = string;

export const RISK_CATEGORY = [
  '🟢 Defensive',
  '🟢 Income / Dividend',
  '🟡 Quality / Core',
  '🟡 Growth',
  '🟠 Cyclical',
  '🟠 Turnaround',
  '🔴 Speculative',
  '🔴 Distressed',
] as const;
export type RiskCategory = typeof RISK_CATEGORY[number];

export const CASH_TRANSACTION_TYPE = ['deposit', 'withdrawal'] as const;
export type CashTransactionType = typeof CASH_TRANSACTION_TYPE[number];

export const BANK_ACCOUNT_TYPE = ['Business', 'Private'] as const;
export type BankAccountType = typeof BANK_ACCOUNT_TYPE[number];

export interface BankAccount {
  id: string;
  account_number: string | null;
  account_type: BankAccountType;
  balance: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashTransaction {
  id: string;
  transaction_date: string;
  type: CashTransactionType;
  amount: number;
  port_type: PortType;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Stock {
  id: string;
  symbol: string;
  name: string | null;
  sector: string | null;
  status: StockStatus;
  asset_type: AssetType;
  port_type: PortType;
  country: StockCountry;
  platform_trade?: string | null;
  risk_category: RiskCategory | null;
  dividend_per_share: number;
  expected_dividend_per_year: number;
  current_price: number;
  target_price: number;
  graph_url: string | null;
  link_url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  buy_rounds?: BuyRound[];
  realized_trades?: RealizedTrade[];
  dividend_payments?: DividendPayment[];
}

export interface RealizedTrade {
  id: string;
  stock_id: string;
  sell_date: string;
  shares: number;
  sell_price: number;
  sell_fee: number;
  avg_cost_at_sell: number;
  profit: number;
  port_type: PortType;
  created_at: string;
}

export interface BuyRound {
  id: string;
  stock_id: string;
  buy_date: string;
  price: number;
  shares: number;
  buy_fee: number;
  note: string | null;
  link_url: string | null;
  created_at: string;
}

export interface DividendPayment {
  id: string;
  stock_id: string;
  pay_date: string;
  dividend_per_share: number;
  shares_held: number;
  tax_pct: number;
  gross_amount: number;
  net_amount: number;
  created_at: string;
}

export interface StockWithStats extends Stock {
  total_shares: number;
  total_invested: number;
  avg_cost: number;
  total_dividend: number;
  expected_dividend: number;
  dividend_yield_pct: number;
  expected_profit: number;
  expected_profit_pct: number;
  current_value: number;
  unrealized_profit: number;
  unrealized_profit_pct: number;
  active_shares: number;
  total_realized_profit: number;
  total_realized_cost_basis: number;
  realized_profit_pct: number;
  total_received_dividend: number;
  total_actual_return: number;
  actual_return_pct: number;
  received_dividend_yield_pct: number;
  total_invested_all_time: number;
}

export interface BackupData {
  version: string;
  schema_version?: number;
  exported_at: string;
  manifest?: BackupManifest;
  stocks: (Stock & { buy_rounds: BuyRound[]; realized_trades: RealizedTrade[]; dividend_payments?: DividendPayment[] })[];
  files?: FileResource[];
  informations?: InfoResource[];
  cash_transactions?: CashTransaction[];
  bank_accounts?: BankAccount[];
}

export interface BackupCategoryCounts {
  stocks: number;
  buy_rounds: number;
  realized_trades: number;
  dividend_payments: number;
  cash_transactions: number;
  files: number;
  informations: number;
  bank_accounts: number;
}

export interface BackupManifest {
  format: 'my-port-v2-backup';
  files_scope: 'metadata-and-links';
  excluded_categories: ['activity_logs'];
  categories: BackupCategoryCounts;
  content_checksum?: string;
}

export interface FileResource {
  id: string;
  name: string;
  detail: string | null;
  link: string | null;
  created_at: string;
  storage_kind?: 'link' | 'local';
  stored_name?: string | null;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
}

export interface InfoResource {
  id: string;
  title: string;
  link: string | null;
  detail: string | null;
  created_at: string;
}

export type ActivityAction = 'create' | 'update' | 'delete' | 'import' | 'clear' | 'restore';
export type ActivityCategory =
  | 'stock'
  | 'buy_round'
  | 'sell'
  | 'dividend'
  | 'cash'
  | 'file'
  | 'information'
  | 'system';

export interface ActivityLog {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: ActivityAction;
  category: ActivityCategory;
  target_label: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}

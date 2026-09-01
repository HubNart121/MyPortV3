import type { BackupCategoryCounts, BackupData, BackupManifest } from './types';

export const BACKUP_SCHEMA_VERSION = 5;

type BackupCollections = Pick<
  BackupData,
  'stocks' | 'files' | 'informations' | 'cash_transactions'
>;

export function getBackupCategoryCounts(backup: BackupCollections): BackupCategoryCounts {
  return {
    stocks: backup.stocks.length,
    buy_rounds: backup.stocks.reduce((sum, stock) => sum + (stock.buy_rounds?.length ?? 0), 0),
    realized_trades: backup.stocks.reduce((sum, stock) => sum + (stock.realized_trades?.length ?? 0), 0),
    dividend_payments: backup.stocks.reduce((sum, stock) => sum + (stock.dividend_payments?.length ?? 0), 0),
    cash_transactions: backup.cash_transactions?.length ?? 0,
    files: backup.files?.length ?? 0,
    informations: backup.informations?.length ?? 0,
  };
}

export function createBackupManifest(backup: BackupCollections): BackupManifest {
  return {
    format: 'my-port-v2-backup',
    files_scope: 'metadata-and-links',
    excluded_categories: ['activity_logs'],
    categories: getBackupCategoryCounts(backup),
  };
}

function sortById<T extends { id: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.id.localeCompare(right.id));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortObjectKeys(item)]),
  );
}

/** Creates an order-independent representation for post-restore data verification. */
export function getBackupContentSignature(backup: BackupCollections): string {
  const comparable = {
    stocks: sortById(backup.stocks).map((stock) => ({
      ...stock,
      buy_rounds: sortById(stock.buy_rounds ?? []),
      realized_trades: sortById(stock.realized_trades ?? []),
      dividend_payments: sortById(stock.dividend_payments ?? []),
    })),
    files: sortById(backup.files ?? []),
    informations: sortById(backup.informations ?? []),
    cash_transactions: sortById(backup.cash_transactions ?? []),
  };

  return JSON.stringify(sortObjectKeys(comparable));
}

export function completeBackupData(backup: BackupData): BackupData {
  const complete = {
    ...backup,
    schema_version: BACKUP_SCHEMA_VERSION,
    files: (backup.files ?? []).map((file) => ({
      ...file,
      detail: file.detail ?? null,
      link: file.link ?? null,
      storage_kind: file.storage_kind ?? 'link',
      stored_name: file.stored_name ?? null,
      original_name: file.original_name ?? null,
      mime_type: file.mime_type ?? null,
      size_bytes: file.size_bytes ?? null,
    })),
    informations: (backup.informations ?? []).map((information) => ({
      ...information,
      link: information.link ?? null,
      detail: information.detail ?? null,
    })),
    cash_transactions: (backup.cash_transactions ?? []).map((transaction) => ({
      ...transaction,
      note: transaction.note ?? null,
    })),
    stocks: backup.stocks.map((stock) => ({
      ...stock,
      name: stock.name ?? null,
      sector: stock.sector ?? null,
      risk_category: stock.risk_category ?? null,
      dividend_per_share: Number(stock.dividend_per_share ?? 0),
      expected_dividend_per_year: Number(stock.expected_dividend_per_year ?? 0),
      current_price: Number(stock.current_price ?? 0),
      target_price: Number(stock.target_price ?? 0),
      graph_url: stock.graph_url ?? null,
      link_url: stock.link_url ?? null,
      note: stock.note ?? null,
      buy_rounds: (stock.buy_rounds ?? []).map((round) => ({
        ...round,
        stock_id: stock.id,
        buy_fee: Number(round.buy_fee ?? 0),
        note: round.note ?? null,
        link_url: round.link_url ?? null,
      })),
      realized_trades: (stock.realized_trades ?? []).map((trade) => ({
        ...trade,
        stock_id: stock.id,
        sell_fee: Number(trade.sell_fee ?? 0),
        port_type: trade.port_type || stock.port_type,
      })),
      dividend_payments: (stock.dividend_payments ?? []).map((payment) => ({
        ...payment,
        stock_id: stock.id,
      })),
    })),
  };

  return {
    ...complete,
    manifest: createBackupManifest(complete),
  };
}

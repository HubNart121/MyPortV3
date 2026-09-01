import { z } from 'zod';
import { BACKUP_SCHEMA_VERSION } from '../backup.ts';
import { RISK_CATEGORY } from '../types.ts';

const shortText = z.string().max(500);
const nullableText = z.string().max(10_000).nullable();
const riskCategory = z.enum(RISK_CATEGORY).nullable();
const positiveOrZero = z.number().finite().nonnegative();
const documentId = z.string().min(1).max(200).refine((value) => !value.includes('/'), {
  message: 'Document ID must not contain a slash',
});

const buyRoundSchema = z.object({
  id: documentId,
  stock_id: documentId,
  buy_date: z.string().min(1).max(64),
  price: positiveOrZero,
  shares: positiveOrZero,
  buy_fee: positiveOrZero.default(0),
  note: nullableText.default(null),
  link_url: nullableText.default(null),
  created_at: z.string().max(64),
});

const realizedTradeSchema = z.object({
  id: documentId,
  stock_id: documentId,
  sell_date: z.string().min(1).max(64),
  shares: positiveOrZero,
  sell_price: positiveOrZero,
  sell_fee: positiveOrZero.default(0),
  avg_cost_at_sell: positiveOrZero,
  profit: z.number().finite(),
  port_type: shortText,
  created_at: z.string().max(64),
});

const dividendPaymentSchema = z.object({
  id: documentId,
  stock_id: documentId,
  pay_date: z.string().min(1).max(64),
  dividend_per_share: positiveOrZero,
  shares_held: positiveOrZero,
  tax_pct: positiveOrZero,
  gross_amount: positiveOrZero,
  net_amount: positiveOrZero,
  created_at: z.string().max(64),
});

const stockSchema = z.object({
  id: documentId,
  symbol: z.string().min(1).max(40),
  name: nullableText,
  sector: nullableText,
  status: shortText,
  asset_type: shortText,
  port_type: shortText,
  risk_category: riskCategory.default(null),
  dividend_per_share: positiveOrZero,
  expected_dividend_per_year: positiveOrZero.default(0),
  current_price: positiveOrZero.default(0),
  target_price: positiveOrZero,
  graph_url: nullableText.default(null),
  link_url: nullableText.default(null),
  note: nullableText,
  created_at: z.string().max(64),
  updated_at: z.string().max(64),
  buy_rounds: z.array(buyRoundSchema).max(5_000),
  realized_trades: z.array(realizedTradeSchema).max(5_000),
  dividend_payments: z.array(dividendPaymentSchema).max(5_000).default([]),
});

const fileSchema = z.object({
  id: documentId,
  name: z.string().min(1).max(500),
  detail: nullableText,
  link: nullableText,
  created_at: z.string().max(64),
  storage_kind: z.enum(['link', 'local']).default('link'),
  stored_name: z.string().uuid().nullable().optional().default(null),
  original_name: z.string().max(500).nullable().optional().default(null),
  mime_type: z.string().max(255).nullable().optional().default(null),
  size_bytes: z.number().int().nonnegative().max(20 * 1024 * 1024).nullable().optional().default(null),
});

const informationSchema = z.object({
  id: documentId,
  title: z.string().min(1).max(500),
  link: nullableText,
  detail: nullableText,
  created_at: z.string().max(64),
});

const cashTransactionSchema = z.object({
  id: documentId,
  transaction_date: z.string().min(1).max(64),
  type: z.enum(['deposit', 'withdrawal']),
  amount: z.number().finite().positive(),
  port_type: shortText,
  note: nullableText,
  created_at: z.string().max(64),
  updated_at: z.string().max(64),
});

export const backupCategoryCountsSchema = z.object({
  stocks: z.number().int().nonnegative(),
  buy_rounds: z.number().int().nonnegative(),
  realized_trades: z.number().int().nonnegative(),
  dividend_payments: z.number().int().nonnegative(),
  cash_transactions: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  informations: z.number().int().nonnegative(),
});

const backupManifestSchema = z.object({
  format: z.literal('my-port-v2-backup'),
  files_scope: z.literal('metadata-and-links'),
  excluded_categories: z.tuple([z.literal('activity_logs')]).default(['activity_logs']),
  categories: backupCategoryCountsSchema,
});

export const backupDataSchema = z.object({
  version: z.string().min(1).max(100),
  schema_version: z.number().int().min(1).max(BACKUP_SCHEMA_VERSION).optional(),
  exported_at: z.string().min(1).max(64),
  manifest: backupManifestSchema.optional(),
  stocks: z.array(stockSchema).max(1_000),
  files: z.array(fileSchema).max(2_000).default([]),
  informations: z.array(informationSchema).max(2_000).default([]),
  cash_transactions: z.array(cashTransactionSchema).max(10_000).default([]),
}).superRefine((backup, context) => {
  const ensureUniqueIds = (
    values: Array<{ id: string }>,
    path: Array<string | number>,
  ) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value.id)) {
        context.addIssue({
          code: 'custom',
          path: [...path, index, 'id'],
          message: `Duplicate document ID: ${value.id}`,
        });
      }
      seen.add(value.id);
    });
  };

  ensureUniqueIds(backup.stocks, ['stocks']);
  ensureUniqueIds(backup.files, ['files']);
  ensureUniqueIds(backup.informations, ['informations']);
  ensureUniqueIds(backup.cash_transactions, ['cash_transactions']);

  backup.stocks.forEach((stock, stockIndex) => {
    const childCollections = [
      ['buy_rounds', stock.buy_rounds],
      ['realized_trades', stock.realized_trades],
      ['dividend_payments', stock.dividend_payments],
    ] as const;

    childCollections.forEach(([name, items]) => {
      ensureUniqueIds(items, ['stocks', stockIndex, name]);
      items.forEach((item, itemIndex) => {
        if (item.stock_id !== stock.id) {
          context.addIssue({
            code: 'custom',
            path: ['stocks', stockIndex, name, itemIndex, 'stock_id'],
            message: `Child record must reference parent stock ${stock.id}`,
          });
        }
      });
    });
  });

  if (!backup.manifest) return;

  const actual = {
    stocks: backup.stocks.length,
    buy_rounds: backup.stocks.reduce((sum, stock) => sum + stock.buy_rounds.length, 0),
    realized_trades: backup.stocks.reduce((sum, stock) => sum + stock.realized_trades.length, 0),
    dividend_payments: backup.stocks.reduce((sum, stock) => sum + stock.dividend_payments.length, 0),
    cash_transactions: backup.cash_transactions.length,
    files: backup.files.length,
    informations: backup.informations.length,
  };

  for (const [category, count] of Object.entries(actual)) {
    if (backup.manifest.categories[category as keyof typeof actual] !== count) {
      context.addIssue({
        code: 'custom',
        path: ['manifest', 'categories', category],
        message: `Backup category count mismatch: ${category}`,
      });
    }
  }
});

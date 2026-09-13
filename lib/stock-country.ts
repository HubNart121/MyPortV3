export const DEFAULT_STOCK_COUNTRY = 'THAI';

export function normalizeStockCountry(value: unknown): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || DEFAULT_STOCK_COUNTRY;
}

export function stockIdentityKey(symbol: string, portType: string, country: unknown): string {
  return [symbol.trim().toUpperCase(), portType.trim(), normalizeStockCountry(country)].join('|');
}

-- 1. Create stocks table
CREATE TABLE IF NOT EXISTS stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  symbol TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  status TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  port_type TEXT NOT NULL DEFAULT 'Private',
  country TEXT NOT NULL DEFAULT 'THAI',
  platform_trade TEXT,
  risk_category TEXT,
  dividend_per_share NUMERIC DEFAULT 0,
  expected_dividend_per_year NUMERIC DEFAULT 0,
  current_price NUMERIC DEFAULT 0,
  target_price NUMERIC DEFAULT 0,
  graph_url TEXT,
  link_url TEXT,
  note TEXT
);

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS graph_url TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS expected_dividend_per_year NUMERIC DEFAULT 0;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS platform_trade TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS risk_category TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'THAI';

-- 2. Create buy_rounds table
CREATE TABLE IF NOT EXISTS buy_rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  buy_date DATE NOT NULL,
  price NUMERIC NOT NULL,
  shares NUMERIC NOT NULL,
  buy_fee NUMERIC NOT NULL DEFAULT 0 CHECK (buy_fee >= 0),
  note TEXT,
  link_url TEXT
);

ALTER TABLE buy_rounds ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE buy_rounds ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE buy_rounds ADD COLUMN IF NOT EXISTS buy_fee NUMERIC NOT NULL DEFAULT 0;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE buy_rounds ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies (Allowing public access for simplification - adjust per your needed security level)
-- Policy for stocks
CREATE POLICY "Enable all access for stocks" ON stocks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Policy for buy_rounds
CREATE POLICY "Enable all access for buy_rounds" ON buy_rounds
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Create realized_trades table
CREATE TABLE IF NOT EXISTS realized_trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  sell_date DATE NOT NULL,
  shares NUMERIC NOT NULL,
  sell_price NUMERIC NOT NULL,
  avg_cost_at_sell NUMERIC NOT NULL,
  profit NUMERIC NOT NULL,
  sell_fee NUMERIC NOT NULL DEFAULT 0 CHECK (sell_fee >= 0),
  port_type TEXT NOT NULL
);

ALTER TABLE realized_trades ADD COLUMN IF NOT EXISTS sell_fee NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE realized_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for realized_trades" ON realized_trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_realized_trades_stock_id ON realized_trades(stock_id);

-- 6.1 Keep status synchronized with actual remaining shares.
\ir 03-auto-stock-status.sql

-- 6.2 Allow the same symbol in different ports.
\ir 05-multi-port-symbol.sql

-- 6.3 Add transaction fees and recalculate trade history.
\ir 06-trading-fees.sql

-- 7. Create files table
CREATE TABLE IF NOT EXISTS files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  detail TEXT,
  link TEXT
);

ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for files" ON files
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 8. Create informations table
CREATE TABLE IF NOT EXISTS informations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  link TEXT,
  detail TEXT
);

ALTER TABLE informations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for informations" ON informations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 9. Create auth_config table for simple authentication
CREATE TABLE IF NOT EXISTS auth_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Ensure only one record exists
  username TEXT NOT NULL DEFAULT 'admin',
  password TEXT NOT NULL DEFAULT 'admin',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE auth_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for auth_config" ON auth_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed initial admin user if not exists
INSERT INTO auth_config (id, username, password) 
VALUES (1, 'admin', 'admin')
ON CONFLICT (id) DO NOTHING;

-- 10. Create login_logs table
CREATE TABLE IF NOT EXISTS login_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  username TEXT,
  ip_address TEXT,
  device TEXT,
  device_type TEXT,
  status TEXT CHECK (status IN ('Success', 'Failed'))
);

ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for login_logs" ON login_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at DESC);

-- 11. Create dividend_payments table
CREATE TABLE IF NOT EXISTS dividend_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stock_id UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  pay_date DATE NOT NULL,
  dividend_per_share NUMERIC NOT NULL,
  shares_held NUMERIC NOT NULL,
  tax_pct NUMERIC NOT NULL DEFAULT 10,
  gross_amount NUMERIC NOT NULL,
  net_amount NUMERIC NOT NULL
);

ALTER TABLE dividend_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for dividend_payments" ON dividend_payments
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dividend_payments_stock_id ON dividend_payments(stock_id);

-- 12. Align Local/Docker with complete Backup JSON v5.
\ir 07-backup-schema-parity.sql

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
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stocks ADD COLUMN IF NOT EXISTS graph_url TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS expected_dividend_per_year NUMERIC DEFAULT 0;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS platform_trade TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS risk_category TEXT;
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'THAI';
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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

ALTER TABLE public.stocks
  DROP CONSTRAINT IF EXISTS stocks_symbol_key;

DROP INDEX IF EXISTS public.stocks_symbol_port_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS stocks_symbol_port_country_key
  ON public.stocks (UPPER(symbol), port_type, UPPER(country));

ALTER TABLE buy_rounds ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE buy_rounds ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE buy_rounds ADD COLUMN IF NOT EXISTS buy_fee NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE buy_rounds DROP CONSTRAINT IF EXISTS buy_rounds_buy_fee_nonnegative;
ALTER TABLE buy_rounds ADD CONSTRAINT buy_rounds_buy_fee_nonnegative CHECK (buy_fee >= 0);

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
ALTER TABLE realized_trades DROP CONSTRAINT IF EXISTS realized_trades_sell_fee_nonnegative;
ALTER TABLE realized_trades ADD CONSTRAINT realized_trades_sell_fee_nonnegative CHECK (sell_fee >= 0);

ALTER TABLE realized_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for realized_trades" ON realized_trades
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_realized_trades_stock_id ON realized_trades(stock_id);

-- 6.1 Keep status synchronized with actual remaining shares.
CREATE OR REPLACE FUNCTION public.sync_stock_status_from_holdings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_stock_id UUID;
  bought_shares NUMERIC;
  sold_shares NUMERIC;
  current_status TEXT;
  next_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_stock_id := OLD.stock_id;
  ELSE
    target_stock_id := NEW.stock_id;
  END IF;

  SELECT COALESCE(SUM(shares), 0)
    INTO bought_shares
    FROM public.buy_rounds
   WHERE stock_id = target_stock_id;

  SELECT COALESCE(SUM(shares), 0)
    INTO sold_shares
    FROM public.realized_trades
   WHERE stock_id = target_stock_id;

  SELECT status
    INTO current_status
    FROM public.stocks
   WHERE id = target_stock_id;

  next_status := CASE
    WHEN GREATEST(bought_shares - sold_shares, 0) <= 0 THEN 'Sold Off'
    WHEN current_status = 'Sold Off' THEN 'Hold'
    ELSE current_status
  END;

  UPDATE public.stocks
     SET status = next_status
   WHERE id = target_stock_id
     AND status IS DISTINCT FROM next_status;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_stock_status_after_buy_round_change ON public.buy_rounds;
CREATE TRIGGER sync_stock_status_after_buy_round_change
AFTER INSERT OR UPDATE OR DELETE ON public.buy_rounds
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_status_from_holdings();

DROP TRIGGER IF EXISTS sync_stock_status_after_realized_trade_change ON public.realized_trades;
CREATE TRIGGER sync_stock_status_after_realized_trade_change
AFTER INSERT OR UPDATE OR DELETE ON public.realized_trades
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_status_from_holdings();

WITH balances AS (
  SELECT
    s.id,
    GREATEST(
      COALESCE((SELECT SUM(br.shares) FROM public.buy_rounds br WHERE br.stock_id = s.id), 0)
      - COALESCE((SELECT SUM(rt.shares) FROM public.realized_trades rt WHERE rt.stock_id = s.id), 0),
      0
    ) AS remaining_shares
  FROM public.stocks s
),
resolved AS (
  SELECT
    s.id,
    CASE
      WHEN b.remaining_shares <= 0 THEN 'Sold Off'
      WHEN s.status = 'Sold Off' THEN 'Hold'
      ELSE s.status
    END AS next_status
  FROM public.stocks s
  JOIN balances b ON b.id = s.id
)
UPDATE public.stocks s
   SET status = r.next_status
  FROM resolved r
 WHERE s.id = r.id
   AND s.status IS DISTINCT FROM r.next_status;

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

-- 12. Cash deposits and withdrawals (independent from stock trades)
CREATE TABLE IF NOT EXISTS cash_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  port_type TEXT NOT NULL DEFAULT 'Private',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for cash_transactions" ON cash_transactions
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_date
  ON cash_transactions(transaction_date DESC, created_at DESC);

-- 13. Bank accounts and account types
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_type TEXT NOT NULL DEFAULT 'Private' CHECK (account_type IN ('Business', 'Private')),
  balance NUMERIC NOT NULL DEFAULT 0 CHECK (balance >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bank_accounts ALTER COLUMN account_name DROP NOT NULL;
ALTER TABLE bank_accounts ALTER COLUMN bank_name DROP NOT NULL;

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for bank_accounts" ON bank_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_type ON bank_accounts(account_type);

-- 13. Recalculate moving-average cost and realized profit by transaction date.
CREATE OR REPLACE FUNCTION public.recalculate_stock_trade_history(target_stock_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  event_row RECORD;
  held_shares NUMERIC := 0;
  held_cost NUMERIC := 0;
  average_cost NUMERIC := 0;
BEGIN
  FOR event_row IN
    SELECT *
    FROM (
      SELECT
        'BUY'::TEXT AS event_type,
        br.buy_date AS event_date,
        0 AS event_order,
        br.created_at,
        br.id AS event_id,
        br.shares,
        br.price,
        COALESCE(br.buy_fee, 0) AS fee,
        NULL::UUID AS trade_id
      FROM public.buy_rounds br
      WHERE br.stock_id = target_stock_id

      UNION ALL

      SELECT
        'SELL'::TEXT AS event_type,
        rt.sell_date AS event_date,
        1 AS event_order,
        rt.created_at,
        rt.id AS event_id,
        rt.shares,
        rt.sell_price AS price,
        COALESCE(rt.sell_fee, 0) AS fee,
        rt.id AS trade_id
      FROM public.realized_trades rt
      WHERE rt.stock_id = target_stock_id
    ) events
    ORDER BY event_date, event_order, created_at, event_id
  LOOP
    IF event_row.shares <= 0 OR event_row.price <= 0 THEN
      RAISE EXCEPTION 'จำนวนหุ้นและราคาต้องมากกว่า 0';
    END IF;

    IF event_row.event_type = 'BUY' THEN
      held_cost := held_cost + (event_row.price * event_row.shares) + event_row.fee;
      held_shares := held_shares + event_row.shares;
      CONTINUE;
    END IF;

    IF event_row.shares > held_shares THEN
      RAISE EXCEPTION
        'ขายเกินจำนวนหุ้นที่ถือ ณ วันที่ % (ถือ %, ต้องการขาย %)',
        event_row.event_date,
        held_shares,
        event_row.shares;
    END IF;

    average_cost := CASE
      WHEN held_shares > 0 THEN held_cost / held_shares
      ELSE 0
    END;

    UPDATE public.realized_trades
       SET avg_cost_at_sell = average_cost,
           profit = (event_row.price * event_row.shares)
                    - event_row.fee
                    - (average_cost * event_row.shares)
     WHERE id = event_row.trade_id;

    held_cost := held_cost - (average_cost * event_row.shares);
    held_shares := held_shares - event_row.shares;

    IF ABS(held_shares) < 0.0000001 THEN
      held_shares := 0;
      held_cost := 0;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_stock_trade_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  previous_stock_id UUID;
  current_stock_id UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    previous_stock_id := OLD.stock_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    current_stock_id := NEW.stock_id;
  END IF;

  IF previous_stock_id IS NOT NULL THEN
    PERFORM public.recalculate_stock_trade_history(previous_stock_id);
  END IF;
  IF current_stock_id IS NOT NULL AND current_stock_id IS DISTINCT FROM previous_stock_id THEN
    PERFORM public.recalculate_stock_trade_history(current_stock_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalculate_trade_history_after_buy_change ON public.buy_rounds;
DROP TRIGGER IF EXISTS recalculate_trade_history_after_sell_change ON public.realized_trades;

DO $$
DECLARE
  stock_row RECORD;
BEGIN
  FOR stock_row IN SELECT id FROM public.stocks LOOP
    PERFORM public.recalculate_stock_trade_history(stock_row.id);
  END LOOP;
END;
$$;

CREATE TRIGGER recalculate_trade_history_after_buy_change
AFTER INSERT OR UPDATE OR DELETE ON public.buy_rounds
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_stock_trade_history();

CREATE TRIGGER recalculate_trade_history_after_sell_change
AFTER INSERT OR UPDATE OR DELETE ON public.realized_trades
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_stock_trade_history();

CREATE INDEX IF NOT EXISTS idx_buy_rounds_stock_date
  ON public.buy_rounds(stock_id, buy_date, created_at);

CREATE INDEX IF NOT EXISTS idx_realized_trades_stock_date
  ON public.realized_trades(stock_id, sell_date, created_at);

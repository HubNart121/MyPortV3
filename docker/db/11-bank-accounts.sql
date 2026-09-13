-- Bank accounts used by the Local PostgreSQL fallback.
CREATE TABLE IF NOT EXISTS public.bank_accounts (
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

ALTER TABLE public.bank_accounts ALTER COLUMN account_name DROP NOT NULL;
ALTER TABLE public.bank_accounts ALTER COLUMN bank_name DROP NOT NULL;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for bank_accounts" ON public.bank_accounts;
CREATE POLICY "Enable all access for bank_accounts" ON public.bank_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_type ON public.bank_accounts(account_type);

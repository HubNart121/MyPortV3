-- Store the underlying company's country and allow the same symbol per country.
ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'THAI';

UPDATE public.stocks
SET country = 'THAI'
WHERE country IS NULL OR BTRIM(country) = '';

UPDATE public.stocks
SET country = UPPER(BTRIM(country));

DROP INDEX IF EXISTS public.stocks_symbol_port_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS stocks_symbol_port_country_key
  ON public.stocks (UPPER(symbol), port_type, UPPER(country));

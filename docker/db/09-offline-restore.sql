-- Atomically replace all eight backup categories from normalized Backup JSON v6.
-- Incoming Firebase document IDs are intentionally remapped to PostgreSQL UUIDs.
CREATE OR REPLACE FUNCTION public.restore_backup_v5(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stock_item JSONB;
  child_item JSONB;
  item JSONB;
  new_stock_id UUID;
  new_file_id UUID;
  actual_counts JSONB;
  expected_counts JSONB;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
     OR jsonb_typeof(payload->'stocks') <> 'array'
     OR jsonb_typeof(payload->'files') <> 'array'
     OR jsonb_typeof(payload->'informations') <> 'array'
     OR jsonb_typeof(payload->'cash_transactions') <> 'array'
     OR jsonb_typeof(payload->'bank_accounts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid My Port backup payload';
  END IF;

  CREATE TEMP TABLE restore_stock_id_map (
    source_id TEXT PRIMARY KEY,
    local_id UUID NOT NULL
  ) ON COMMIT DROP;

  DELETE FROM public.cash_transactions;
  DELETE FROM public.bank_accounts;
  DELETE FROM public.files;
  DELETE FROM public.informations;
  DELETE FROM public.stocks;

  FOR stock_item IN SELECT value FROM jsonb_array_elements(payload->'stocks') LOOP
    new_stock_id := gen_random_uuid();
    INSERT INTO restore_stock_id_map(source_id, local_id)
    VALUES (stock_item->>'id', new_stock_id);

    INSERT INTO public.stocks (
      id, symbol, name, sector, status, asset_type, port_type, country, platform_trade, risk_category,
      dividend_per_share, expected_dividend_per_year, current_price, target_price, graph_url, link_url,
      note, created_at, updated_at
    ) VALUES (
      new_stock_id,
      stock_item->>'symbol',
      NULLIF(stock_item->>'name', ''),
      NULLIF(stock_item->>'sector', ''),
      stock_item->>'status',
      stock_item->>'asset_type',
      stock_item->>'port_type',
      COALESCE(NULLIF(UPPER(BTRIM(stock_item->>'country')), ''), 'THAI'),
      NULLIF(stock_item->>'platform_trade', ''),
      NULLIF(stock_item->>'risk_category', ''),
      COALESCE((stock_item->>'dividend_per_share')::NUMERIC, 0),
      COALESCE((stock_item->>'expected_dividend_per_year')::NUMERIC, 0),
      COALESCE((stock_item->>'current_price')::NUMERIC, 0),
      COALESCE((stock_item->>'target_price')::NUMERIC, 0),
      NULLIF(stock_item->>'graph_url', ''),
      NULLIF(stock_item->>'link_url', ''),
      NULLIF(stock_item->>'note', ''),
      COALESCE(NULLIF(stock_item->>'created_at', '')::TIMESTAMPTZ, NOW()),
      COALESCE(NULLIF(stock_item->>'updated_at', '')::TIMESTAMPTZ, NOW())
    );

    FOR child_item IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(stock_item->'buy_rounds', '[]'::JSONB))
      ORDER BY (value->>'buy_date')::DATE, value->>'created_at', value->>'id'
    LOOP
      INSERT INTO public.buy_rounds (
        id, stock_id, buy_date, price, shares, buy_fee, note, link_url, created_at
      ) VALUES (
        gen_random_uuid(), new_stock_id, (child_item->>'buy_date')::DATE,
        (child_item->>'price')::NUMERIC, (child_item->>'shares')::NUMERIC,
        COALESCE((child_item->>'buy_fee')::NUMERIC, 0),
        NULLIF(child_item->>'note', ''), NULLIF(child_item->>'link_url', ''),
        COALESCE(NULLIF(child_item->>'created_at', '')::TIMESTAMPTZ, NOW())
      );
    END LOOP;

    FOR child_item IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(stock_item->'realized_trades', '[]'::JSONB))
      ORDER BY (value->>'sell_date')::DATE, value->>'created_at', value->>'id'
    LOOP
      INSERT INTO public.realized_trades (
        id, stock_id, sell_date, shares, sell_price, sell_fee,
        avg_cost_at_sell, profit, port_type, created_at
      ) VALUES (
        gen_random_uuid(), new_stock_id, (child_item->>'sell_date')::DATE,
        (child_item->>'shares')::NUMERIC, (child_item->>'sell_price')::NUMERIC,
        COALESCE((child_item->>'sell_fee')::NUMERIC, 0),
        COALESCE((child_item->>'avg_cost_at_sell')::NUMERIC, 0),
        COALESCE((child_item->>'profit')::NUMERIC, 0),
        COALESCE(NULLIF(child_item->>'port_type', ''), stock_item->>'port_type'),
        COALESCE(NULLIF(child_item->>'created_at', '')::TIMESTAMPTZ, NOW())
      );
    END LOOP;

    FOR child_item IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(stock_item->'dividend_payments', '[]'::JSONB))
      ORDER BY (value->>'pay_date')::DATE, value->>'created_at', value->>'id'
    LOOP
      INSERT INTO public.dividend_payments (
        id, stock_id, pay_date, dividend_per_share, shares_held,
        tax_pct, gross_amount, net_amount, created_at
      ) VALUES (
        gen_random_uuid(), new_stock_id, (child_item->>'pay_date')::DATE,
        (child_item->>'dividend_per_share')::NUMERIC,
        (child_item->>'shares_held')::NUMERIC,
        COALESCE((child_item->>'tax_pct')::NUMERIC, 0),
        (child_item->>'gross_amount')::NUMERIC,
        (child_item->>'net_amount')::NUMERIC,
        COALESCE(NULLIF(child_item->>'created_at', '')::TIMESTAMPTZ, NOW())
      );
    END LOOP;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'cash_transactions') LOOP
    INSERT INTO public.cash_transactions (
      id, transaction_date, type, amount, port_type, note, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), (item->>'transaction_date')::DATE, item->>'type',
      (item->>'amount')::NUMERIC, item->>'port_type', NULLIF(item->>'note', ''),
      COALESCE(NULLIF(item->>'created_at', '')::TIMESTAMPTZ, NOW()),
      COALESCE(NULLIF(item->>'updated_at', '')::TIMESTAMPTZ, NOW())
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'files') LOOP
    new_file_id := gen_random_uuid();
    INSERT INTO public.files (
      id, name, detail, link, created_at, storage_kind,
      stored_name, original_name, mime_type, size_bytes
    ) VALUES (
      new_file_id, item->>'name', NULLIF(item->>'detail', ''),
      CASE
        WHEN COALESCE(NULLIF(item->>'storage_kind', ''), 'link') = 'local'
          THEN '/api/local-files/' || new_file_id::TEXT
        ELSE NULLIF(item->>'link', '')
      END,
      COALESCE(NULLIF(item->>'created_at', '')::TIMESTAMPTZ, NOW()),
      COALESCE(NULLIF(item->>'storage_kind', ''), 'link'),
      NULLIF(item->>'stored_name', ''), NULLIF(item->>'original_name', ''),
      NULLIF(item->>'mime_type', ''), NULLIF(item->>'size_bytes', '')::BIGINT
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'informations') LOOP
    INSERT INTO public.informations (id, title, link, detail, created_at)
    VALUES (
      gen_random_uuid(), item->>'title', NULLIF(item->>'link', ''),
      NULLIF(item->>'detail', ''),
      COALESCE(NULLIF(item->>'created_at', '')::TIMESTAMPTZ, NOW())
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(payload->'bank_accounts') LOOP
    INSERT INTO public.bank_accounts (
      id, account_number, account_type, balance, note, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), item->>'account_number', item->>'account_type',
      (item->>'balance')::NUMERIC, item->>'note',
      (item->>'created_at')::TIMESTAMPTZ, (item->>'updated_at')::TIMESTAMPTZ
    );
  END LOOP;

  SELECT jsonb_build_object(
    'stocks', (SELECT COUNT(*) FROM public.stocks),
    'buy_rounds', (SELECT COUNT(*) FROM public.buy_rounds),
    'realized_trades', (SELECT COUNT(*) FROM public.realized_trades),
    'dividend_payments', (SELECT COUNT(*) FROM public.dividend_payments),
    'cash_transactions', (SELECT COUNT(*) FROM public.cash_transactions),
    'files', (SELECT COUNT(*) FROM public.files),
    'informations', (SELECT COUNT(*) FROM public.informations),
    'bank_accounts', (SELECT COUNT(*) FROM public.bank_accounts)
  ) INTO actual_counts;

  expected_counts := payload#>'{manifest,categories}';
  IF expected_counts IS NOT NULL AND actual_counts <> expected_counts THEN
    RAISE EXCEPTION 'Restore count mismatch. expected=%, actual=%', expected_counts, actual_counts;
  END IF;

  RETURN actual_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_backup_v5(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_backup_v5(JSONB) TO anon;

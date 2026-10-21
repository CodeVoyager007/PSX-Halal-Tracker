-- Safe to re-run: tables use IF NOT EXISTS, columns added later use ADD COLUMN IF NOT EXISTS,
-- and policies are dropped and recreated.

-- =====================================================================
-- Market data (written by the pipeline with the service_role key)
-- =====================================================================

-- Table 1: halal_universe (KMI All-Share constituents, refreshed weekly by update_universe.py)
CREATE TABLE IF NOT EXISTS halal_universe (
    ticker VARCHAR(10) PRIMARY KEY,
    company_name VARCHAR(255),
    sector VARCHAR(100),
    is_kmi_30 BOOLEAN DEFAULT FALSE,
    is_kmi_all_share BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,    -- Marks if still in the halal universe
    added_date DATE DEFAULT CURRENT_DATE,
    removed_date DATE,                 -- Set when a ticker is removed, instead of hard-deleting
    market_cap_m NUMERIC               -- PKR millions, from the psxdata index listing
);

-- Table 2: price_history (Daily OHLCV per PSX ticker)
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) REFERENCES halal_universe(ticker),
    trade_date DATE NOT NULL,
    open_price NUMERIC(10, 2),
    high_price NUMERIC(10, 2),
    low_price NUMERIC(10, 2),
    close_price NUMERIC(10, 2),
    volume BIGINT,
    UNIQUE(ticker, trade_date)
);

-- Table 3: portfolio (Each user's current holdings; one summary row per user and ticker)
CREATE TABLE IF NOT EXISTS portfolio (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker VARCHAR(10) REFERENCES halal_universe(ticker),
    quantity NUMERIC(15, 4) NOT NULL,
    average_buy_price NUMERIC(10, 2) NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 4: trade_journal (Each user's logged entries/exits with reasoning)
CREATE TABLE IF NOT EXISTS trade_journal (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker VARCHAR(10) REFERENCES halal_universe(ticker),
    trade_type VARCHAR(10) CHECK (trade_type IN ('BUY', 'SELL')),
    trade_date DATE NOT NULL,
    quantity NUMERIC(15, 4) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    fees NUMERIC(10, 2) DEFAULT 0, -- Brokerage commission, CDC, SST
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table 5: technical_indicators (Daily indicators computed natively)
CREATE TABLE IF NOT EXISTS technical_indicators (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) REFERENCES halal_universe(ticker),
    trade_date DATE NOT NULL,
    
    -- Simple Moving Averages
    sma_20 NUMERIC(10, 2),
    sma_50 NUMERIC(10, 2),
    sma_200 NUMERIC(10, 2),
    
    -- Exponential Moving Averages
    ema_12 NUMERIC(10, 2),
    ema_26 NUMERIC(10, 2),
    
    -- Relative Strength Index
    rsi_14 NUMERIC(10, 2),
    
    -- MACD
    macd NUMERIC(10, 4),
    macd_signal NUMERIC(10, 4),
    macd_histogram NUMERIC(10, 4),
    
    -- Bollinger Bands (20-day, 2 std dev)
    bb_upper NUMERIC(10, 2),
    bb_middle NUMERIC(10, 2),
    bb_lower NUMERIC(10, 2),
    
    -- Volume Analysis
    avg_volume_20 BIGINT,

    -- Trending metrics (computed daily across all active tickers)
    volume_spike_ratio NUMERIC(10, 4),   -- today's volume / previous day's avg_volume_20
    price_change_5d_pct NUMERIC(10, 4),  -- 5-trading-day price momentum (%)
    -- trending_score = volume_rank + price_rank (both ranked descending, so lower score = more trending)
    trending_score NUMERIC(10, 4),

    -- Idempotency constraint identical to price_history
    UNIQUE(ticker, trade_date)
);

-- Columns added after the first release, for databases created before them.
ALTER TABLE halal_universe ADD COLUMN IF NOT EXISTS market_cap_m NUMERIC;

-- Where each price came from ('psx' = PSX's official daily file, 'tradingview'
-- until PSX publishes it) and which independent source confirmed its close
-- ('scstrade', 'tradingview'; NULL = not confirmed)
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS verified_with TEXT;

-- portfolio / trade_journal became per-user. Existing rows have no owner and
-- are only reachable with the service_role key until user_id is filled in.
ALTER TABLE portfolio     ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE portfolio DROP CONSTRAINT IF EXISTS portfolio_ticker_key;
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_user_ticker_key ON portfolio(user_id, ticker);
CREATE INDEX IF NOT EXISTS trade_journal_user_idx ON trade_journal(user_id, trade_date);

ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS volume_spike_ratio NUMERIC(10, 4);
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS price_change_5d_pct NUMERIC(10, 4);
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS trending_score NUMERIC(10, 4);

-- Volatility, 52-week range and period returns, computed from price_history
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS atr_14 NUMERIC(10, 2);             -- 14-day average true range (PKR)
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS high_52w NUMERIC(10, 2);           -- highest high, trailing 365 days
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS low_52w NUMERIC(10, 2);            -- lowest low, trailing 365 days
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS pct_from_52w_high NUMERIC(10, 4);  -- close vs 52-week high (%, <= 0)
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS return_1m_pct NUMERIC(10, 4);      -- 21 sessions
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS return_3m_pct NUMERIC(10, 4);      -- 63 sessions
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS return_1y_pct NUMERIC(10, 4);      -- 252 sessions

-- Table 9: company_stats (latest fundamentals per ticker, refreshed by each daily run
-- from TradingView; one row per ticker, overwritten, no history)
CREATE TABLE IF NOT EXISTS company_stats (
    ticker VARCHAR(10) PRIMARY KEY REFERENCES halal_universe(ticker),
    as_of DATE NOT NULL,               -- session the figures were taken after
    market_cap NUMERIC,                -- PKR
    pe_ratio NUMERIC(12, 2),           -- trailing twelve months
    eps_ttm NUMERIC(12, 4),            -- PKR, trailing twelve months
    dividend_yield_pct NUMERIC(10, 4),
    high_52w NUMERIC(10, 2),
    low_52w NUMERIC(10, 2),
    beta_1y NUMERIC(10, 4),
    avg_volume_30d BIGINT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- View 1: Top 20 active halal tickers by market capitalisation
CREATE OR REPLACE VIEW top_20_by_market_cap WITH (security_invoker = true) AS
SELECT ticker, company_name, sector, market_cap_m
FROM halal_universe
WHERE is_active = TRUE AND market_cap_m IS NOT NULL
ORDER BY market_cap_m DESC
LIMIT 20;

-- View 2: Top 20 trending tickers for the most recent trade_date.
-- trending_score = volume_rank + price_rank (both descending), so ORDER BY ASC surfaces the most trending.
-- close_price is JOINed from price_history on BOTH ticker AND trade_date — joining on ticker alone
-- would produce a cross-product of every historical date, not the matching row.
CREATE OR REPLACE VIEW trending_stocks WITH (security_invoker = true) AS
SELECT
    ti.ticker,
    hu.company_name,
    hu.sector,
    ti.trade_date,
    ti.trending_score,
    ti.volume_spike_ratio,
    ti.price_change_5d_pct,
    ph.close_price,
    ti.rsi_14
FROM technical_indicators ti
JOIN halal_universe hu ON hu.ticker = ti.ticker
JOIN price_history ph   ON ph.ticker = ti.ticker AND ph.trade_date = ti.trade_date
WHERE
    hu.is_active = TRUE
    AND ti.trade_date = (SELECT MAX(trade_date) FROM technical_indicators)
    AND ti.trending_score IS NOT NULL
ORDER BY ti.trending_score ASC
LIMIT 20;

-- View 3: latest_snapshot — one row per active ticker with its most recent close,
-- the previous close and that day's indicators. Read by the web app and the email
-- digest. The 30-day window bounds the scan while still spanning long closures.
CREATE OR REPLACE VIEW latest_snapshot WITH (security_invoker = true) AS
WITH recent AS (
    SELECT
        ticker,
        trade_date,
        close_price,
        volume,
        source,
        verified_with,
        LAG(close_price) OVER (PARTITION BY ticker ORDER BY trade_date) AS prev_close,
        ROW_NUMBER()     OVER (PARTITION BY ticker ORDER BY trade_date DESC) AS rn
    FROM price_history
    WHERE trade_date >= CURRENT_DATE - 30
)
SELECT
    hu.ticker,
    hu.company_name,
    hu.sector,
    hu.is_kmi_30,
    hu.market_cap_m,
    r.trade_date,
    r.close_price,
    r.prev_close,
    ROUND((r.close_price - r.prev_close) / NULLIF(r.prev_close, 0) * 100, 2) AS change_1d_pct,
    r.volume,
    ti.rsi_14,
    ti.sma_50,
    ti.sma_200,
    ti.volume_spike_ratio,
    ti.price_change_5d_pct,
    ti.trending_score,
    -- Columns added later go last: CREATE OR REPLACE VIEW can only append
    ti.atr_14,
    ti.high_52w,
    ti.low_52w,
    ti.pct_from_52w_high,
    ti.return_1m_pct,
    ti.return_3m_pct,
    ti.return_1y_pct,
    cs.market_cap,
    cs.pe_ratio,
    cs.eps_ttm,
    cs.dividend_yield_pct,
    cs.beta_1y,
    cs.as_of AS stats_as_of,
    r.source AS price_source,
    r.verified_with AS price_verified_with
FROM halal_universe hu
LEFT JOIN recent r                ON r.ticker = hu.ticker AND r.rn = 1
LEFT JOIN technical_indicators ti ON ti.ticker = r.ticker AND ti.trade_date = r.trade_date
LEFT JOIN company_stats cs        ON cs.ticker = hu.ticker
WHERE hu.is_active = TRUE;

-- =====================================================================
-- Users (Supabase Auth)
-- =====================================================================

-- Table 6: profiles (one per auth user, created by the trigger below)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    digest_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (digest_frequency IN ('daily', 'weekly')),
    -- Lets the unsubscribe link in each email work without signing in
    unsubscribe_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table 7: watchlists (the companies each user follows)
CREATE TABLE IF NOT EXISTS watchlists (
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    ticker VARCHAR(10) NOT NULL REFERENCES halal_universe(ticker),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, ticker)
);

-- Table 8: digest_log (one row per user per market date, so a re-run never emails twice)
CREATE TABLE IF NOT EXISTS digest_log (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    digest_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
    error TEXT,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, digest_date)
);

-- Create a profile on sign-up and keep its email in sync with the auth user
CREATE OR REPLACE FUNCTION public.sync_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile();

-- Accounts created before the trigger existed get their profile here
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users WHERE email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Cap each watchlist at 50 companies to keep digests readable and the email
-- quota predictable. A trigger rather than an RLS check: a policy on
-- watchlists cannot query watchlists without infinite recursion.
CREATE OR REPLACE FUNCTION public.enforce_watchlist_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF (SELECT count(*) FROM public.watchlists WHERE user_id = NEW.user_id) >= 50 THEN
        RAISE EXCEPTION 'Watchlist limit of 50 companies reached' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watchlist_limit ON watchlists;
CREATE TRIGGER watchlist_limit BEFORE INSERT ON watchlists
    FOR EACH ROW EXECUTE FUNCTION public.enforce_watchlist_limit();

-- Unsubscribe from the link in a digest email without signing in. SECURITY
-- DEFINER lets the anon role call it; it only ever turns digest_enabled off
-- for the single profile holding that token. Returns NULL for an unknown token.
CREATE OR REPLACE FUNCTION public.unsubscribe_digest(token UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    UPDATE public.profiles SET digest_enabled = FALSE
    WHERE unsubscribe_token = token
    RETURNING TRUE;
$$;
REVOKE ALL ON FUNCTION public.unsubscribe_digest(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_digest(UUID) TO anon, authenticated;

-- Let a signed-in user delete their own account. SECURITY DEFINER because
-- users cannot touch auth.users; it only ever deletes the caller's row, and
-- ON DELETE CASCADE removes their profile, watchlist, portfolio, journal and
-- digest log with it.
-- (A signed-out caller matches no row, so nothing is deleted.)
CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    DELETE FROM auth.users WHERE id = auth.uid() AND auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Public directory of the halal universe for the landing-page search. Exposes
-- only the index constituent list (ticker, name, sector), never prices.
CREATE OR REPLACE FUNCTION public.company_directory()
RETURNS TABLE (ticker VARCHAR, company_name VARCHAR, sector VARCHAR, is_kmi_30 BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT hu.ticker, hu.company_name, hu.sector, hu.is_kmi_30
    FROM public.halal_universe hu
    WHERE hu.is_active
    ORDER BY hu.ticker;
$$;
REVOKE ALL ON FUNCTION public.company_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_directory() TO anon, authenticated;

-- Trigger functions must not be callable through the API
REVOKE ALL ON FUNCTION public.sync_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_watchlist_limit() FROM PUBLIC, anon, authenticated;

-- Cover the ticker foreign keys (e.g. "who follows OGDC", and FK checks on universe changes)
CREATE INDEX IF NOT EXISTS watchlists_ticker_idx ON watchlists(ticker);
CREATE INDEX IF NOT EXISTS portfolio_ticker_idx ON portfolio(ticker);
CREATE INDEX IF NOT EXISTS trade_journal_ticker_idx ON trade_journal(ticker);

-- =====================================================================
-- Row Level Security
-- The pipeline uses the service_role key, which bypasses RLS. Everything
-- below governs what signed-in users (and the public anon key) can do.
-- =====================================================================

ALTER TABLE halal_universe       ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio            ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_journal        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_stats        ENABLE ROW LEVEL SECURITY;

-- Market data: read-only for signed-in users; anon gets nothing.
DROP POLICY IF EXISTS "Signed-in users can read" ON halal_universe;
CREATE POLICY "Signed-in users can read" ON halal_universe FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Signed-in users can read" ON price_history;
CREATE POLICY "Signed-in users can read" ON price_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Signed-in users can read" ON technical_indicators;
CREATE POLICY "Signed-in users can read" ON technical_indicators FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Signed-in users can read" ON company_stats;
CREATE POLICY "Signed-in users can read" ON company_stats FOR SELECT TO authenticated USING (true);

-- profiles: users read their own row and may change only the digest settings.
-- Column privileges stop them rewriting email or unsubscribe_token.
DROP POLICY IF EXISTS "Users read own profile" ON profiles;
CREATE POLICY "Users read own profile" ON profiles FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
CREATE POLICY "Users update own profile" ON profiles FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON profiles FROM anon, authenticated;
GRANT UPDATE (digest_enabled, digest_frequency) ON profiles TO authenticated;

-- watchlists: users manage their own list of active tickers
DROP POLICY IF EXISTS "Users read own watchlist" ON watchlists;
CREATE POLICY "Users read own watchlist" ON watchlists FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users add to own watchlist" ON watchlists;
CREATE POLICY "Users add to own watchlist" ON watchlists FOR INSERT TO authenticated
    WITH CHECK (
        user_id = (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM halal_universe hu WHERE hu.ticker = watchlists.ticker AND hu.is_active)
    );
DROP POLICY IF EXISTS "Users remove from own watchlist" ON watchlists;
CREATE POLICY "Users remove from own watchlist" ON watchlists FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- portfolio / trade_journal: full control over own rows only
DROP POLICY IF EXISTS "Users manage own portfolio" ON portfolio;
CREATE POLICY "Users manage own portfolio" ON portfolio FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users manage own journal" ON trade_journal;
CREATE POLICY "Users manage own journal" ON trade_journal FOR ALL TO authenticated
    USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- digest_log: users can see when their digests went out; only the pipeline writes
DROP POLICY IF EXISTS "Users read own digest log" ON digest_log;
CREATE POLICY "Users read own digest log" ON digest_log FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

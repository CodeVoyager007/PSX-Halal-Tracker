-- Table 1: halal_universe (Manually refreshed twice a year)
CREATE TABLE halal_universe (
    ticker VARCHAR(10) PRIMARY KEY,
    company_name VARCHAR(255),
    sector VARCHAR(100),
    is_kmi_30 BOOLEAN DEFAULT FALSE,
    is_kmi_all_share BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,    -- Marks if still in the halal universe
    added_date DATE DEFAULT CURRENT_DATE,
    removed_date DATE                  -- Set when a ticker is removed, instead of hard-deleting
);

-- Table 2: price_history (Daily OHLCV per PSX ticker)
CREATE TABLE price_history (
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

-- Table 3: portfolio (Current holdings)
CREATE TABLE portfolio (
    id SERIAL PRIMARY KEY,
    ticker VARCHAR(10) REFERENCES halal_universe(ticker),
    quantity NUMERIC(15, 4) NOT NULL,
    average_buy_price NUMERIC(10, 2) NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker) -- Ensure only one summary row per ticker
);

-- Table 4: trade_journal (Logged entries/exits with reasoning)
CREATE TABLE trade_journal (
    id SERIAL PRIMARY KEY,
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
CREATE TABLE technical_indicators (
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
    volume_spike_ratio NUMERIC(10, 4),   -- today's volume / avg_volume_20
    price_change_5d_pct NUMERIC(10, 4),  -- 5-trading-day price momentum (%)
    -- trending_score = volume_rank + price_rank (both ranked descending, so lower score = more trending)
    trending_score NUMERIC(10, 4),

    -- Idempotency constraint identical to price_history
    UNIQUE(ticker, trade_date)
);

-- ALTER statements for databases already initialised without the new columns.
-- Safe to re-run: Postgres will raise "column already exists" which can be ignored.
ALTER TABLE halal_universe ADD COLUMN IF NOT EXISTS market_cap_m NUMERIC;

ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS volume_spike_ratio NUMERIC(10, 4);
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS price_change_5d_pct NUMERIC(10, 4);
ALTER TABLE technical_indicators ADD COLUMN IF NOT EXISTS trending_score NUMERIC(10, 4);

-- View 1: Top 20 active halal tickers by market capitalisation
CREATE OR REPLACE VIEW top_20_by_market_cap AS
SELECT ticker, company_name, sector, market_cap_m
FROM halal_universe
WHERE is_active = TRUE AND market_cap_m IS NOT NULL
ORDER BY market_cap_m DESC
LIMIT 20;

-- View 2: Top 20 trending tickers for the most recent trade_date.
-- trending_score = volume_rank + price_rank (both descending), so ORDER BY ASC surfaces the most trending.
-- close_price is JOINed from price_history on BOTH ticker AND trade_date — joining on ticker alone
-- would produce a cross-product of every historical date, not the matching row.
CREATE OR REPLACE VIEW trending_stocks AS
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

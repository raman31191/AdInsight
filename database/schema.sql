-- ============================================================
-- AdInsight Live — Supabase Schema
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- 1. CAMPAIGNS TABLE (master data)
CREATE TABLE IF NOT EXISTS campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  advertiser  TEXT NOT NULL,
  budget      DECIMAL(12,2) NOT NULL DEFAULT 10000,
  daily_budget DECIMAL(10,2) NOT NULL DEFAULT 500,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  objective   TEXT NOT NULL DEFAULT 'conversions' CHECK (objective IN ('awareness', 'traffic', 'conversions')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. LIVE METRICS TABLE (raw event stream — updated every few seconds)
CREATE TABLE IF NOT EXISTS live_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  conversions   INTEGER NOT NULL DEFAULT 0,
  spend         DECIMAL(10,4) NOT NULL DEFAULT 0,
  ctr           DECIMAL(8,6) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN clicks::DECIMAL / impressions ELSE 0 END
  ) STORED,
  cpc           DECIMAL(10,4) GENERATED ALWAYS AS (
    CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END
  ) STORED,
  roas          DECIMAL(10,4) DEFAULT 0,
  quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 10),
  region        TEXT DEFAULT 'Global',
  device        TEXT DEFAULT 'Desktop' CHECK (device IN ('Desktop', 'Mobile', 'Tablet')),
  is_anomaly    BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SYSTEM ALERTS TABLE (anomalies, warnings)
CREATE TABLE IF NOT EXISTS system_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  alert_type  TEXT NOT NULL, -- 'ctr_spike', 'overspend', 'conversion_drop', 'anomaly'
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message     TEXT NOT NULL,
  value       DECIMAL(15,4),
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PIPELINE HEALTH TABLE (SRE monitoring)
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  records_inserted INTEGER DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_live_metrics_created_at ON live_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_metrics_campaign_id ON live_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON system_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON system_alerts(acknowledged);

-- ============================================================
-- SEED CAMPAIGNS (5 sample campaigns)
-- ============================================================
INSERT INTO campaigns (name, advertiser, budget, daily_budget, status, objective) VALUES
  ('Summer_Sale_2024',    'TechCorp Inc',    50000, 1500, 'active',  'conversions'),
  ('Brand_Awareness_Q1',  'GlobalBrands Ltd', 75000, 2000, 'active',  'awareness'),
  ('Retargeting_Push',    'E-Commerce Pro',  30000, 1000, 'active',  'traffic'),
  ('Holiday_Campaign',    'RetailGiant Co',  100000, 3000, 'active', 'conversions'),
  ('App_Install_Drive',   'MobileFirst Inc',  25000, 800, 'active',  'conversions')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- ANALYTICAL VIEW (for dashboard KPI cards)
-- ============================================================
CREATE OR REPLACE VIEW campaign_summary AS
SELECT
  c.id,
  c.name,
  c.advertiser,
  c.status,
  c.objective,
  c.budget,
  c.daily_budget,
  COUNT(m.id)                        AS total_events,
  COALESCE(SUM(m.impressions), 0)    AS total_impressions,
  COALESCE(SUM(m.clicks), 0)         AS total_clicks,
  COALESCE(SUM(m.conversions), 0)    AS total_conversions,
  COALESCE(SUM(m.spend), 0)          AS total_spend,
  COALESCE(AVG(m.ctr) * 100, 0)      AS avg_ctr_pct,
  COALESCE(AVG(m.cpc), 0)            AS avg_cpc,
  COALESCE(AVG(m.roas), 0)           AS avg_roas,
  COALESCE(AVG(m.quality_score), 0)  AS avg_quality_score,
  MAX(m.created_at)                  AS last_updated
FROM campaigns c
LEFT JOIN live_metrics m ON c.id = m.campaign_id
GROUP BY c.id, c.name, c.advertiser, c.status, c.objective, c.budget, c.daily_budget;

-- ============================================================
-- ENABLE REALTIME ON TABLES
-- (Run these in Supabase SQL Editor)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE live_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE system_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;

-- ============================================================
-- ROW LEVEL SECURITY (allow all for demo)
-- ============================================================
ALTER TABLE campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON campaigns        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON live_metrics     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON system_alerts    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON pipeline_runs    FOR ALL TO anon USING (true) WITH CHECK (true);

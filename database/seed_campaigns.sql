-- ============================================================
-- AdInsight Live — Campaign Seed Data (v2)
-- Safe insert: skips any campaign that already exists by name
-- Run this in Supabase SQL Editor
-- ============================================================

INSERT INTO campaigns (name, budget, status, platform)
SELECT v.name, v.budget, v.status::TEXT, v.platform
FROM (VALUES
  ('Search | Brand Terms',           27000,  'active', 'Google Ads'),
  ('Search | Generic High-Intent',   84000,  'active', 'Google Ads'),
  ('Search | Competitor Conquest',   42000,  'active', 'Google Ads'),
  ('Shopping | All Products',        96000,  'active', 'Google Ads'),
  ('Display | Prospecting',          48000,  'active', 'Google Ads'),
  ('Display | Retargeting',          28500,  'active', 'Google Ads'),
  ('Performance Max | ROAS Target', 135000,  'active', 'Google Ads'),
  ('YouTube | Brand Awareness',      66000,  'active', 'Google Ads')
) AS v(name, budget, status, platform)
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns WHERE campaigns.name = v.name
);

-- Verify all campaigns
SELECT name, budget, status, platform FROM campaigns ORDER BY name;

-- Everlasting Profit Tracker - Supabase Schema
-- Run this in Supabase SQL Editor

-- Products table (stores full product config as JSONB for flexibility)
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Settings table (single row, stores all config)
CREATE TABLE IF NOT EXISTS profit_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Open access policies (no auth for simplicity)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on profit_settings" ON profit_settings FOR ALL USING (true) WITH CHECK (true);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profit_settings_updated_at BEFORE UPDATE ON profit_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

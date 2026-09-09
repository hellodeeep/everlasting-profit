-- Shipment tracking cache (one row per AWB). Run once in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS shipment_tracking (
  awb TEXT PRIMARY KEY,
  order_number TEXT,
  status TEXT,             -- raw NimbusPost status
  norm TEXT,               -- delivered | rto | in_transit | cancelled | lost | unknown
  terminal BOOLEAN DEFAULT false,
  courier TEXT,
  payment_type TEXT,
  delivered_date DATE,
  rto_initiate_date DATE,
  rto_status TEXT,
  event_time TIMESTAMPTZ,
  raw JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipment_tracking_order_idx ON shipment_tracking (order_number);
ALTER TABLE shipment_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on shipment_tracking" ON shipment_tracking FOR ALL USING (true) WITH CHECK (true);

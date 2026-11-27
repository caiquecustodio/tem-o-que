ALTER TABLE managed_stores ADD COLUMN store_type TEXT NOT NULL DEFAULT 'complete' CHECK (store_type IN ('complete', 'lite'));
ALTER TABLE sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'untracked' CHECK (payment_status IN ('untracked', 'paid', 'pending'));
ALTER TABLE sales ADD COLUMN paid_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status, status, created_at);

-- Reservas e pedidos feitos pela página pública da loja completa.
CREATE TABLE IF NOT EXISTS reservation_offers (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  service_date TEXT,
  limit_qty INTEGER CHECK (limit_qty IS NULL OR limit_qty > 0),
  closes_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','delivered','rejected','cancelled')),
  payment_choice TEXT NOT NULL DEFAULT 'later' CHECK (payment_choice IN ('later','pix_now')),
  payment_state TEXT NOT NULL DEFAULT 'none' CHECK (payment_state IN ('none','claimed','confirmed')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  notes TEXT NOT NULL DEFAULT '',
  sale_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  offer_id INTEGER,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_employee ON orders(employee_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_offer ON order_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON reservation_offers(status);

-- Limite de tentativas na página pública (não é por loja).
CREATE TABLE IF NOT EXISTS public_rate_limits (
  store_id INTEGER NOT NULL,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, bucket, window_start)
);

-- WhatsApp da dona da loja, usado no botão "Enviar comprovante".
ALTER TABLE store_settings ADD COLUMN whatsapp_phone TEXT NOT NULL DEFAULT '';

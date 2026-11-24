CREATE TABLE IF NOT EXISTS loyalty_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'product' CHECK (mode IN ('product', 'general')),
  card_title TEXT NOT NULL DEFAULT 'Cartão fidelidade',
  card_message TEXT NOT NULL DEFAULT 'Junte pontos e ganhe recompensas!',
  card_color TEXT NOT NULL DEFAULT '#047857',
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_quantity INTEGER NOT NULL DEFAULT 5 CHECK (product_quantity > 0),
  reward_quantity INTEGER NOT NULL DEFAULT 1 CHECK (reward_quantity > 0),
  purchase_threshold INTEGER NOT NULL DEFAULT 5 CHECK (purchase_threshold > 0),
  reward_credits INTEGER NOT NULL DEFAULT 5 CHECK (reward_credits > 0),
  starts_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO loyalty_settings (id, updated_at) VALUES (1, datetime('now'));

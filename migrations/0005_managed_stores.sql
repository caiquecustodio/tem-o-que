CREATE TABLE IF NOT EXISTS managed_stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  store_name TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO managed_stores (id, slug, store_name, username, created_at)
VALUES (1, 'marlene', 'Marlene Interprise', 'marlene', datetime('now'));

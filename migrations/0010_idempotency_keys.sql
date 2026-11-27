-- Chaves de idempotência: reenviar a mesma operação (fila offline do app) nunca duplica venda ou pagamento.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  store_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (store_id, key)
);

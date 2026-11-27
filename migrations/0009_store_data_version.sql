-- Contador de versão dos dados por loja: o app só baixa tudo de novo quando algo mudou.
CREATE TABLE IF NOT EXISTS store_data_version (
  store_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);

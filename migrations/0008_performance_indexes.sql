-- Índices de desempenho para a loja principal (lojas gerenciadas recebem os seus no Worker).
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_status_employee ON sales(status, employee_id);

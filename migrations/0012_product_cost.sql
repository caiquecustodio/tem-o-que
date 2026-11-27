-- Custo de compra opcional por produto e o custo congelado em cada item vendido (base do relatório de lucro).
ALTER TABLE products ADD COLUMN cost_cents INTEGER CHECK (cost_cents IS NULL OR cost_cents >= 0);
ALTER TABLE sale_items ADD COLUMN unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);

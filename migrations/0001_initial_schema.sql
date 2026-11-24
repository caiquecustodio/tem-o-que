CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      min_stock INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
      available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      old_price_cents INTEGER NOT NULL,
      new_price_cents INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      changed_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      department TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      pin TEXT NOT NULL DEFAULT '1234',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'corrected')),
      notes TEXT NOT NULL DEFAULT '',
      corrected_from_sale_id INTEGER REFERENCES sales(id),
      created_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL,
      cancelled_at TEXT,
      cancel_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
      subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      method TEXT NOT NULL DEFAULT 'Pix',
      received_by TEXT NOT NULL DEFAULT 'Administrador',
      notes TEXT NOT NULL DEFAULT '',
      balance_after_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('entry', 'sale', 'sale_reversal', 'adjustment')),
      quantity_delta INTEGER NOT NULL,
      stock_before INTEGER NOT NULL,
      stock_after INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      reference_id INTEGER,
      created_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS period_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_label TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_sales_cents INTEGER NOT NULL,
      total_received_cents INTEGER NOT NULL,
      total_pending_cents INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      closed_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      store_name TEXT NOT NULL DEFAULT 'Marlene Interprise',
      logo_data_url TEXT NOT NULL DEFAULT '',
      pix_key TEXT NOT NULL DEFAULT '',
      pix_key_type TEXT NOT NULL DEFAULT 'auto',
      pix_beneficiary_name TEXT NOT NULL DEFAULT 'MARLENE INTERPRISE',
      pix_city TEXT NOT NULL DEFAULT 'SAO PAULO',
      billing_message_template TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_employee ON sales(employee_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);

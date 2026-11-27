import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'mercearia.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function runInTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

export function initDatabase() {
  db.exec(`
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
      cancel_reason TEXT,
      payment_status TEXT NOT NULL DEFAULT 'untracked' CHECK (payment_status IN ('untracked','paid','pending')),
      paid_at TEXT
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
      brand_primary_color TEXT NOT NULL DEFAULT '#047857',
      brand_secondary_color TEXT NOT NULL DEFAULT '#f59e0b',
      updated_at TEXT NOT NULL
    );

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

    CREATE INDEX IF NOT EXISTS idx_sales_employee ON sales(employee_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
  `);

  const saleColumns = new Set((db.prepare('PRAGMA table_info(sales)').all() as Array<{ name: string }>).map((column) => column.name));
  if (!saleColumns.has('payment_status')) db.exec("ALTER TABLE sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'untracked' CHECK (payment_status IN ('untracked','paid','pending'))");
  if (!saleColumns.has('paid_at')) db.exec('ALTER TABLE sales ADD COLUMN paid_at TEXT');

  const storeSettingColumns = new Set((db.prepare('PRAGMA table_info(store_settings)').all() as Array<{ name: string }>).map((column) => column.name));
  if (!storeSettingColumns.has('brand_primary_color')) db.exec("ALTER TABLE store_settings ADD COLUMN brand_primary_color TEXT NOT NULL DEFAULT '#047857'");
  if (!storeSettingColumns.has('brand_secondary_color')) db.exec("ALTER TABLE store_settings ADD COLUMN brand_secondary_color TEXT NOT NULL DEFAULT '#f59e0b'");

  const settingsRow = db.prepare('SELECT COUNT(*) as count FROM store_settings WHERE id = 1').get() as { count: number };
  if (settingsRow.count === 0) {
    const defaultTemplate = [
      'Olá, {cliente}! Tudo bem?',
      '',
      'Segue o resumo da sua conta na *{loja}*:',
      'Valor em aberto: *{valor}*',
      '',
      '{resumo}',
      '',
      'Chave Pix: {chave_pix}',
      '',
      'Pix Copia e Cola (cole no app do seu banco):',
      '{copia_e_cola}',
    ].join('\n');

    db.prepare(`
      INSERT INTO store_settings (
        id, store_name, logo_data_url, pix_key, pix_key_type,
        pix_beneficiary_name, pix_city, billing_message_template, updated_at
      ) VALUES (1, 'Marlene Interprise', '', '', 'auto', 'MARLENE INTERPRISE', 'SAO PAULO', ?, ?)
    `).run(defaultTemplate, new Date().toISOString());
  }

  const row = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
  if (row.count === 0) {
    seedInitialData();
  }
}

function daysAgoIso(daysAgo: number, hour = 10, minute = 0): string {
  const d = new Date(Date.now() - daysAgo * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seedInitialData() {
  const SUCO_IMG = '';
  const VITAMINA_IMG = '';
  const TRUFA_IMG = '';
  const LANCHE_IMG = '';

  const initialProducts = [
    // Sucos (from attached spreadsheet)
    { name: 'Suco de Maracujá', description: 'Suco natural de polpa de maracujá gelado (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 700, stock: 18, min_stock: 5 },
    { name: 'Suco de Acerola', description: 'Suco natural de acerola rico em vitamina C (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 650, stock: 15, min_stock: 5 },
    { name: 'Suco de Goiaba', description: 'Suco cremoso de polpa de goiaba vermelha (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 650, stock: 12, min_stock: 5 },
    { name: 'Suco de Cajá', description: 'Suco refrescante de polpa de cajá (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 700, stock: 10, min_stock: 4 },
    { name: 'Suco de Manga', description: 'Suco natural de manga selecionada (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 650, stock: 14, min_stock: 5 },
    { name: 'Suco de Abacaxi com Hortelã', description: 'Combinação refrescante de abacaxi e folhas de hortelã (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 750, stock: 4, min_stock: 5 },
    { name: 'Suco de Tamarindo', description: 'Suco artesanal de tamarindo equilibrado (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 700, stock: 9, min_stock: 4 },
    { name: 'Suco de Beterraba com Laranja', description: 'Suco energético natural de beterraba com laranja (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 750, stock: 8, min_stock: 4 },
    { name: 'Suco de Limão', description: 'Limonada natural feita na hora (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 600, stock: 20, min_stock: 6 },
    { name: 'Suco de Morango', description: 'Suco natural de morangos selecionados (330ml)', category: 'Sucos', image_url: SUCO_IMG, price_cents: 750, stock: 3, min_stock: 5 },

    // Vitaminas
    { name: 'Vitamina de Morango', description: 'Batida cremosa de morango com leite gelado (350ml)', category: 'Vitaminas', image_url: VITAMINA_IMG, price_cents: 900, stock: 14, min_stock: 4 },
    { name: 'Vitamina de Maracujá', description: 'Vitamina cremosa de maracujá com leite (350ml)', category: 'Vitaminas', image_url: VITAMINA_IMG, price_cents: 850, stock: 10, min_stock: 4 },
    { name: 'Vitamina de Goiaba', description: 'Vitamina encorpada de goiaba com leite (350ml)', category: 'Vitaminas', image_url: VITAMINA_IMG, price_cents: 850, stock: 11, min_stock: 4 },
    { name: 'Vitamina de Manga', description: 'Vitamina tropical de manga batida no leite (350ml)', category: 'Vitaminas', image_url: VITAMINA_IMG, price_cents: 850, stock: 12, min_stock: 4 },
    { name: 'Vitamina de Acerola', description: 'Vitamina suave de acerola com leite (350ml)', category: 'Vitaminas', image_url: VITAMINA_IMG, price_cents: 850, stock: 8, min_stock: 4 },
    { name: 'Vitamina de Abacaxi com Hortelã', description: 'Vitamina refrescante de abacaxi com hortelã (350ml)', category: 'Vitaminas', image_url: VITAMINA_IMG, price_cents: 900, stock: 7, min_stock: 4 },

    // Trufas (from attached spreadsheet)
    { name: 'Trufa de Maracujá', description: 'Casquinha de chocolate ao leite com ganache de maracujá (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 450, stock: 22, min_stock: 6 },
    { name: 'Trufa de Morango', description: 'Trufa recheada com creme suave de morango (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 450, stock: 19, min_stock: 6 },
    { name: 'Trufa de Ninho', description: 'Recheio cremoso de brigadeiro de Leite Ninho (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 500, stock: 4, min_stock: 8 },
    { name: 'Trufa de Ninho com Nutella', description: 'Recheio duplo de Leite Ninho e creme de avelã (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 550, stock: 16, min_stock: 6 },
    { name: 'Trufa de Castanha', description: 'Chocolate ao leite com creme e pedaços de castanha (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 500, stock: 14, min_stock: 5 },
    { name: 'Trufa de Limão', description: 'Trufa com mousse cítrica de limão tahiti (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 450, stock: 15, min_stock: 5 },
    { name: 'Trufa de Brigadeiro', description: 'Trufa tradicional com brigadeiro cremoso 50% cacau (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 450, stock: 24, min_stock: 8 },
    { name: 'Trufa de Amendoim', description: 'Trufa com creme artesanal de amendoim torrado (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 450, stock: 12, min_stock: 5 },
    { name: 'Trufa de Beijinho', description: 'Chocolate branco com recheio cremoso de coco (50g)', category: 'Trufas', image_url: TRUFA_IMG, price_cents: 450, stock: 13, min_stock: 5 },

    // Lanches & Bebidas
    { name: 'Água Mineral sem Gás 500ml', description: 'Garrafa gelada de água mineral natural', category: 'Lanches & Bebidas', image_url: LANCHE_IMG, price_cents: 300, stock: 30, min_stock: 10 },
    { name: 'Café Expresso', description: 'Dose de café expresso moído na hora (60ml)', category: 'Lanches & Bebidas', image_url: LANCHE_IMG, price_cents: 350, stock: 40, min_stock: 10 },
    { name: 'Biscoito Integral Salgado', description: 'Pacote individual crocante de ervas finas (130g)', category: 'Lanches & Bebidas', image_url: LANCHE_IMG, price_cents: 500, stock: 2, min_stock: 5 },
  ];

  const initialEmployees = [
    { name: 'Ana Paula Silva', code: 'F001', department: 'Financeiro', phone: '(11) 99123-4401', email: 'ana.silva@empresa.com.br', pin: '1234' },
    { name: 'Carlos Eduardo Souza', code: 'F002', department: 'Operações', phone: '(11) 99234-5502', email: 'carlos.souza@empresa.com.br', pin: '1234' },
    { name: 'Mariana Costa', code: 'F003', department: 'Comercial', phone: '(11) 99345-6603', email: 'mariana.costa@empresa.com.br', pin: '1234' },
    { name: 'Rafael Mendes', code: 'F004', department: 'Logística', phone: '(11) 99456-7704', email: 'rafael.mendes@empresa.com.br', pin: '1234' },
    { name: 'Juliana Rocha', code: 'F005', department: 'Recursos Humanos', phone: '(11) 99567-8805', email: 'juliana.rocha@empresa.com.br', pin: '1234' },
    { name: 'Lucas Ferreira', code: 'F006', department: 'Tecnologia', phone: '(11) 99678-9906', email: 'lucas.ferreira@empresa.com.br', pin: '1234' },
  ];

  runInTransaction(() => {
    const baseTime = daysAgoIso(14, 8, 0);
    const insertProduct = db.prepare(`
      INSERT INTO products (name, description, category, image_url, price_cents, stock, min_stock, available, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const insertStockMove = db.prepare(`
      INSERT INTO stock_movements (product_id, type, quantity_delta, stock_before, stock_after, reason, reference_id, created_by, created_at)
      VALUES (?, 'entry', ?, 0, ?, 'Carga inicial de estoque', NULL, 'Administrador', ?)
    `);

    const productIds: Record<string, { id: number; price_cents: number }> = {};
    for (const p of initialProducts) {
      const res = insertProduct.run(p.name, p.description, p.category, p.image_url, p.price_cents, p.stock, p.min_stock, baseTime, baseTime);
      const pid = Number(res.lastInsertRowid);
      productIds[p.name] = { id: pid, price_cents: p.price_cents };
      insertStockMove.run(pid, p.stock, p.stock, baseTime);
    }

    // Add 2 historical price updates so Price History works immediately
    const ninho = productIds['Trufa de Ninho com Nutella'];
    if (ninho) {
      db.prepare(`
        INSERT INTO price_history (product_id, old_price_cents, new_price_cents, reason, changed_by, created_at)
        VALUES (?, 500, 550, 'Reajuste de custo do creme de avelã', 'Administrador', ?)
      `).run(ninho.id, daysAgoIso(10, 9, 15));
    }
    const vitMorango = productIds['Vitamina de Morango'];
    if (vitMorango) {
      db.prepare(`
        INSERT INTO price_history (product_id, old_price_cents, new_price_cents, reason, changed_by, created_at)
        VALUES (?, 850, 900, 'Atualização sazonal da polpa de morango', 'Administrador', ?)
      `).run(vitMorango.id, daysAgoIso(9, 14, 30));
    }

    const insertEmployee = db.prepare(`
      INSERT INTO employees (name, code, department, phone, email, pin, active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `);
    const empIds: Record<string, number> = {};
    for (const e of initialEmployees) {
      const res = insertEmployee.run(e.name, e.code, e.department, e.phone, e.email, e.pin, baseTime);
      empIds[e.code] = Number(res.lastInsertRowid);
    }

    // Helper to seed realistic sales with stock deduction
    const seedSale = (empCode: string, daysAgo: number, hour: number, minute: number, items: Array<[string, number]>, notes = '') => {
      const empId = empIds[empCode];
      const createdAt = daysAgoIso(daysAgo, hour, minute);
      let total = 0;
      const resolvedItems: Array<{ pid: number; name: string; qty: number; price: number; subtotal: number }> = [];
      for (const [prodName, qty] of items) {
        const prod = db.prepare('SELECT id, name, price_cents, stock FROM products WHERE name = ?').get(prodName) as { id: number; name: string; price_cents: number; stock: number };
        const sub = prod.price_cents * qty;
        total += sub;
        resolvedItems.push({ pid: prod.id, name: prod.name, qty, price: prod.price_cents, subtotal: sub });
      }
      const saleRes = db.prepare(`
        INSERT INTO sales (employee_id, total_cents, status, notes, created_by, created_at)
        VALUES (?, ?, 'active', ?, 'Administrador', ?)
      `).run(empId, total, notes, createdAt);
      const saleId = Number(saleRes.lastInsertRowid);

      for (const item of resolvedItems) {
        db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(saleId, item.pid, item.name, item.qty, item.price, item.subtotal);

        const cur = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.pid) as { stock: number };
        const newStock = Math.max(0, cur.stock - item.qty);
        db.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(newStock, createdAt, item.pid);
        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity_delta, stock_before, stock_after, reason, reference_id, created_by, created_at)
          VALUES (?, 'sale', ?, ?, ?, ?, ?, 'Administrador', ?)
        `).run(item.pid, -item.qty, cur.stock, newStock, `Venda #${saleId}`, saleId, createdAt);
      }
    };

    const seedPayment = (empCode: string, daysAgo: number, hour: number, minute: number, amountCents: number, method: string, notes: string) => {
      const empId = empIds[empCode];
      const createdAt = daysAgoIso(daysAgo, hour, minute);
      const consumed = db.prepare(`SELECT COALESCE(SUM(total_cents), 0) as s FROM sales WHERE employee_id = ? AND status = 'active'`).get(empId) as { s: number };
      const paid = db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) as p FROM payments WHERE employee_id = ?`).get(empId) as { p: number };
      const balanceAfter = consumed.s - (paid.p + amountCents);
      db.prepare(`
        INSERT INTO payments (employee_id, amount_cents, method, received_by, notes, balance_after_cents, created_at)
        VALUES (?, ?, ?, 'Administrador', ?, ?, ?)
      `).run(empId, amountCents, method, notes, balanceAfter, createdAt);
    };

    // Seed past week sales & partial/full payments
    seedSale('F001', 6, 10, 15, [['Suco de Maracujá', 1], ['Trufa de Ninho com Nutella', 1]], 'Lanche da manhã');
    seedSale('F001', 3, 15, 20, [['Vitamina de Morango', 1], ['Trufa de Brigadeiro', 2]]);
    seedPayment('F001', 2, 17, 0, 1250, 'Pix', 'Acerto parcial da semana');
    seedSale('F001', 0, 9, 40, [['Suco de Abacaxi com Hortelã', 1], ['Trufa de Ninho', 1]]);

    seedSale('F002', 5, 14, 10, [['Suco de Acerola', 2], ['Trufa de Castanha', 1]]);
    seedSale('F002', 2, 11, 5, [['Vitamina de Manga', 1], ['Biscoito Integral Salgado', 1]]);
    seedSale('F002', 0, 10, 30, [['Café Expresso', 2], ['Trufa de Amendoim', 1]]);

    seedSale('F003', 5, 16, 0, [['Vitamina de Goiaba', 1], ['Trufa de Limão', 2]]);
    seedPayment('F003', 4, 18, 0, 1750, 'Pix', 'Quitação integral');
    seedSale('F003', 1, 15, 10, [['Suco de Morango', 1], ['Trufa de Beijinho', 1]]);

    seedSale('F004', 4, 9, 30, [['Suco de Cajá', 1], ['Trufa de Maracujá', 2]]);
    seedSale('F004', 1, 14, 45, [['Suco de Limão', 1], ['Água Mineral sem Gás 500ml', 2]]);

    seedSale('F005', 3, 13, 20, [['Vitamina de Morango', 1], ['Trufa de Ninho com Nutella', 1]]);
    seedPayment('F005', 1, 16, 30, 1450, 'Desconto em Folha', 'Fechamento quinzenal');

    seedSale('F006', 2, 16, 15, [['Suco de Beterraba com Laranja', 1], ['Trufa de Ninho', 2]]);
    seedSale('F006', 0, 11, 20, [['Café Expresso', 1], ['Trufa de Morango', 1]]);
  });
}

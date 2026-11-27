import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase, runInTransaction } from './server/db.ts';

initDatabase();

const app = express();
app.use(express.json({ limit: '5mb' }));

// Local development keeps the existing single-user SQLite workflow.
app.get('/api/auth/status', (_req, res) => res.json({ authenticated: true }));
app.post('/api/auth/logout', (_req, res) => res.json({ authenticated: true }));

function getNowIso() {
  return new Date().toISOString();
}

function attachSaleItems(
  salesRows: Array<Record<string, unknown>>
): Array<Record<string, unknown> & { items: Array<Record<string, unknown>> }> {
  if (salesRows.length === 0) return [];
  const saleIds = salesRows.map((s) => Number(s.id));
  const placeholders = saleIds.map(() => '?').join(',');
  const items = db
    .prepare(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders}) ORDER BY id ASC`)
    .all(...saleIds) as Array<Record<string, unknown>>;
  const bySale = new Map<number, Array<Record<string, unknown>>>();
  for (const item of items) {
    const sid = Number(item.sale_id);
    if (!bySale.has(sid)) bySale.set(sid, []);
    bySale.get(sid)!.push(item);
  }
  return salesRows.map((s) => ({
    ...s,
    items: bySale.get(Number(s.id)) ?? [],
  }));
}

function getEmployeeBalanceCents(employeeId: number): number {
  const consumed = db
    .prepare(`SELECT COALESCE(SUM(total_cents), 0) as total FROM sales WHERE employee_id = ? AND status = 'active'`)
    .get(employeeId) as { total: number };
  const paid = db
    .prepare(`SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE employee_id = ?`)
    .get(employeeId) as { total: number };
  return Number(consumed.total) - Number(paid.total);
}


app.get('/api/store-info', (_req, res) => res.json({ id: 1, slug: 'local', store_name: 'Tem o quê?', username: 'local', store_type: process.env.LOCAL_STORE_TYPE === 'lite' ? 'lite' : 'complete', created_at: '' }));
app.get('/api/customers', (_req, res) => {
  const rows = db.prepare('SELECT id,name,code,department,phone,email,active,created_at FROM employees WHERE active=1 ORDER BY name COLLATE NOCASE').all() as Array<Record<string, unknown>>;
  res.json(rows.map((row) => ({ ...row, total_consumed_cents: 0, total_paid_cents: 0, balance_cents: 0, last_activity_at: null })));
});
app.post('/api/customers', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'Informe o nome do cliente.' });
  const existing = db.prepare('SELECT id,name,code,department,phone,email,active,created_at FROM employees WHERE lower(trim(name))=lower(trim(?)) AND active=1 ORDER BY id LIMIT 1').get(name) as Record<string, unknown> | undefined;
  if (existing) return res.json(existing);
  const code = `L${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const now = getNowIso();
  const info = db.prepare("INSERT INTO employees(name,code,department,phone,email,pin,active,created_at) VALUES(?,?, '', '', '', '1234',1,?)").run(name, code, now);
  res.status(201).json(db.prepare('SELECT id,name,code,department,phone,email,active,created_at FROM employees WHERE id=?').get(Number(info.lastInsertRowid)));
});
app.get('/api/pending-sales', (_req, res) => {
  const rows = db.prepare("SELECT s.*,e.name employee_name,e.department employee_department FROM sales s JOIN employees e ON e.id=s.employee_id WHERE s.status='active' AND s.payment_status='pending' ORDER BY s.created_at,s.id").all() as Array<Record<string, unknown>>;
  res.json(attachSaleItems(rows));
});
app.post('/api/sales/:id/settle', (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare("SELECT * FROM sales WHERE id=? AND status='active'").get(id) as Record<string, unknown> | undefined;
  if (!sale) return res.status(404).json({ error: 'Venda não encontrada ou inativa.' });
  if (sale.payment_status !== 'pending') return res.status(409).json({ error: 'Esta venda não está pendente.' });
  db.prepare("UPDATE sales SET payment_status='paid',paid_at=? WHERE id=? AND status='active' AND payment_status='pending'").run(getNowIso(), id);
  const row = db.prepare('SELECT s.*,e.name employee_name,e.department employee_department FROM sales s JOIN employees e ON e.id=s.employee_id WHERE s.id=?').get(id) as Record<string, unknown>;
  res.json(attachSaleItems([row])[0]);
});

// Store Settings (Logo, Pix Key, Billing Template)
app.get('/api/settings', (_req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM store_settings WHERE id = 1`).get();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/settings', (req, res) => {
  try {
    const existing = db.prepare(`SELECT * FROM store_settings WHERE id = 1`).get() as Record<string, unknown> | undefined;
    const {
      store_name = existing?.store_name ?? 'Marlene Interprise',
      logo_data_url = existing?.logo_data_url ?? '',
      pix_key = existing?.pix_key ?? '',
      pix_key_type = existing?.pix_key_type ?? 'auto',
      pix_beneficiary_name = existing?.pix_beneficiary_name ?? 'MARLENE INTERPRISE',
      pix_city = existing?.pix_city ?? 'SAO PAULO',
      billing_message_template = existing?.billing_message_template ?? '',
      brand_primary_color = existing?.brand_primary_color ?? '#047857',
      brand_secondary_color = existing?.brand_secondary_color ?? '#f59e0b',
    } = req.body ?? {};

    const cleanName = String(store_name).trim() || 'Marlene Interprise';
    const cleanLogo = String(logo_data_url ?? '').trim();
    if (cleanLogo && !cleanLogo.startsWith('data:image/') && !cleanLogo.startsWith('/')) {
      return res.status(400).json({ error: 'Formato de logotipo inválido.' });
    }
    const cleanPixKey = String(pix_key ?? '').trim();
    const allowedTypes = ['auto', 'telefone', 'cpf_cnpj', 'email', 'aleatoria'];
    const cleanPixType = allowedTypes.includes(String(pix_key_type)) ? String(pix_key_type) : 'auto';
    const cleanBeneficiary = String(pix_beneficiary_name ?? 'MARLENE INTERPRISE').trim() || 'MARLENE INTERPRISE';
    const cleanCity = String(pix_city ?? 'SAO PAULO').trim() || 'SAO PAULO';
    const cleanTemplate = String(billing_message_template ?? '');
    const cleanPrimaryColor = /^#[0-9a-fA-F]{6}$/.test(String(brand_primary_color)) ? String(brand_primary_color) : '#047857';
    const cleanSecondaryColor = /^#[0-9a-fA-F]{6}$/.test(String(brand_secondary_color)) ? String(brand_secondary_color) : '#f59e0b';
    const now = getNowIso();

    db.prepare(`
      UPDATE store_settings
      SET store_name = ?,
          logo_data_url = ?,
          pix_key = ?,
          pix_key_type = ?,
          pix_beneficiary_name = ?,
          pix_city = ?,
          billing_message_template = ?,
          brand_primary_color = ?,
          brand_secondary_color = ?,
          updated_at = ?
      WHERE id = 1
    `).run(cleanName, cleanLogo, cleanPixKey, cleanPixType, cleanBeneficiary, cleanCity, cleanTemplate, cleanPrimaryColor, cleanSecondaryColor, now);

    const updated = db.prepare(`SELECT * FROM store_settings WHERE id = 1`).get();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/loyalty/settings', (_req, res) => {
  const row = db.prepare('SELECT * FROM loyalty_settings WHERE id = 1').get();
  res.json(row);
});

app.put('/api/loyalty/settings', (req, res) => {
  const data = req.body ?? {};
  const previous = db.prepare('SELECT enabled, starts_at FROM loyalty_settings WHERE id=1').get() as { enabled: number; starts_at: string | null };
  const stamp = getNowIso();
  const mode = data.mode === 'general' ? 'general' : 'product';
  const enabled = data.enabled ? 1 : 0;
  const productId = Number(data.product_id) || null;
  const productQuantity = Math.max(1, Math.min(10000, Math.round(Number(data.product_quantity) || 1)));
  const rewardQuantity = Math.max(1, Math.min(10000, Math.round(Number(data.reward_quantity) || 1)));
  const purchaseThreshold = Math.max(1, Math.min(10000, Math.round(Number(data.purchase_threshold) || 1)));
  const rewardCredits = Math.max(1, Math.min(10000, Math.round(Number(data.reward_credits) || 1)));
  const cardColor = /^#[0-9a-fA-F]{6}$/.test(String(data.card_color ?? '')) ? String(data.card_color) : '#047857';
  const cardTitle = String(data.card_title ?? '').trim().slice(0, 48) || 'Cartão fidelidade';
  const cardMessage = String(data.card_message ?? '').trim().slice(0, 120) || 'Junte pontos e ganhe recompensas!';
  if (enabled && mode === 'product' && (!productId || !db.prepare('SELECT id FROM products WHERE id = ?').get(productId))) {
    return res.status(400).json({ error: 'Selecione o produto da promoção de fidelidade.' });
  }
  const startsAt = enabled && (!previous.enabled || !previous.starts_at) ? stamp : previous.starts_at;
  db.prepare(`UPDATE loyalty_settings SET enabled=?,mode=?,card_title=?,card_message=?,card_color=?,product_id=?,product_quantity=?,reward_quantity=?,purchase_threshold=?,reward_credits=?,starts_at=?,updated_at=? WHERE id=1`)
    .run(enabled, mode, cardTitle, cardMessage, cardColor, productId, productQuantity, rewardQuantity, purchaseThreshold, rewardCredits, startsAt, stamp);
  res.json(db.prepare('SELECT * FROM loyalty_settings WHERE id=1').get());
});

app.get('/api/loyalty/cards/:employeeId', (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const config = db.prepare('SELECT * FROM loyalty_settings WHERE id=1').get() as Record<string, unknown>;
  if (!db.prepare('SELECT id FROM employees WHERE id=?').get(employeeId)) return res.status(404).json({ error: 'Cliente não encontrado.' });
  const purchases = db.prepare("SELECT COUNT(*) AS total FROM sales WHERE employee_id=? AND status='active' AND created_at>=?").get(employeeId, String(config.starts_at ?? '')) as { total: number };
  if (config.mode === 'general') {
    const total = Number(purchases.total);
    const target = Number(config.purchase_threshold);
    return res.json({ mode: 'general', total_purchases: total, total_product_units: 0, progress: total % target, target, rewards: 0, credits: Math.floor(total / target) * Number(config.reward_credits), product_name: '' });
  }
  const units = db.prepare("SELECT COALESCE(SUM(si.quantity),0) AS total FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.employee_id=? AND s.status='active' AND si.product_id=? AND s.created_at>=?").get(employeeId, Number(config.product_id ?? 0), String(config.starts_at ?? '')) as { total: number };
  const total = Number(units.total);
  const target = Number(config.product_quantity);
  const product = config.product_id ? db.prepare('SELECT name FROM products WHERE id=?').get(Number(config.product_id)) as { name: string } | undefined : undefined;
  return res.json({ mode: 'product', total_purchases: Number(purchases.total), total_product_units: total, progress: total % target, target, rewards: Math.floor(total / target) * Number(config.reward_quantity), credits: 0, product_name: product?.name ?? 'Produto' });
});

// Dashboard summary
app.get('/api/dashboard', (_req, res) => {
  try {
    const revRow = db
      .prepare(`SELECT COALESCE(SUM(total_cents), 0) as total FROM sales WHERE status = 'active'`)
      .get() as { total: number };
    const paidRow = db
      .prepare(`SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments`)
      .get() as { total: number };

    const employees = db.prepare(`SELECT id FROM employees`).all() as Array<{ id: number }>;
    let totalPendingCents = 0;
    let debtorsCount = 0;
    for (const emp of employees) {
      const bal = getEmployeeBalanceCents(emp.id);
      if (bal > 0) {
        totalPendingCents += bal;
        debtorsCount += 1;
      }
    }

    const lowStockProducts = db
      .prepare(`SELECT * FROM products WHERE stock <= min_stock ORDER BY stock ASC, name ASC`)
      .all();

    const topProducts = db
      .prepare(`
        SELECT
          si.product_id,
          si.product_name,
          COALESCE(p.category, 'Outros') as category,
          SUM(si.quantity) as units_sold,
          SUM(si.subtotal_cents) as revenue_cents
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE s.status = 'active'
        GROUP BY si.product_id, si.product_name
        ORDER BY units_sold DESC, revenue_cents DESC
        LIMIT 6
      `)
      .all();

    const recentSalesRaw = db
      .prepare(`
        SELECT s.*, e.name as employee_name, e.department as employee_department
        FROM sales s
        JOIN employees e ON e.id = s.employee_id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 6
      `)
      .all() as Array<Record<string, unknown>>;

    const recentPayments = db
      .prepare(`
        SELECT p.*, e.name as employee_name
        FROM payments p
        JOIN employees e ON e.id = p.employee_id
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 6
      `)
      .all();

    res.json({
      total_revenue_cents: Number(revRow.total),
      total_credit_sales_cents: Number(revRow.total),
      total_received_cents: Number(paidRow.total),
      total_pending_cents: totalPendingCents,
      debtors_count: debtorsCount,
      low_stock_products: lowStockProducts,
      top_products: topProducts,
      recent_sales: attachSaleItems(recentSalesRaw),
      recent_payments: recentPayments,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Products
app.get('/api/products', (_req, res) => {
  try {
    const rows = db
      .prepare(`SELECT * FROM products ORDER BY category ASC, name ASC`)
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const { name, description = '', category, image_url = '', price_cents, stock = 0, min_stock = 5, available = 1, created_by = 'Administrador' } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório.' });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Categoria é obrigatória.' });
    }
    const priceInt = Math.round(Number(price_cents));
    const stockInt = Math.max(0, Math.round(Number(stock)));
    const minStockInt = Math.max(0, Math.round(Number(min_stock)));
    if (!Number.isFinite(priceInt) || priceInt < 0) {
      return res.status(400).json({ error: 'Preço inválido.' });
    }

    const now = getNowIso();
    const created = runInTransaction(() => {
      const info = db
        .prepare(`
          INSERT INTO products (name, description, category, image_url, price_cents, stock, min_stock, available, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          name.trim(),
          String(description).trim(),
          category.trim(),
          String(image_url).trim(),
          priceInt,
          stockInt,
          minStockInt,
          available ? 1 : 0,
          now,
          now
        );
      const pid = Number(info.lastInsertRowid);
      if (stockInt > 0) {
        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity_delta, stock_before, stock_after, reason, reference_id, created_by, created_at)
          VALUES (?, 'entry', ?, 0, ?, 'Cadastro inicial do produto', NULL, ?, ?)
        `).run(pid, stockInt, stockInt, String(created_by), now);
      }
      return db.prepare(`SELECT * FROM products WHERE id = ?`).get(pid);
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    const usedInSales = db.prepare('SELECT id FROM sale_items WHERE product_id = ? LIMIT 1').get(id);
    if (usedInSales) {
      return res.status(409).json({ error: 'Este produto aparece no histórico de vendas e não pode ser excluído. Você pode pausá-lo no catálogo.' });
    }
    runInTransaction(() => {
      db.prepare('DELETE FROM price_history WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
    });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const {
      name = existing.name,
      description = existing.description,
      category = existing.category,
      image_url = existing.image_url,
      price_cents = existing.price_cents,
      min_stock = existing.min_stock,
      available = existing.available,
      price_reason = 'Alteração de tabela de preços',
      changed_by = 'Administrador',
    } = req.body;

    const priceInt = Math.round(Number(price_cents));
    const minStockInt = Math.max(0, Math.round(Number(min_stock)));
    if (!Number.isFinite(priceInt) || priceInt < 0) {
      return res.status(400).json({ error: 'Preço inválido.' });
    }

    const now = getNowIso();
    const updated = runInTransaction(() => {
      if (priceInt !== Number(existing.price_cents)) {
        db.prepare(`
          INSERT INTO price_history (product_id, old_price_cents, new_price_cents, reason, changed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, Number(existing.price_cents), priceInt, String(price_reason || 'Atualização de preço').trim(), String(changed_by), now);
      }

      db.prepare(`
        UPDATE products
        SET name = ?, description = ?, category = ?, image_url = ?, price_cents = ?, min_stock = ?, available = ?, updated_at = ?
        WHERE id = ?
      `).run(
        String(name).trim(),
        String(description).trim(),
        String(category).trim(),
        String(image_url).trim(),
        priceInt,
        minStockInt,
        available ? 1 : 0,
        now,
        id
      );

      return db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/price-history', (req, res) => {
  try {
    const productId = req.query.productId ? Number(req.query.productId) : null;
    if (productId) {
      const rows = db
        .prepare(`
          SELECT ph.*, p.name as product_name
          FROM price_history ph
          JOIN products p ON p.id = ph.product_id
          WHERE ph.product_id = ?
          ORDER BY ph.created_at DESC, ph.id DESC
        `)
        .all(productId);
      return res.json(rows);
    }
    const rows = db
      .prepare(`
        SELECT ph.*, p.name as product_name
        FROM price_history ph
        JOIN products p ON p.id = ph.product_id
        ORDER BY ph.created_at DESC, ph.id DESC
        LIMIT 100
      `)
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Stock adjustment & entry
app.post('/api/products/:id/stock', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { type, quantity, new_stock, reason = '', created_by = 'Administrador' } = req.body;
    const product = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as { id: number; stock: number; name: string } | undefined;
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'Justificativa da movimentação é obrigatória.' });
    }

    const stockBefore = Number(product.stock);
    let stockAfter = stockBefore;
    let delta = 0;

    if (type === 'entry') {
      const qty = Math.round(Number(quantity));
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Quantidade de entrada deve ser maior que zero.' });
      }
      delta = qty;
      stockAfter = stockBefore + qty;
    } else if (type === 'adjustment') {
      const target = Math.round(Number(new_stock));
      if (!Number.isFinite(target) || target < 0) {
        return res.status(400).json({ error: 'Novo estoque inválido.' });
      }
      delta = target - stockBefore;
      stockAfter = target;
      if (delta === 0) {
        return res.status(400).json({ error: 'A quantidade informada já é o estoque atual.' });
      }
    } else {
      return res.status(400).json({ error: 'Tipo de movimentação inválido.' });
    }

    const now = getNowIso();
    const updatedProduct = runInTransaction(() => {
      db.prepare(`UPDATE products SET stock = ?, updated_at = ? WHERE id = ?`).run(stockAfter, now, id);
      db.prepare(`
        INSERT INTO stock_movements (product_id, type, quantity_delta, stock_before, stock_after, reason, reference_id, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(id, type, delta, stockBefore, stockAfter, String(reason).trim(), String(created_by), now);
      return db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    });

    res.json(updatedProduct);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/stock-movements', (_req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT sm.*, p.name as product_name, p.category as product_category
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        ORDER BY sm.created_at DESC, sm.id DESC
        LIMIT 200
      `)
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Employees
app.get('/api/employees', (_req, res) => {
  try {
    const employees = db.prepare(`SELECT id, name, code, department, phone, email, active, created_at FROM employees ORDER BY name ASC`).all() as Array<Record<string, unknown>>;
    const enriched = employees.map((emp) => {
      const eid = Number(emp.id);
      const consumedRow = db
        .prepare(`SELECT COALESCE(SUM(total_cents), 0) as total, MAX(created_at) as last_sale FROM sales WHERE employee_id = ? AND status = 'active'`)
        .get(eid) as { total: number; last_sale: string | null };
      const paidRow = db
        .prepare(`SELECT COALESCE(SUM(amount_cents), 0) as total, MAX(created_at) as last_pay FROM payments WHERE employee_id = ?`)
        .get(eid) as { total: number; last_pay: string | null };
      const totalConsumed = Number(consumedRow.total);
      const totalPaid = Number(paidRow.total);
      const dates = [consumedRow.last_sale, paidRow.last_pay].filter(Boolean) as string[];
      dates.sort();
      return {
        ...emp,
        total_consumed_cents: totalConsumed,
        total_paid_cents: totalPaid,
        balance_cents: totalConsumed - totalPaid,
        last_activity_at: dates.length ? dates[dates.length - 1] : null,
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/employees', (req, res) => {
  try {
    const { name, code, department = '', phone = '', email = '', pin = '1234' } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
    }
    const cleanCode = code && String(code).trim()
      ? String(code).trim().toUpperCase()
      : `F${String(Math.floor(100 + Math.random() * 900))}`;

    const now = getNowIso();
    const info = db
      .prepare(`
        INSERT INTO employees (name, code, department, phone, email, pin, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `)
      .run(
        String(name).trim(),
        cleanCode,
        String(department).trim(),
        String(phone).trim(),
        String(email).trim(),
        String(pin || '1234').trim(),
        now
      );

    const created = db.prepare(`SELECT id, name, code, department, phone, email, active, created_at FROM employees WHERE id = ?`).get(Number(info.lastInsertRowid)) as Record<string, unknown>;
    res.status(201).json({
      ...created,
      total_consumed_cents: 0,
      total_paid_cents: 0,
      balance_cents: 0,
      last_activity_at: null,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Código de cliente já está em uso.' });
    }
    res.status(500).json({ error: msg });
  }
});

app.put('/api/employees/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM employees WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const {
      name = existing.name,
      code = existing.code,
      department = existing.department,
      phone = existing.phone,
      email = existing.email,
      active = existing.active,
    } = req.body;

    db.prepare(`
      UPDATE employees
      SET name = ?, code = ?, department = ?, phone = ?, email = ?, active = ?
      WHERE id = ?
    `).run(
      String(name).trim(),
      String(code).trim().toUpperCase(),
      String(department).trim(),
      String(phone).trim(),
      String(email).trim(),
      active ? 1 : 0,
      id
    );

    const updated = db.prepare(`SELECT id, name, code, department, phone, email, active, created_at FROM employees WHERE id = ?`).get(id) as Record<string, unknown>;
    const consumed = db
      .prepare(`SELECT COALESCE(SUM(total_cents), 0) as total FROM sales WHERE employee_id = ? AND status = 'active'`)
      .get(id) as { total: number };
    const paid = db
      .prepare(`SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE employee_id = ?`)
      .get(id) as { total: number };
    res.json({
      ...updated,
      total_consumed_cents: Number(consumed.total),
      total_paid_cents: Number(paid.total),
      balance_cents: Number(consumed.total) - Number(paid.total),
      last_activity_at: null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/employees/:id/statement', (req, res) => {
  try {
    const id = Number(req.params.id);
    const empRow = db
      .prepare(`SELECT id, name, code, department, phone, email, active, created_at FROM employees WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!empRow) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const salesRaw = db
      .prepare(`
        SELECT s.*, e.name as employee_name, e.department as employee_department
        FROM sales s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.employee_id = ?
        ORDER BY s.created_at ASC, s.id ASC
      `)
      .all(id) as Array<Record<string, unknown>>;
    const sales = attachSaleItems(salesRaw);

    const payments = db
      .prepare(`
        SELECT p.*, e.name as employee_name
        FROM payments p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.employee_id = ?
        ORDER BY p.created_at ASC, p.id ASC
      `)
      .all(id) as Array<Record<string, unknown>>;

    type RawEvent =
      | { kind: 'sale'; created_at: string; sortId: number; sale: Record<string, unknown> }
      | { kind: 'payment'; created_at: string; sortId: number; payment: Record<string, unknown> };

    const events: RawEvent[] = [
      ...sales.map((s) => ({ kind: 'sale' as const, created_at: String(s.created_at), sortId: Number(s.id), sale: s })),
      ...payments.map((p) => ({ kind: 'payment' as const, created_at: String(p.created_at), sortId: Number(p.id), payment: p })),
    ];

    events.sort((a, b) => {
      const t = a.created_at.localeCompare(b.created_at);
      if (t !== 0) return t;
      return a.kind === b.kind ? a.sortId - b.sortId : a.kind === 'sale' ? -1 : 1;
    });

    let running = 0;
    let totalConsumed = 0;
    let totalPaid = 0;

    const ledger = events.map((ev) => {
      if (ev.kind === 'sale') {
        const st = String(ev.sale.status);
        const total = Number(ev.sale.total_cents);
        if (st === 'active') {
          running += total;
          totalConsumed += total;
        }
        return {
          uid: `sale-${ev.sale.id}`,
          kind: 'sale' as const,
          created_at: ev.created_at,
          title: `Compra #${ev.sale.id}`,
          status: st,
          amount_cents: total,
          running_balance_cents: running,
          sale: ev.sale,
        };
      } else {
        const amt = Number(ev.payment.amount_cents);
        running -= amt;
        totalPaid += amt;
        return {
          uid: `pay-${ev.payment.id}`,
          kind: 'payment' as const,
          created_at: ev.created_at,
          title: `Pagamento (${ev.payment.method})`,
          amount_cents: amt,
          running_balance_cents: running,
          payment: ev.payment,
        };
      }
    });

    const lastDate = ledger.length ? ledger[ledger.length - 1].created_at : null;
    res.json({
      employee: {
        ...empRow,
        total_consumed_cents: totalConsumed,
        total_paid_cents: totalPaid,
        balance_cents: totalConsumed - totalPaid,
        last_activity_at: lastDate,
      },
      ledger: ledger.reverse(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Sales
app.get('/api/sales', (_req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT s.*, e.name as employee_name, e.department as employee_department
        FROM sales s
        JOIN employees e ON e.id = s.employee_id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 200
      `)
      .all() as Array<Record<string, unknown>>;
    res.json(attachSaleItems(rows));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

function createSaleInternal(params: {
  employeeId: number;
  items: Array<{ product_id: number; quantity: number }>;
  notes: string;
  createdBy: string;
  correctedFromSaleId?: number | null;
  paymentStatus?: 'untracked' | 'paid' | 'pending';
}) {
  const { employeeId, items, notes, createdBy, correctedFromSaleId = null } = params;
  const employee = db.prepare(`SELECT id, name, active FROM employees WHERE id = ?`).get(employeeId) as { id: number; name: string; active: number } | undefined;
  if (!employee) {
    throw new Error('Cliente não encontrado.');
  }
  if (!employee.active) {
    throw new Error('Cliente está inativo.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Adicione pelo menos um produto à venda.');
  }

  // Merge duplicate product_ids cleanly
  const mergedMap = new Map<number, number>();
  for (const it of items) {
    const pid = Number(it.product_id);
    const qty = Math.round(Number(it.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error('Quantidade de produto inválida.');
    }
    mergedMap.set(pid, (mergedMap.get(pid) ?? 0) + qty);
  }

  const now = getNowIso();
  let totalCents = 0;
  const resolved: Array<{ pid: number; name: string; qty: number; priceCents: number; subtotalCents: number; stockBefore: number }> = [];

  for (const [pid, qty] of mergedMap.entries()) {
    const prod = db.prepare(`SELECT id, name, price_cents, stock, available FROM products WHERE id = ?`).get(pid) as
      | { id: number; name: string; price_cents: number; stock: number; available: number }
      | undefined;
    if (!prod) {
      throw new Error(`Produto #${pid} não encontrado.`);
    }
    if (!prod.available) {
      throw new Error(`O produto "${prod.name}" está indisponível para venda.`);
    }
    if (prod.stock < qty) {
      throw new Error(`Estoque insuficiente para "${prod.name}" (disponível: ${prod.stock}).`);
    }
    const subtotalCents = prod.price_cents * qty;
    totalCents += subtotalCents;
    resolved.push({
      pid: prod.id,
      name: prod.name,
      qty,
      priceCents: prod.price_cents,
      subtotalCents,
      stockBefore: prod.stock,
    });
  }

  const saleRes = db
    .prepare(`
      INSERT INTO sales (employee_id, total_cents, status, notes, corrected_from_sale_id, created_by, created_at, payment_status, paid_at)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)
    `)
    .run(employeeId, totalCents, notes.trim(), correctedFromSaleId, createdBy, now, params.paymentStatus ?? 'untracked', params.paymentStatus === 'paid' ? now : null);
  const saleId = Number(saleRes.lastInsertRowid);

  for (const item of resolved) {
    db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(saleId, item.pid, item.name, item.qty, item.priceCents, item.subtotalCents);

    const stockAfter = item.stockBefore - item.qty;
    db.prepare(`UPDATE products SET stock = ?, updated_at = ? WHERE id = ?`).run(stockAfter, now, item.pid);
    db.prepare(`
      INSERT INTO stock_movements (product_id, type, quantity_delta, stock_before, stock_after, reason, reference_id, created_by, created_at)
      VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?)
    `).run(item.pid, -item.qty, item.stockBefore, stockAfter, `Venda #${saleId} (${employee.name})`, saleId, createdBy, now);
  }

  const createdRow = db
    .prepare(`
      SELECT s.*, e.name as employee_name, e.department as employee_department
      FROM sales s
      JOIN employees e ON e.id = s.employee_id
      WHERE s.id = ?
    `)
    .get(saleId) as Record<string, unknown>;
  return attachSaleItems([createdRow])[0];
}

app.post('/api/sales', (req, res) => {
  try {
    const { employee_id, items, notes = '', created_by = 'Administrador' } = req.body;
    const sale = runInTransaction(() =>
      createSaleInternal({
        employeeId: Number(employee_id),
        items,
        notes: String(notes),
        createdBy: String(created_by),
        paymentStatus: req.body.payment_status === 'paid' ? 'paid' : req.body.payment_status === 'pending' ? 'pending' : 'untracked',
      })
    );
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

function reverseSaleStock(saleId: number, statusToSet: 'cancelled' | 'corrected', reason: string, actor: string) {
  const sale = db.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as Record<string, unknown> | undefined;
  if (!sale) {
    throw new Error('Venda não encontrada.');
  }
  if (sale.status !== 'active') {
    throw new Error('Esta venda já foi cancelada ou corrigida anteriormente.');
  }
  const now = getNowIso();
  const items = db.prepare(`SELECT * FROM sale_items WHERE sale_id = ?`).all(saleId) as Array<{
    product_id: number;
    product_name: string;
    quantity: number;
  }>;

  for (const item of items) {
    const prod = db.prepare(`SELECT stock FROM products WHERE id = ?`).get(item.product_id) as { stock: number } | undefined;
    if (prod) {
      const before = Number(prod.stock);
      const after = before + Number(item.quantity);
      db.prepare(`UPDATE products SET stock = ?, updated_at = ? WHERE id = ?`).run(after, now, item.product_id);
      db.prepare(`
        INSERT INTO stock_movements (product_id, type, quantity_delta, stock_before, stock_after, reason, reference_id, created_by, created_at)
        VALUES (?, 'sale_reversal', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.product_id,
        Number(item.quantity),
        before,
        after,
        `${statusToSet === 'cancelled' ? 'Estorno por cancelamento' : 'Estorno por correção'} da Venda #${saleId}: ${reason}`,
        saleId,
        actor,
        now
      );
    }
  }

  db.prepare(`
    UPDATE sales
    SET status = ?, cancelled_at = ?, cancel_reason = ?
    WHERE id = ?
  `).run(statusToSet, now, reason, saleId);
}

app.post('/api/sales/:id/cancel', (req, res) => {
  try {
    const saleId = Number(req.params.id);
    const { reason = 'Cancelado pelo administrador', actor = 'Administrador' } = req.body;
    const updated = runInTransaction(() => {
      reverseSaleStock(saleId, 'cancelled', String(reason).trim() || 'Cancelamento administrativo', String(actor));
      const row = db
        .prepare(`
          SELECT s.*, e.name as employee_name, e.department as employee_department
          FROM sales s
          JOIN employees e ON e.id = s.employee_id
          WHERE s.id = ?
        `)
        .get(saleId) as Record<string, unknown>;
      return attachSaleItems([row])[0];
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.post('/api/sales/:id/correct', (req, res) => {
  try {
    const oldSaleId = Number(req.params.id);
    const { employee_id, items, notes = '', reason = 'Correção de lançamento', actor = 'Administrador' } = req.body;
    const result = runInTransaction(() => {
      const oldSale = db.prepare(`SELECT employee_id FROM sales WHERE id = ?`).get(oldSaleId) as { employee_id: number } | undefined;
      if (!oldSale) throw new Error('Venda original não encontrada.');
      reverseSaleStock(oldSaleId, 'corrected', String(reason).trim() || 'Correção de venda', String(actor));
      return createSaleInternal({
        employeeId: employee_id ? Number(employee_id) : oldSale.employee_id,
        items,
        notes: String(notes),
        createdBy: String(actor),
        correctedFromSaleId: oldSaleId,
      });
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Payments
app.get('/api/payments', (_req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT p.*, e.name as employee_name
        FROM payments p
        JOIN employees e ON e.id = p.employee_id
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 200
      `)
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/payments', (req, res) => {
  try {
    const { employee_id, amount_cents, method = 'Pix', received_by = 'Administrador', notes = '' } = req.body;
    const empId = Number(employee_id);
    const amountInt = Math.round(Number(amount_cents));
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Valor do pagamento deve ser maior que zero.' });
    }

    const payment = runInTransaction(() => {
      const emp = db.prepare(`SELECT id, name FROM employees WHERE id = ?`).get(empId) as { id: number; name: string } | undefined;
      if (!emp) throw new Error('Cliente não encontrado.');

      const currentDebt = getEmployeeBalanceCents(empId);
      const balanceAfter = currentDebt - amountInt;
      const now = getNowIso();

      const info = db
        .prepare(`
          INSERT INTO payments (employee_id, amount_cents, method, received_by, notes, balance_after_cents, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .run(empId, amountInt, String(method).trim() || 'Pix', String(received_by).trim(), String(notes).trim(), balanceAfter, now);

      return db
        .prepare(`
          SELECT p.*, e.name as employee_name
          FROM payments p
          JOIN employees e ON e.id = p.employee_id
          WHERE p.id = ?
        `)
        .get(Number(info.lastInsertRowid));
    });

    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Reports & Closures
app.get('/api/reports', (req, res) => {
  try {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = now.toISOString().slice(0, 10);

    const startDate = String(req.query.startDate || defaultStart);
    const endDate = String(req.query.endDate || defaultEnd);

    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    const salesRaw = db
      .prepare(`
        SELECT s.*, e.name as employee_name, e.department as employee_department
        FROM sales s
        JOIN employees e ON e.id = s.employee_id
        WHERE s.created_at >= ? AND s.created_at <= ?
        ORDER BY s.created_at DESC, s.id DESC
      `)
      .all(startIso, endIso) as Array<Record<string, unknown>>;
    const sales = attachSaleItems(salesRaw);

    const payments = db
      .prepare(`
        SELECT p.*, e.name as employee_name
        FROM payments p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.created_at >= ? AND p.created_at <= ?
        ORDER BY p.created_at DESC, p.id DESC
      `)
      .all(startIso, endIso) as Array<Record<string, unknown>>;

    const stockMovements = db
      .prepare(`
        SELECT sm.*, p.name as product_name, p.category as product_category
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        WHERE sm.created_at >= ? AND sm.created_at <= ?
        ORDER BY sm.created_at DESC, sm.id DESC
      `)
      .all(startIso, endIso);

    const topProducts = db
      .prepare(`
        SELECT
          si.product_id,
          si.product_name,
          COALESCE(p.category, 'Outros') as category,
          SUM(si.quantity) as units_sold,
          SUM(si.subtotal_cents) as revenue_cents
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE s.status = 'active' AND s.created_at >= ? AND s.created_at <= ?
        GROUP BY si.product_id, si.product_name
        ORDER BY units_sold DESC, revenue_cents DESC
      `)
      .all(startIso, endIso);

    const allEmployees = db.prepare(`SELECT id, name, department FROM employees ORDER BY name ASC`).all() as Array<{
      id: number;
      name: string;
      department: string;
    }>;

    let overallPendingCents = 0;
    const employeeConsumption = allEmployees.map((emp) => {
      const periodConsumed = db
        .prepare(`SELECT COALESCE(SUM(total_cents), 0) as total, COUNT(*) as cnt FROM sales WHERE employee_id = ? AND status = 'active' AND created_at >= ? AND created_at <= ?`)
        .get(emp.id, startIso, endIso) as { total: number; cnt: number };
      const periodPaid = db
        .prepare(`SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE employee_id = ? AND created_at >= ? AND created_at <= ?`)
        .get(emp.id, startIso, endIso) as { total: number };
      const currentBalance = getEmployeeBalanceCents(emp.id);
      if (currentBalance > 0) overallPendingCents += currentBalance;

      return {
        employee_id: emp.id,
        employee_name: emp.name,
        department: emp.department,
        period_consumed_cents: Number(periodConsumed.total),
        period_paid_cents: Number(periodPaid.total),
        current_balance_cents: currentBalance,
        purchases_count: Number(periodConsumed.cnt),
      };
    });

    const activeSales = sales.filter((s) => s.status === 'active');
    const cancelledSales = sales.filter((s) => s.status !== 'active');
    const totalSalesCents = activeSales.reduce((acc, s) => acc + Number(s.total_cents), 0);
    const totalReceivedCents = payments.reduce((acc, p) => acc + Number(p.amount_cents), 0);

    const closures = db.prepare(`SELECT * FROM period_closures ORDER BY created_at DESC, id DESC LIMIT 20`).all();

    res.json({
      start_date: startDate,
      end_date: endDate,
      total_sales_cents: totalSalesCents,
      active_sales_count: activeSales.length,
      cancelled_sales_count: cancelledSales.length,
      total_received_cents: totalReceivedCents,
      payments_count: payments.length,
      overall_pending_cents: overallPendingCents,
      employee_consumption: employeeConsumption,
      top_products: topProducts,
      sales,
      payments,
      stock_movements: stockMovements,
      closures,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/closures', (req, res) => {
  try {
    const { period_label, start_date, end_date, notes = '', closed_by = 'Administrador' } = req.body;
    if (!period_label || !start_date || !end_date) {
      return res.status(400).json({ error: 'Informe rótulo e intervalo de datas do fechamento.' });
    }
    const startIso = `${start_date}T00:00:00.000Z`;
    const endIso = `${end_date}T23:59:59.999Z`;

    const salesSum = db
      .prepare(`SELECT COALESCE(SUM(total_cents), 0) as total FROM sales WHERE status = 'active' AND created_at >= ? AND created_at <= ?`)
      .get(startIso, endIso) as { total: number };
    const paySum = db
      .prepare(`SELECT COALESCE(SUM(amount_cents), 0) as total FROM payments WHERE created_at >= ? AND created_at <= ?`)
      .get(startIso, endIso) as { total: number };

    const employees = db.prepare(`SELECT id FROM employees`).all() as Array<{ id: number }>;
    let pending = 0;
    for (const e of employees) {
      const bal = getEmployeeBalanceCents(e.id);
      if (bal > 0) pending += bal;
    }

    const now = getNowIso();
    const info = db
      .prepare(`
        INSERT INTO period_closures (period_label, start_date, end_date, total_sales_cents, total_received_cents, total_pending_cents, notes, closed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        String(period_label).trim(),
        String(start_date),
        String(end_date),
        Number(salesSum.total),
        Number(paySum.total),
        pending,
        String(notes).trim(),
        String(closed_by).trim(),
        now
      );

    const created = db.prepare(`SELECT * FROM period_closures WHERE id = ?`).get(Number(info.lastInsertRowid));
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Marlene Interprise rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();

/**
 * Reservas e pedidos: rotas da dona (autenticadas) e rotas públicas (cliente identificado por nome + 4 últimos
 * dígitos do WhatsApp). Pedido nunca mexe em estoque nem saldo: isso só acontece na entrega (`deliver`),
 * que reaproveita `createSale` para manter uma única regra de venda.
 */
type Row = Record<string, unknown>;

export interface Deps {
  json(value: unknown, status?: number): Response;
  err(message: string, status?: number): Response;
  first<T = Row>(db: D1Database, sql: string, ...values: unknown[]): Promise<T | null>;
  all<T = Row>(db: D1Database, sql: string, ...values: unknown[]): Promise<T[]>;
  run(db: D1Database, sql: string, ...values: unknown[]): Promise<D1Result>;
  body(req: Request): Promise<Record<string, any>>;
  newId(db: D1Database, table: string): Promise<number>;
  now(): string;
  balance(db: D1Database, employeeId: number): Promise<number>;
  createSale(db: D1Database, input: Record<string, unknown>): Promise<unknown>;
}

export interface AdminContext {
  req: Request; url: URL; path: string; method: string; db: D1Database; deps: Deps;
}

export interface PublicContext extends AdminContext {
  rootDb: D1Database;
  store: { id: number; slug: string; store_name: string; store_type: string };
  env: { SESSION_SECRET: string; TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string };
  cookieName: string;
  cookiePath: string;
}

const LIVE_STATUSES = "('pending_review','approved','delivered')";
const RESERVED_SQL = `SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.offer_id=ro.id AND o.status IN ${LIVE_STATUSES}`;
const MAX_OPEN_ORDERS_PER_CUSTOMER = 5;
const MAX_ITEMS_PER_ORDER = 30;
const CUSTOMER_SESSION_MS = 2 * 60 * 60 * 1000;

async function ordersWithItems(deps: Deps, db: D1Database, rows: Row[]) {
  if (!rows.length) return [];
  const ids = rows.map((row) => Number(row.id));
  const items = await deps.all<Row>(db, `SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
  const byOrder = new Map<number, Row[]>();
  for (const item of items) byOrder.set(Number(item.order_id), [...(byOrder.get(Number(item.order_id)) ?? []), item]);
  return rows.map((row) => ({ ...row, items: byOrder.get(Number(row.id)) ?? [] }));
}

const isoDate = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const isoDateTime = (value: unknown) => (typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

// ---------------------------------------------------------------- rotas da dona

export async function handleReservationsAdmin(ctx: AdminContext): Promise<Response | null> {
  const { req, url, path, method, db, deps } = ctx;
  const { json, err, first, all, run } = deps;

  if (path === '/api/offers' && method === 'GET') {
    return json(await all(db, `SELECT ro.*,p.name product_name,p.price_cents,(${RESERVED_SQL}) reserved_qty FROM reservation_offers ro JOIN products p ON p.id=ro.product_id ORDER BY ro.status DESC,ro.service_date IS NULL,ro.service_date,ro.id DESC`));
  }
  if (path === '/api/offers' && method === 'POST') {
    const data = await deps.body(req);
    const product = await first<Row>(db, 'SELECT id,name FROM products WHERE id=?', Number(data.product_id));
    if (!product) return err('Escolha um produto válido para a reserva.');
    const limit = data.limit_qty === null || data.limit_qty === '' || data.limit_qty === undefined ? null : Math.round(Number(data.limit_qty));
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0 || limit > 10000)) return err('O limite de porções deve ser maior que zero.');
    const id = await deps.newId(db, 'reservation_offers');
    await run(db, 'INSERT INTO reservation_offers(id,product_id,service_date,limit_qty,closes_at,status,created_at) VALUES(?,?,?,?,?,?,?)', id, product.id, isoDate(data.service_date), limit, isoDateTime(data.closes_at), 'open', deps.now());
    return json(await first(db, `SELECT ro.*,p.name product_name,p.price_cents,(${RESERVED_SQL}) reserved_qty FROM reservation_offers ro JOIN products p ON p.id=ro.product_id WHERE ro.id=?`, id), 201);
  }
  const offerMatch = path.match(/^\/api\/offers\/(\d+)$/);
  if (offerMatch && method === 'PUT') {
    const id = Number(offerMatch[1]);
    const old = await first<Row>(db, 'SELECT * FROM reservation_offers WHERE id=?', id);
    if (!old) return err('Reserva não encontrada.', 404);
    const data = await deps.body(req);
    const status = data.status === 'closed' ? 'closed' : data.status === 'open' ? 'open' : String(old.status);
    const limit = 'limit_qty' in data ? (data.limit_qty === null || data.limit_qty === '' ? null : Math.round(Number(data.limit_qty))) : (old.limit_qty as number | null);
    if (limit !== null && (!Number.isFinite(limit) || limit <= 0 || limit > 10000)) return err('O limite de porções deve ser maior que zero.');
    await run(db, 'UPDATE reservation_offers SET status=?,limit_qty=?,service_date=?,closes_at=? WHERE id=?', status, limit,
      'service_date' in data ? isoDate(data.service_date) : old.service_date, 'closes_at' in data ? isoDateTime(data.closes_at) : old.closes_at, id);
    return json(await first(db, `SELECT ro.*,p.name product_name,p.price_cents,(${RESERVED_SQL}) reserved_qty FROM reservation_offers ro JOIN products p ON p.id=ro.product_id WHERE ro.id=?`, id));
  }
  if (offerMatch && method === 'DELETE') {
    const id = Number(offerMatch[1]);
    if (await first(db, 'SELECT id FROM order_items WHERE offer_id=? LIMIT 1', id)) return err('Esta reserva já tem pedidos. Encerre-a em vez de excluir.', 409);
    await run(db, 'DELETE FROM reservation_offers WHERE id=?', id);
    return json({ deleted: true });
  }

  if (path === '/api/orders' && method === 'GET') {
    const status = url.searchParams.get('status');
    const rows = await all<Row>(db, `SELECT o.*,e.name employee_name,e.phone employee_phone FROM orders o JOIN employees e ON e.id=o.employee_id ${status ? 'WHERE o.status=?' : ''} ORDER BY CASE o.status WHEN 'pending_review' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,o.created_at DESC LIMIT 200`, ...(status ? [status] : []));
    return json(await ordersWithItems(deps, db, rows));
  }
  if (path === '/api/production-sheet' && method === 'GET') {
    const date = isoDate(url.searchParams.get('date'));
    return json(await all(db, `SELECT oi.product_id,oi.product_name,ro.service_date,SUM(oi.quantity) quantity,SUM(CASE WHEN o.status='pending_review' THEN oi.quantity ELSE 0 END) pending_quantity,COUNT(DISTINCT o.id) orders_count FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN reservation_offers ro ON ro.id=oi.offer_id WHERE o.status IN ('pending_review','approved') ${date ? 'AND ro.service_date=?' : ''} GROUP BY oi.product_id,oi.product_name,ro.service_date ORDER BY ro.service_date IS NULL,ro.service_date,oi.product_name`, ...(date ? [date] : [])));
  }

  const orderMatch = path.match(/^\/api\/orders\/(\d+)\/(approve|reject|deliver|confirm-payment)$/);
  if (orderMatch && method === 'POST') {
    const id = Number(orderMatch[1]), action = orderMatch[2];
    const order = await first<Row>(db, 'SELECT * FROM orders WHERE id=?', id);
    if (!order) return err('Pedido não encontrado.', 404);
    const stamp = deps.now();
    const reload = async () => (await ordersWithItems(deps, db, await all<Row>(db, 'SELECT o.*,e.name employee_name,e.phone employee_phone FROM orders o JOIN employees e ON e.id=o.employee_id WHERE o.id=?', id)))[0];
    if (action === 'approve') {
      if (order.status !== 'pending_review') return err('Só é possível aprovar pedidos em análise.', 409);
      await run(db, "UPDATE orders SET status='approved',updated_at=? WHERE id=?", stamp, id);
      return json(await reload());
    }
    if (action === 'reject') {
      if (order.status !== 'pending_review' && order.status !== 'approved') return err('Este pedido não pode mais ser recusado.', 409);
      await run(db, "UPDATE orders SET status='rejected',updated_at=? WHERE id=?", stamp, id);
      return json(await reload());
    }
    if (action === 'confirm-payment') {
      if (order.status !== 'pending_review' && order.status !== 'approved') return err('Este pedido não aceita confirmação de pagamento.', 409);
      await run(db, "UPDATE orders SET payment_state='confirmed',updated_at=? WHERE id=?", stamp, id);
      return json(await reload());
    }
    // deliver: vira venda de verdade (baixa estoque, lança no fiado) e, se o Pix foi confirmado, registra o pagamento.
    if (order.status !== 'approved') return err('Aprove o pedido antes de entregar.', 409);
    const data = await deps.body(req);
    const items = await all<Row>(db, 'SELECT product_id,quantity FROM order_items WHERE order_id=?', id);
    const prices = new Map((await all<Row>(db, 'SELECT id,price_cents FROM products')).map((row) => [Number(row.id), Number(row.price_cents)]));
    const saleTotal = items.reduce((sum, item) => sum + (prices.get(Number(item.product_id)) ?? 0) * Number(item.quantity), 0);
    const payNow = data.confirm_payment === true || order.payment_state === 'confirmed';
    const saleId = await deps.newId(db, 'sales');
    const preStatements: D1PreparedStatement[] = [db.prepare("UPDATE orders SET status='delivered',sale_id=?,payment_state=?,updated_at=? WHERE id=? AND status='approved'").bind(saleId, payNow ? 'confirmed' : order.payment_state, stamp, id)];
    if (payNow && saleTotal > 0) {
      const paymentId = await deps.newId(db, 'payments');
      const balanceAfter = await deps.balance(db, Number(order.employee_id));
      preStatements.push(db.prepare('INSERT INTO payments(id,employee_id,amount_cents,method,received_by,notes,balance_after_cents,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(paymentId, order.employee_id, saleTotal, 'Pix', 'Pedido online', `Pedido #${id}`, balanceAfter, stamp));
    }
    await deps.createSale(db, { employee_id: Number(order.employee_id), items, notes: `Pedido online #${id}${order.notes ? `: ${order.notes}` : ''}`, created_by: 'Pedido online', saleId, preStatements });
    return json(await reload());
  }
  return null;
}

// ---------------------------------------------------------------- página pública

const normalizeName = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const digitsOnly = (value: string) => value.replace(/\D/g, '');

function base64Url(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function sign(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
// O prefixo "cust|" separa este token do cookie da dona: um não vale como o outro.
async function issueCustomerToken(secret: string, storeId: number, customerId: number) {
  const payload = `${Date.now() + CUSTOMER_SESSION_MS}.${storeId}.${customerId}`;
  return `${payload}.${await sign(secret, `cust|${payload}`)}`;
}
async function readCustomerId(ctx: PublicContext): Promise<number | null> {
  const raw = ctx.req.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ctx.cookieName}=`))?.slice(ctx.cookieName.length + 1);
  if (!raw || !ctx.env.SESSION_SECRET) return null;
  const [expires, storeId, customerId, signature] = raw.split('.');
  if (!expires || !storeId || !customerId || !signature || Number(expires) < Date.now() || Number(storeId) !== ctx.store.id) return null;
  return sameText(await sign(ctx.env.SESSION_SECRET, `cust|${expires}.${storeId}.${customerId}`), signature) ? Number(customerId) : null;
}

/** Conta uma tentativa e informa se o limite da janela foi ultrapassado. Falha fechado: sem contador, bloqueia. */
async function overLimit(ctx: PublicContext, bucket: string, windowMs: number, max: number) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  try {
    await ctx.deps.run(ctx.rootDb, 'INSERT INTO public_rate_limits(store_id,bucket,window_start,hits) VALUES(?,?,?,1) ON CONFLICT(store_id,bucket,window_start) DO UPDATE SET hits=hits+1', ctx.store.id, bucket, windowStart);
    const row = await ctx.deps.first<{ hits: number }>(ctx.rootDb, 'SELECT hits FROM public_rate_limits WHERE store_id=? AND bucket=? AND window_start=?', ctx.store.id, bucket, windowStart);
    if (Math.random() < 0.02) await ctx.deps.run(ctx.rootDb, 'DELETE FROM public_rate_limits WHERE window_start<?', Date.now() - 24 * 60 * 60 * 1000);
    return Number(row?.hits ?? 0) > max;
  } catch { return true; }
}

async function turnstileOk(ctx: PublicContext, token: unknown, ip: string) {
  if (!ctx.env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  try {
    const form = new FormData();
    form.set('secret', ctx.env.TURNSTILE_SECRET); form.set('response', token); if (ip) form.set('remoteip', ip);
    const result = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })).json<{ success?: boolean }>();
    return result.success === true;
  } catch { return false; }
}

export async function handleReservationsPublic(ctx: PublicContext): Promise<Response> {
  const { req, path, method, db, deps, store } = ctx;
  const { json, err, first, all, run } = deps;
  if (store.store_type === 'lite') return err('Página de pedidos indisponível para esta loja.', 404);
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';

  if (path === '/api/public/config' && method === 'GET') return json({ store_name: store.store_name, turnstile_site_key: ctx.env.TURNSTILE_SITE_KEY ?? null });

  if (path === '/api/public/identify' && method === 'POST') {
    if (await overLimit(ctx, `identify:ip:${ip}`, 10 * 60 * 1000, 8) || await overLimit(ctx, 'identify:all', 10 * 60 * 1000, 120)) return err('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 429);
    const data = await deps.body(req);
    if (!await turnstileOk(ctx, data.turnstile_token, ip)) return err('Não foi possível validar a verificação de segurança. Atualize a página e tente de novo.', 403);
    const name = normalizeName(String(data.name ?? '')), last4 = digitsOnly(String(data.phone_last4 ?? ''));
    const notFound = () => err('Não encontramos esse cadastro. Confira o nome e os 4 últimos dígitos do WhatsApp.', 401);
    if (!name || last4.length !== 4) return notFound();
    const customers = await all<{ id: number; name: string; phone: string }>(db, 'SELECT id,name,phone FROM employees WHERE active=1');
    const match = customers.find((c) => normalizeName(c.name) === name && digitsOnly(c.phone).length >= 4 && digitsOnly(c.phone).endsWith(last4));
    if (!match) return notFound();
    const token = await issueCustomerToken(ctx.env.SESSION_SECRET, store.id, match.id);
    return new Response(JSON.stringify({ identified: true, first_name: match.name.split(' ')[0] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Set-Cookie': `${ctx.cookieName}=${token}; Path=${ctx.cookiePath}; HttpOnly; Secure; SameSite=Strict; Max-Age=${CUSTOMER_SESSION_MS / 1000}` } });
  }
  if (path === '/api/public/logout' && method === 'POST') {
    return new Response(JSON.stringify({ identified: false }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${ctx.cookieName}=; Path=${ctx.cookiePath}; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
  }

  const customerId = await readCustomerId(ctx);
  if (!customerId) return err('Identifique-se para continuar.', 401);
  const customer = await first<Row>(db, 'SELECT id,name FROM employees WHERE id=? AND active=1', customerId);
  if (!customer) return err('Identifique-se para continuar.', 401);

  if (path === '/api/public/catalog' && method === 'GET') {
    const products = await all<Row>(db, 'SELECT id,name,description,category,image_url,price_cents,(stock<=0) sold_out FROM products WHERE available=1 ORDER BY category,name');
    const offers = await all<Row>(db, `SELECT ro.id,ro.product_id,ro.service_date,ro.closes_at,ro.limit_qty,(${RESERVED_SQL}) reserved_qty FROM reservation_offers ro JOIN products p ON p.id=ro.product_id WHERE ro.status='open' AND p.available=1 AND (ro.closes_at IS NULL OR ro.closes_at>?) ORDER BY ro.service_date IS NULL,ro.service_date,ro.id`, deps.now());
    return json({
      customer: { first_name: String(customer.name).split(' ')[0] },
      products: products.map((p) => ({ ...p, sold_out: Boolean(p.sold_out) })),
      offers: offers.map((o) => ({ id: o.id, product_id: o.product_id, service_date: o.service_date, closes_at: o.closes_at, remaining: o.limit_qty === null ? null : Math.max(0, Number(o.limit_qty) - Number(o.reserved_qty)) })),
    });
  }

  if (path === '/api/public/my-orders' && method === 'GET') {
    return json(await ordersWithItems(deps, db, await all<Row>(db, 'SELECT id,status,payment_choice,payment_state,total_cents,notes,created_at FROM orders WHERE employee_id=? ORDER BY created_at DESC LIMIT 20', customerId)));
  }

  if (path === '/api/public/orders' && method === 'POST') {
    if (await overLimit(ctx, `order:${customerId}`, 60 * 60 * 1000, 10)) return err('Muitos pedidos em pouco tempo. Tente de novo mais tarde.', 429);
    const open = await first<{ n: number }>(db, "SELECT COUNT(*) n FROM orders WHERE employee_id=? AND status IN ('pending_review','approved')", customerId);
    if (Number(open?.n ?? 0) >= MAX_OPEN_ORDERS_PER_CUSTOMER) return err('Você já tem pedidos em aberto. Aguarde a confirmação para fazer outro.', 409);
    const data = await deps.body(req);
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > MAX_ITEMS_PER_ORDER) return err('Adicione pelo menos um produto ao pedido.');
    const lines = new Map<string, { productId: number; offerId: number | null; quantity: number }>();
    for (const raw of data.items) {
      const productId = Number(raw?.product_id), quantity = Math.round(Number(raw?.quantity)), offerId = raw?.offer_id ? Number(raw.offer_id) : null;
      if (!Number.isInteger(productId) || !Number.isFinite(quantity) || quantity < 1 || quantity > 99) return err('Quantidade inválida.');
      const key = `${productId}:${offerId ?? 0}`, line = lines.get(key);
      lines.set(key, { productId, offerId, quantity: (line?.quantity ?? 0) + quantity });
    }
    const stamp = deps.now(), orderLines: Array<{ productId: number; offerId: number | null; name: string; price: number; quantity: number }> = [];
    for (const line of lines.values()) {
      const product = await first<Row>(db, 'SELECT id,name,price_cents,stock,available FROM products WHERE id=?', line.productId);
      if (!product || !product.available) return err('Um dos produtos não está mais disponível.', 409);
      if (line.offerId) {
        const offer = await first<Row>(db, `SELECT ro.*,(${RESERVED_SQL}) reserved_qty FROM reservation_offers ro WHERE ro.id=?`, line.offerId);
        if (!offer || offer.status !== 'open' || Number(offer.product_id) !== line.productId || (offer.closes_at && String(offer.closes_at) <= stamp)) return err(`A reserva de "${product.name}" não está mais aberta.`, 409);
        if (offer.limit_qty !== null && Number(offer.reserved_qty) + line.quantity > Number(offer.limit_qty)) { const left = Math.max(0, Number(offer.limit_qty) - Number(offer.reserved_qty)); return err(`${left === 1 ? 'Resta apenas 1 porção' : `Restam apenas ${left} porções`} de "${product.name}".`, 409); }
      } else if (Number(product.stock) < line.quantity) {
        return err(`Estoque insuficiente de "${product.name}" (disponível: ${Math.max(0, Number(product.stock))}).`, 409);
      }
      orderLines.push({ productId: line.productId, offerId: line.offerId, name: String(product.name), price: Number(product.price_cents), quantity: line.quantity });
    }
    const orderId = await deps.newId(db, 'orders'), total = orderLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const choice = data.payment_choice === 'pix_now' ? 'pix_now' : 'later';
    await db.batch([
      db.prepare('INSERT INTO orders(id,employee_id,status,payment_choice,payment_state,total_cents,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(orderId, customerId, 'pending_review', choice, 'none', total, String(data.notes ?? '').trim().slice(0, 300), stamp, stamp),
      ...orderLines.map((line) => db.prepare('INSERT INTO order_items(order_id,product_id,offer_id,product_name,quantity,unit_price_cents) VALUES(?,?,?,?,?,?)').bind(orderId, line.productId, line.offerId, line.name, line.quantity, line.price)),
    ]);
    return json((await ordersWithItems(deps, db, await all<Row>(db, 'SELECT id,status,payment_choice,payment_state,total_cents,notes,created_at FROM orders WHERE id=?', orderId)))[0], 201);
  }

  const orderMatch = path.match(/^\/api\/public\/orders\/(\d+)\/(cancel|receipt-sent)$/);
  if (orderMatch && method === 'POST') {
    const id = Number(orderMatch[1]);
    const order = await first<Row>(db, 'SELECT id,status FROM orders WHERE id=? AND employee_id=?', id, customerId);
    if (!order) return err('Pedido não encontrado.', 404);
    if (orderMatch[2] === 'cancel') {
      if (order.status !== 'pending_review') return err('Só é possível cancelar pedidos ainda em análise. Fale com a loja.', 409);
      await run(db, "UPDATE orders SET status='cancelled',updated_at=? WHERE id=?", deps.now(), id);
    } else {
      if (order.status !== 'pending_review' && order.status !== 'approved') return err('Este pedido não aceita comprovante.', 409);
      await run(db, "UPDATE orders SET payment_state=CASE WHEN payment_state='confirmed' THEN 'confirmed' ELSE 'claimed' END,updated_at=? WHERE id=?", deps.now(), id);
    }
    return json({ ok: true });
  }

  if (path === '/api/public/pix-info' && method === 'GET') {
    if (!await first(db, "SELECT id FROM orders WHERE employee_id=? AND status IN ('pending_review','approved') LIMIT 1", customerId)) return err('Faça um pedido para ver os dados de pagamento.', 404);
    const settings = await first<Row>(db, 'SELECT store_name,pix_key,pix_key_type,pix_beneficiary_name,pix_city,whatsapp_phone FROM store_settings WHERE id=1');
    return json(settings ?? {});
  }
  return err('Rota não encontrada.', 404);
}

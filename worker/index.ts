type Env = Cloudflare.Env;
type Row = Record<string, unknown>;
type SaleRow = Row & { items: Row[] };

declare global {
  namespace Cloudflare { interface Env { LOGIN_USERNAME?: string; LOGIN_PASSWORD: string; SESSION_SECRET: string; PLATFORM_ADMIN_PASSWORD?: string; CANONICAL_STORE_URL?: string } }
}

const now = () => new Date().toISOString();
const json = (value: unknown, status = 200) => Response.json(value, { status });
const err = (message: string, status = 400) => json({ error: message }, status);
const STORE_TABLES = ['products','price_history','employees','sales','sale_items','payments','stock_movements','period_closures','store_settings','loyalty_settings','auth_credentials'];

function scopedDatabase(db: D1Database, storeId: number): D1Database {
  if (storeId === 1) return db;
  const names = STORE_TABLES.join('|');
  const rewrite = (sql: string) => sql.replace(new RegExp(`\\b(FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+(${names})\\b`, 'gi'), (_match, operation: string, table: string) => `${operation} ${table}__${storeId}`);
  return {
    prepare: (sql: string) => db.prepare(rewrite(sql)),
    batch: (statements: D1PreparedStatement[]) => db.batch(statements),
  } as D1Database;
}

function sessionCookieName(storeSlug: string) {
  return storeSlug === 'marlene' ? 'marlene_session' : `store_${storeSlug.replaceAll('-', '_')}_session`;
}
function sessionCookiePath(storeSlug: string) {
  return storeSlug === 'marlene' ? '/' : `/s/${storeSlug}`;
}

async function all<T = Row>(db: D1Database, sql: string, ...values: unknown[]) {
  return (await db.prepare(sql).bind(...values).all<T>()).results;
}
async function first<T = Row>(db: D1Database, sql: string, ...values: unknown[]) {
  return db.prepare(sql).bind(...values).first<T>();
}
async function run(db: D1Database, sql: string, ...values: unknown[]) {
  return db.prepare(sql).bind(...values).run();
}
async function batch(db: D1Database, statements: D1PreparedStatement[]) {
  return db.batch(statements);
}
async function body(req: Request) {
  try { return await req.json<Record<string, any>>(); } catch { return {}; }
}
async function saleRows(db: D1Database, rows: Row[]): Promise<SaleRow[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  const items = await all<Row>(db, `SELECT * FROM sale_items WHERE sale_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
  const grouped = new Map<number, Row[]>();
  for (const item of items) grouped.set(Number(item.sale_id), [...(grouped.get(Number(item.sale_id)) ?? []), item]);
  return rows.map((r) => ({ ...r, items: grouped.get(Number(r.id)) ?? [] }));
}
async function balance(db: D1Database, id: number) {
  const row = await first<{ consumed: number; paid: number }>(db, `SELECT
    (SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE employee_id=? AND status='active') consumed,
    (SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE employee_id=?) paid`, id, id);
  return Number(row?.consumed ?? 0) - Number(row?.paid ?? 0);
}
async function newId(db: D1Database, table: string) {
  const row = await first<{ id: number }>(db, `SELECT COALESCE(MAX(id),0) id FROM ${table}`);
  const timeId = Date.now() * 1000 + crypto.getRandomValues(new Uint16Array(1))[0]! % 1000;
  return Math.max(timeId, Number(row?.id ?? 0) + 1);
}
const saleSelect = `SELECT s.*, e.name employee_name, e.department employee_department FROM sales s JOIN employees e ON e.id=s.employee_id`;

function base64Url(bytes: Uint8Array) {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
function fromBase64Url(value: string) {
  const base=value.replaceAll('-','+').replaceAll('_','/');
  const binary=atob(base+'='.repeat((4-base.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function signSession(expiration: string, secret: string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(expiration)));
  return `${expiration}.${base64Url(signature)}`;
}
async function isAuthenticated(req: Request, env: Env, storeSlug: string) {
  const cookieName = sessionCookieName(storeSlug);
  const cookie=req.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if(!cookie||!env.SESSION_SECRET)return false;
  const [expiration,version,signature]=cookie.split('.');
  if(!expiration||!version||!signature||Number(expiration)<Date.now())return false;
  const credential=await first<{version:string}>(env.DB,'SELECT version FROM auth_credentials WHERE id=1');
  if(!credential||credential.version!==version)return false;
  const signed=await signSession(`${expiration}.${version}`,env.SESSION_SECRET);
  const expectedBytes=fromBase64Url(signed.split('.')[1]!),actualBytes=fromBase64Url(signature);
  if(expectedBytes.length!==actualBytes.length)return false;
  let difference=0;for(let i=0;i<expectedBytes.length;i++)difference|=expectedBytes[i]!^actualBytes[i]!;
  return difference===0;
}
async function hashPassword(password: string, salt: string, secret: string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${salt}:${password}`));
  return base64Url(new Uint8Array(bytes));
}
async function saveCredential(db: D1Database, password: string, secret: string, table = 'auth_credentials') {
  const salt=base64Url(crypto.getRandomValues(new Uint8Array(24))),version=crypto.randomUUID(),updated=now();
  const passwordHash=await hashPassword(password,salt,secret);
  await run(db,`INSERT INTO ${table}(id,password_salt,password_hash,version,updated_at) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET password_salt=excluded.password_salt,password_hash=excluded.password_hash,version=excluded.version,updated_at=excluded.updated_at`,salt,passwordHash,version,updated);
  return version;
}
async function verifyPassword(password: string, env: Env, table = 'auth_credentials', fallbackPassword = env.LOGIN_PASSWORD) {
  const credential=await first<{password_salt:string;password_hash:string}>(env.DB,`SELECT password_salt,password_hash FROM ${table} WHERE id=1`);
  if(credential){
    const actual=await hashPassword(password,credential.password_salt,env.SESSION_SECRET);
    return actual.length===credential.password_hash.length && [...actual].reduce((n,c,i)=>n|(c.charCodeAt(0)^credential.password_hash.charCodeAt(i)),0)===0;
  }
  if(!fallbackPassword)return false;
  const encoder=new TextEncoder(),a=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(password))),b=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(fallbackPassword)));
  if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a[i]!^b[i]!;return difference===0;
}
async function sessionCookie(version: string, env: Env, storeSlug: string) {
  const expiration=String(Date.now()+8*60*60*1000),signed=await signSession(`${expiration}.${version}`,env.SESSION_SECRET);
  return `${sessionCookieName(storeSlug)}=${expiration}.${version}.${signed.split('.')[1]}; Path=${sessionCookiePath(storeSlug)}; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}
async function login(req: Request, env: Env, expectedUsername: string, storeSlug: string, credentialTable = 'auth_credentials', fallbackPassword = env.LOGIN_PASSWORD) {
  if(!env.SESSION_SECRET)return err('Autenticação ainda não foi configurada.',503);
  if(!await first(env.DB,`SELECT id FROM ${credentialTable} WHERE id=1`)&&!fallbackPassword)return err('Configure uma senha inicial para a loja.',503);
  const data=await body(req),username=String(data.username??'').trim().toLowerCase(),candidate=String(data.password??'');
  if(!expectedUsername || username!==expectedUsername)return err('Login ou senha incorretos.',401);
  if(!await verifyPassword(candidate,env,credentialTable,fallbackPassword))return err('Login ou senha incorretos.',401);
  const existing=await first<{version:string}>(env.DB,`SELECT version FROM ${credentialTable} WHERE id=1`);
  const version=existing?.version??await saveCredential(env.DB,candidate,env.SESSION_SECRET,credentialTable);
  return new Response(JSON.stringify({authenticated:true}),{headers:{'Content-Type':'application/json','Set-Cookie':await sessionCookie(version,env,storeSlug)}});
}
async function changePassword(req: Request, env: Env, storeSlug: string) {
  const data=await body(req),current=String(data.current_password??''),next=String(data.new_password??''),confirmation=String(data.confirm_password??'');
  if(!await verifyPassword(current,env))return err('Senha atual incorreta.',401);
  if(next.length<12)return err('A nova senha deve ter pelo menos 12 caracteres.');
  if(next!==confirmation)return err('A confirmação da nova senha não confere.');
  const version=await saveCredential(env.DB,next,env.SESSION_SECRET);
  return new Response(JSON.stringify({updated:true}),{headers:{'Content-Type':'application/json','Set-Cookie':await sessionCookie(version,env,storeSlug)}});
}

async function createSale(db: D1Database, input: { employee_id: number; items: Array<{ product_id: number; quantity: number }>; notes?: string; created_by?: string; corrected_from_sale_id?: number | null; stockCredits?: Map<number, number>; preStatements?: D1PreparedStatement[] }) {
  const employee = await first<{ id: number; name: string; active: number }>(db, 'SELECT id,name,active FROM employees WHERE id=?', input.employee_id);
  if (!employee) throw new Error('Cliente não encontrado.');
  if (!employee.active) throw new Error('Cliente está inativo.');
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('Adicione pelo menos um produto à venda.');
  const merged = new Map<number, number>();
  for (const item of input.items) {
    const pid = Number(item.product_id), qty = Math.round(Number(item.quantity));
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantidade de produto inválida.');
    merged.set(pid, (merged.get(pid) ?? 0) + qty);
  }
  const lines: Array<{ id: number; product: Row; qty: number; subtotal: number; before: number }> = [];
  for (const [pid, qty] of merged) {
    const product = await first<Row>(db, 'SELECT id,name,price_cents,stock,available FROM products WHERE id=?', pid);
    if (!product) throw new Error(`Produto #${pid} não encontrado.`);
    if (!product.available) throw new Error(`O produto "${product.name}" está indisponível para venda.`);
    const before = Number(product.stock) + (input.stockCredits?.get(pid) ?? 0);
    if (before < qty) throw new Error(`Estoque insuficiente para "${product.name}" (disponível: ${before}).`);
    lines.push({ id: pid, product, qty, subtotal: Number(product.price_cents) * qty, before });
  }
  const saleId = await newId(db, 'sales'), stamp = now(), actor = input.created_by || 'Administrador';
  const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const statements: D1PreparedStatement[] = [...(input.preStatements ?? []), db.prepare(`INSERT INTO sales(id,employee_id,total_cents,status,notes,corrected_from_sale_id,created_by,created_at)
    VALUES(?,?,?,'active',?,?,?,?)`).bind(saleId, input.employee_id, total, input.notes?.trim() ?? '', input.corrected_from_sale_id ?? null, actor, stamp)];
  for (const line of lines) {
    const after = line.before - line.qty;
    statements.push(db.prepare(`INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price_cents,subtotal_cents) VALUES(?,?,?,?,?,?)`)
      .bind(saleId, line.id, line.product.name, line.qty, line.product.price_cents, line.subtotal));
    statements.push(db.prepare(`UPDATE products SET stock=?,updated_at=? WHERE id=? AND stock>=?`).bind(after, stamp, line.id, line.qty));
    statements.push(db.prepare(`INSERT INTO stock_movements(product_id,type,quantity_delta,stock_before,stock_after,reason,reference_id,created_by,created_at)
      VALUES(?,'sale',?,?,?,?,?,?,?)`).bind(line.id, -line.qty, line.before, after, `Venda #${saleId} (${employee.name})`, saleId, actor, stamp));
  }
  await batch(db, statements);
  const row = await first<Row>(db, `${saleSelect} WHERE s.id=?`, saleId);
  return (await saleRows(db, row ? [row] : []))[0];
}

type ManagedStore = { id: number; slug: string; store_name: string; username: string; created_at: string };

async function createManagedStore(db: D1Database, env: Env, data: Record<string, any>) {
  const storeName = String(data.store_name ?? '').trim().slice(0, 80);
  const slug = String(data.slug ?? '').trim().toLowerCase();
  const username = String(data.username ?? '').trim().toLowerCase();
  const password = String(data.password ?? '');
  if (!storeName) throw new Error('Informe o nome da loja.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'marlene' || slug === 'admin') throw new Error('Escolha um caminho válido e ainda não utilizado para a loja.');
  if (!username) throw new Error('Informe o login do responsável.');
  if (password.length < 12) throw new Error('A senha inicial deve ter pelo menos 12 caracteres.');
  const stamp = now();
  const created = await db.prepare('INSERT INTO managed_stores(slug,store_name,username,created_at) VALUES(?,?,?,?)').bind(slug,storeName,username,stamp).run();
  const storeId = Number(created.meta.last_row_id) || Number((await first<{id:number}>(db,'SELECT id FROM managed_stores WHERE slug=?',slug))?.id);
  const tableNames = [...STORE_TABLES];
  try {
    for (const table of tableNames) {
      const schema = await first<{sql:string|null}>(db,"SELECT sql FROM sqlite_master WHERE type='table' AND name=?",table);
      if (!schema?.sql) throw new Error(`Não foi possível preparar a tabela ${table}.`);
      let sql = schema.sql.replace(new RegExp(`^(CREATE TABLE(?: IF NOT EXISTS)?\\s+)\\"?${table}\\"?`, 'i'), (_match, prefix: string) => `${prefix}${table}__${storeId}`);
      for (const ref of tableNames) sql = sql.replace(new RegExp(`(REFERENCES\\s+)\\"?${ref}\\"?\\b`, 'gi'), (_match, prefix: string) => `${prefix}${ref}__${storeId}`);
      await run(db,sql);
    }
    const scoped = scopedDatabase(db,storeId);
    await run(scoped,`INSERT INTO store_settings(id,store_name,logo_data_url,pix_key,pix_key_type,pix_beneficiary_name,pix_city,billing_message_template,brand_primary_color,brand_secondary_color,updated_at)
      VALUES(1,?,'','','auto',?,'SAO PAULO','', '#047857','#f59e0b',?)`,storeName,storeName.toUpperCase().slice(0,25),stamp);
    await run(scoped,"INSERT INTO loyalty_settings(id,updated_at) VALUES(1,?)",stamp);
    for (const product of (Array.isArray(data.products) ? data.products : [])) {
      const name = String(product.name ?? '').trim();
      if (!name) continue;
      const id = await newId(scoped,'products'), price = Math.max(0,Math.round(Number(product.price_cents ?? 0))), stock = Math.max(0,Math.round(Number(product.stock ?? 0)));
      await run(scoped,'INSERT INTO products(id,name,description,category,image_url,price_cents,stock,min_stock,available,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,name,String(product.description??''),String(product.category??'Lanches & Bebidas'),String(product.image_url??''),price,stock,Math.max(0,Math.round(Number(product.min_stock??5))),product.available?1:0,stamp,stamp);
    }
    await saveCredential(scoped,password,env.SESSION_SECRET);
    return { id:storeId,slug,store_name:storeName,username,created_at:stamp } satisfies ManagedStore;
  } catch (error) {
    await run(db,'DELETE FROM managed_stores WHERE id=?',storeId);
    throw error;
  }
}

async function isPlatformAuthenticated(req: Request, env: Env, db: D1Database) {
  const cookie=req.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('platform_session='))?.slice('platform_session='.length);
  if(!cookie||!env.SESSION_SECRET)return false;
  const [expiration,version,signature]=cookie.split('.');
  if(!expiration||!version||!signature||Number(expiration)<Date.now())return false;
  const credential=await first<{version:string}>(db,'SELECT version FROM platform_admin_credentials WHERE id=1');
  if(!credential||credential.version!==version)return false;
  const signed=await signSession(`${expiration}.${version}`,env.SESSION_SECRET);
  const expectedBytes=fromBase64Url(signed.split('.')[1]!),actualBytes=fromBase64Url(signature);
  if(expectedBytes.length!==actualBytes.length)return false;
  let difference=0;for(let i=0;i<expectedBytes.length;i++)difference|=expectedBytes[i]!^actualBytes[i]!;
  return difference===0;
}

async function handlePlatformApi(req: Request, env: Env): Promise<Response> {
  const db=env.DB,path=new URL(req.url).pathname,method=req.method;
  if(path==='/api/admin/auth/status'&&method==='GET')return json({authenticated:await isPlatformAuthenticated(req,env,db)});
  if(path==='/api/admin/auth/login'&&method==='POST'){
    if(!env.PLATFORM_ADMIN_PASSWORD)return err('A senha do administrador ainda não foi configurada.',503);
    const data=await body(req);
    if(String(data.username??'').trim().toLowerCase()!=='admin')return err('Login ou senha incorretos.',401);
    if(!await verifyPassword(String(data.password??''),{...env,DB:db} as Env,'platform_admin_credentials',env.PLATFORM_ADMIN_PASSWORD))return err('Login ou senha incorretos.',401);
    const existing=await first<{version:string}>(db,'SELECT version FROM platform_admin_credentials WHERE id=1');
    const version=existing?.version??await saveCredential(db,String(data.password),env.SESSION_SECRET,'platform_admin_credentials');
    const expiration=String(Date.now()+8*60*60*1000),signed=await signSession(`${expiration}.${version}`,env.SESSION_SECRET);
    return new Response(JSON.stringify({authenticated:true}),{headers:{'Content-Type':'application/json','Set-Cookie':`platform_session=${expiration}.${version}.${signed.split('.')[1]}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`}});
  }
  if(path==='/api/admin/auth/logout'&&method==='POST')return new Response(JSON.stringify({authenticated:false}),{headers:{'Content-Type':'application/json','Set-Cookie':'platform_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'}});
  if(!await isPlatformAuthenticated(req,env,db))return err('Faça login como administrador da plataforma.',401);
  if(path==='/api/admin/stores'&&method==='GET')return json(await all<ManagedStore>(db,'SELECT id,slug,store_name,username,created_at FROM managed_stores ORDER BY id'));
  if(path==='/api/admin/stores'&&method==='POST')return json(await createManagedStore(db,env,await body(req)),201);
  return err('Rota administrativa não encontrada.',404);
}

async function handleApi(req: Request, env: Env, store: ManagedStore, rootDb: D1Database): Promise<Response> {
  const storeEnv = { ...env, DB: scopedDatabase(rootDb,store.id) } as Env;
  const db = storeEnv.DB, url = new URL(req.url), path = url.pathname, method = req.method;
  const match = path.match(/^\/api\/(products|employees|sales)\/(\d+)(?:\/(stock|statement|cancel|correct))?$/);
  try {
    if (path === '/api/store-info' && method === 'GET') return json(store);
    if (path === '/api/auth/status' && method === 'GET') return json({ authenticated: await isAuthenticated(req, storeEnv, store.slug) });
    if (path === '/api/auth/login' && method === 'POST') return login(req, storeEnv,store.username,store.slug);
    if (path === '/api/auth/logout' && method === 'POST') return new Response(JSON.stringify({ authenticated: false }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${sessionCookieName(store.slug)}=; Path=${sessionCookiePath(store.slug)}; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
    if (!await isAuthenticated(req, storeEnv, store.slug)) return err('Faça login para acessar os dados da loja.', 401);
    if (path === '/api/auth/password' && method === 'POST') return changePassword(req, storeEnv,store.slug);
    if (path === '/api/settings' && method === 'GET') return json(await first(db, 'SELECT * FROM store_settings WHERE id=1'));
    if (path === '/api/settings' && method === 'PUT') {
      const data = await body(req), old = await first<Row>(db, 'SELECT * FROM store_settings WHERE id=1') ?? {};
      const types = ['auto','telefone','cpf_cnpj','email','aleatoria'];
      const logo = String(data.logo_data_url ?? old.logo_data_url ?? '').trim();
      if (logo && !logo.startsWith('data:image/') && !logo.startsWith('/')) return err('Formato de logotipo inválido.');
      const primaryColor = /^#[0-9a-fA-F]{6}$/.test(String(data.brand_primary_color ?? old.brand_primary_color ?? '')) ? String(data.brand_primary_color ?? old.brand_primary_color) : '#047857';
      const secondaryColor = /^#[0-9a-fA-F]{6}$/.test(String(data.brand_secondary_color ?? old.brand_secondary_color ?? '')) ? String(data.brand_secondary_color ?? old.brand_secondary_color) : '#f59e0b';
      await run(db, `UPDATE store_settings SET store_name=?,logo_data_url=?,pix_key=?,pix_key_type=?,pix_beneficiary_name=?,pix_city=?,billing_message_template=?,brand_primary_color=?,brand_secondary_color=?,updated_at=? WHERE id=1`,
        String(data.store_name ?? old.store_name ?? 'Marlene Interprise').trim() || 'Marlene Interprise', logo,
        String(data.pix_key ?? old.pix_key ?? '').trim(), types.includes(data.pix_key_type) ? data.pix_key_type : (old.pix_key_type ?? 'auto'),
        String(data.pix_beneficiary_name ?? old.pix_beneficiary_name ?? 'MARLENE INTERPRISE').trim(),
        String(data.pix_city ?? old.pix_city ?? 'SAO PAULO').trim(), String(data.billing_message_template ?? old.billing_message_template ?? ''), primaryColor, secondaryColor, now());
      return json(await first(db, 'SELECT * FROM store_settings WHERE id=1'));
    }
    if (path === '/api/loyalty/settings' && method === 'GET') return json(await first(db, 'SELECT * FROM loyalty_settings WHERE id=1'));
    if (path === '/api/loyalty/settings' && method === 'PUT') {
      const d = await body(req), mode = d.mode === 'general' ? 'general' : 'product', enabled = d.enabled ? 1 : 0;
      const previous = await first<{enabled:number;starts_at:string|null}>(db, 'SELECT enabled,starts_at FROM loyalty_settings WHERE id=1');
      const stamp = now();
      const productId = Number(d.product_id) || null;
      const productQuantity = Math.max(1, Math.min(10000, Math.round(Number(d.product_quantity) || 1)));
      const rewardQuantity = Math.max(1, Math.min(10000, Math.round(Number(d.reward_quantity) || 1)));
      const purchaseThreshold = Math.max(1, Math.min(10000, Math.round(Number(d.purchase_threshold) || 1)));
      const rewardCredits = Math.max(1, Math.min(10000, Math.round(Number(d.reward_credits) || 1)));
      const cardColor = /^#[0-9a-fA-F]{6}$/.test(String(d.card_color ?? '')) ? String(d.card_color) : '#047857';
      const cardTitle = String(d.card_title ?? '').trim().slice(0, 48) || 'Cartão fidelidade';
      const cardMessage = String(d.card_message ?? '').trim().slice(0, 120) || 'Junte pontos e ganhe recompensas!';
      if (enabled && mode === 'product' && (!productId || !await first(db, 'SELECT id FROM products WHERE id=?', productId))) return err('Selecione o produto da promoção de fidelidade.');
      const startsAt = enabled && (!previous?.enabled || !previous.starts_at) ? stamp : previous?.starts_at ?? null;
      await run(db, 'UPDATE loyalty_settings SET enabled=?,mode=?,card_title=?,card_message=?,card_color=?,product_id=?,product_quantity=?,reward_quantity=?,purchase_threshold=?,reward_credits=?,starts_at=?,updated_at=? WHERE id=1', enabled, mode, cardTitle, cardMessage, cardColor, productId, productQuantity, rewardQuantity, purchaseThreshold, rewardCredits, startsAt, stamp);
      return json(await first(db, 'SELECT * FROM loyalty_settings WHERE id=1'));
    }
    const loyaltyCardMatch = path.match(/^\/api\/loyalty\/cards\/(\d+)$/);
    if (loyaltyCardMatch && method === 'GET') {
      const employeeId = Number(loyaltyCardMatch[1]), config = await first<Row>(db, 'SELECT * FROM loyalty_settings WHERE id=1');
      if (!config) return err('Configuração de fidelidade não encontrada.', 404);
      if (!await first(db, 'SELECT id FROM employees WHERE id=?', employeeId)) return err('Cliente não encontrado.', 404);
      const purchases = await first<{total:number}>(db, "SELECT COUNT(*) total FROM sales WHERE employee_id=? AND status='active' AND created_at>=?", employeeId, String(config.starts_at??''));
      if (config.mode === 'general') {
        const total = Number(purchases?.total ?? 0), target = Number(config.purchase_threshold);
        return json({ mode:'general', total_purchases:total, total_product_units:0, progress:total%target, target, rewards:0, credits:Math.floor(total/target)*Number(config.reward_credits), product_name:'' });
      }
      const units = await first<{total:number}>(db, "SELECT COALESCE(SUM(si.quantity),0) total FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.employee_id=? AND s.status='active' AND si.product_id=? AND s.created_at>=?", employeeId, Number(config.product_id??0), String(config.starts_at??''));
      const total = Number(units?.total ?? 0), target = Number(config.product_quantity);
      const product = config.product_id ? await first<{name:string}>(db, 'SELECT name FROM products WHERE id=?', Number(config.product_id)) : null;
      return json({ mode:'product', total_purchases:Number(purchases?.total??0), total_product_units:total, progress:total%target, target, rewards:Math.floor(total/target)*Number(config.reward_quantity), credits:0, product_name:product?.name??'Produto' });
    }
    if (path === '/api/products' && method === 'GET') return json(await all(db, 'SELECT * FROM products ORDER BY category,name'));
    if (path === '/api/products' && method === 'POST') {
      const d = await body(req), stamp = now(), id = await newId(db, 'products');
      if (!String(d.name ?? '').trim()) return err('Nome do produto é obrigatório.');
      if (!String(d.category ?? '').trim()) return err('Categoria é obrigatória.');
      const price = Math.round(Number(d.price_cents)), stock = Math.max(0, Math.round(Number(d.stock ?? 0)));
      if (!Number.isFinite(price) || price < 0) return err('Preço inválido.');
      const stmts = [db.prepare(`INSERT INTO products(id,name,description,category,image_url,price_cents,stock,min_stock,available,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, d.name.trim(), String(d.description ?? '').trim(), d.category.trim(), String(d.image_url ?? ''), price, stock, Math.max(0, Number(d.min_stock ?? 5)), d.available ? 1 : 0, stamp, stamp)];
      if (stock) stmts.push(db.prepare(`INSERT INTO stock_movements(product_id,type,quantity_delta,stock_before,stock_after,reason,created_by,created_at) VALUES(?,'entry',?,0,?,'Cadastro inicial do produto',?,?)`).bind(id, stock, stock, d.created_by ?? 'Administrador', stamp));
      await batch(db, stmts); return json(await first(db, 'SELECT * FROM products WHERE id=?', id), 201);
    }
    if (match && match[1] === 'products' && !match[3] && method === 'DELETE') {
      const id=Number(match[2]),product=await first<Row>(db,'SELECT id FROM products WHERE id=?',id);
      if(!product)return err('Produto não encontrado.',404);
      const used=await first(db,'SELECT id FROM sale_items WHERE product_id=? LIMIT 1',id);
      if(used)return err('Este produto aparece no histórico de vendas e não pode ser excluído. Você pode pausá-lo no catálogo.',409);
      await batch(db,[db.prepare('DELETE FROM price_history WHERE product_id=?').bind(id),db.prepare('DELETE FROM stock_movements WHERE product_id=?').bind(id),db.prepare('DELETE FROM products WHERE id=?').bind(id)]);
      return json({deleted:true});
    }
    if (match && match[1] === 'products' && !match[3] && method === 'PUT') {
      const id = Number(match[2]), old = await first<Row>(db, 'SELECT * FROM products WHERE id=?', id); if (!old) return err('Produto não encontrado.',404);
      const d = await body(req), price = Math.round(Number(d.price_cents ?? old.price_cents)), stamp = now();
      if (!Number.isFinite(price) || price < 0) return err('Preço inválido.');
      const stmts: D1PreparedStatement[] = [];
      if (price !== Number(old.price_cents)) stmts.push(db.prepare(`INSERT INTO price_history(product_id,old_price_cents,new_price_cents,reason,changed_by,created_at) VALUES(?,?,?,?,?,?)`).bind(id, old.price_cents, price, d.price_reason ?? 'Alteração de tabela de preços', d.changed_by ?? 'Administrador', stamp));
      stmts.push(db.prepare(`UPDATE products SET name=?,description=?,category=?,image_url=?,price_cents=?,min_stock=?,available=?,updated_at=? WHERE id=?`).bind(
        String(d.name ?? old.name).trim(), String(d.description ?? old.description), String(d.category ?? old.category).trim(), String(d.image_url ?? old.image_url), price, Math.max(0, Number(d.min_stock ?? old.min_stock)), d.available === undefined ? old.available : (d.available ? 1 : 0), stamp, id));
      await batch(db, stmts); return json(await first(db, 'SELECT * FROM products WHERE id=?', id));
    }
    if (path === '/api/price-history' && method === 'GET') {
      const pid = url.searchParams.get('productId');
      return json(await all(db, `SELECT ph.*,p.name product_name FROM price_history ph JOIN products p ON p.id=ph.product_id ${pid ? 'WHERE ph.product_id=?' : ''} ORDER BY ph.created_at DESC,ph.id DESC ${pid ? '' : 'LIMIT 100'}`, ...(pid ? [Number(pid)] : [])));
    }
    if (match && match[1] === 'products' && match[3] === 'stock' && method === 'POST') {
      const id = Number(match[2]), d = await body(req), p = await first<Row>(db, 'SELECT * FROM products WHERE id=?', id); if (!p) return err('Produto não encontrado.',404);
      if (!String(d.reason ?? '').trim()) return err('Justificativa da movimentação é obrigatória.');
      const before = Number(p.stock); let after: number;
      if (d.type === 'entry') { const q = Math.round(Number(d.quantity)); if (q <= 0) return err('Quantidade de entrada deve ser maior que zero.'); after = before + q; }
      else if (d.type === 'adjustment') { after = Math.round(Number(d.new_stock)); if (after < 0) return err('Novo estoque inválido.'); if (after === before) return err('A quantidade informada já é o estoque atual.'); }
      else return err('Tipo de movimentação inválido.');
      const stamp = now();
      await batch(db,[db.prepare('UPDATE products SET stock=?,updated_at=? WHERE id=?').bind(after,stamp,id),db.prepare(`INSERT INTO stock_movements(product_id,type,quantity_delta,stock_before,stock_after,reason,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(id,d.type,after-before,before,after,String(d.reason).trim(),d.created_by ?? 'Administrador',stamp)]);
      return json(await first(db,'SELECT * FROM products WHERE id=?',id));
    }
    if (path === '/api/stock-movements' && method === 'GET') return json(await all(db,`SELECT sm.*,p.name product_name,p.category product_category FROM stock_movements sm JOIN products p ON p.id=sm.product_id ORDER BY sm.created_at DESC,sm.id DESC LIMIT 200`));
    if (path === '/api/employees' && method === 'GET') return json(await all(db,`SELECT e.id,e.name,e.code,e.department,e.phone,e.email,e.active,e.created_at,COALESCE(s.total,0) total_consumed_cents,COALESCE(p.total,0) total_paid_cents,COALESCE(s.total,0)-COALESCE(p.total,0) balance_cents,MAX(s.last_sale,p.last_pay) last_activity_at FROM employees e LEFT JOIN (SELECT employee_id,SUM(total_cents) total,MAX(created_at) last_sale FROM sales WHERE status='active' GROUP BY employee_id) s ON s.employee_id=e.id LEFT JOIN (SELECT employee_id,SUM(amount_cents) total,MAX(created_at) last_pay FROM payments GROUP BY employee_id) p ON p.employee_id=e.id ORDER BY e.name`));
    if (path === '/api/employees' && method === 'POST') {
      const d = await body(req); if (!String(d.name ?? '').trim()) return err('Nome do cliente é obrigatório.');
      const id = await newId(db,'employees'), code = String(d.code ?? `F${crypto.getRandomValues(new Uint16Array(1))[0]! % 900 + 100}`).trim().toUpperCase();
      await run(db,`INSERT INTO employees(id,name,code,department,phone,email,pin,active,created_at) VALUES(?,?,?,?,?,?,?,1,?)`,id,d.name.trim(),code,String(d.department??''),String(d.phone??''),String(d.email??''),String(d.pin??'1234'),now());
      return json({...(await first(db,'SELECT id,name,code,department,phone,email,active,created_at FROM employees WHERE id=?',id)),total_consumed_cents:0,total_paid_cents:0,balance_cents:0,last_activity_at:null},201);
    }
    if (match && match[1] === 'employees' && !match[3] && method === 'PUT') {
      const id=Number(match[2]), old=await first<Row>(db,'SELECT * FROM employees WHERE id=?',Number(match[2])); if(!old)return err('Cliente não encontrado.',404);
      const d=await body(req); await run(db,'UPDATE employees SET name=?,code=?,department=?,phone=?,email=?,active=? WHERE id=?',String(d.name??old.name).trim(),String(d.code??old.code).trim().toUpperCase(),String(d.department??old.department),String(d.phone??old.phone),String(d.email??old.email),d.active?1:0,id);
      const updated=await first<Row>(db,'SELECT id,name,code,department,phone,email,active,created_at FROM employees WHERE id=?',id), b=await balance(db,id);
      return json({...updated,total_consumed_cents:(await first<{n:number}>(db,"SELECT COALESCE(SUM(total_cents),0) n FROM sales WHERE employee_id=? AND status='active'",id))?.n??0,total_paid_cents:(await first<{n:number}>(db,'SELECT COALESCE(SUM(amount_cents),0) n FROM payments WHERE employee_id=?',id))?.n??0,balance_cents:b,last_activity_at:null});
    }
    if (match && match[1] === 'employees' && match[3] === 'statement' && method === 'GET') {
      const id=Number(match[2]), emp=await first<Row>(db,'SELECT id,name,code,department,phone,email,active,created_at FROM employees WHERE id=?',id); if(!emp)return err('Cliente não encontrado.',404);
      const sr=await all<Row>(db,`${saleSelect} WHERE s.employee_id=? ORDER BY s.created_at,s.id`,id), sales=await saleRows(db,sr);
      const pays=await all<Row>(db,'SELECT p.*,e.name employee_name FROM payments p JOIN employees e ON e.id=p.employee_id WHERE p.employee_id=? ORDER BY p.created_at,p.id',id);
      const events=[...sales.map(s=>({kind:'sale' as const,created_at:String(s.created_at),sortId:Number(s.id),sale:s})),...pays.map(p=>({kind:'payment' as const,created_at:String(p.created_at),sortId:Number(p.id),payment:p}))].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.sortId-b.sortId);
      let running=0,consumed=0,paid=0; const ledger=events.map(ev=>{if(ev.kind==='sale'){const amount=Number(ev.sale.total_cents),active=ev.sale.status==='active';if(active){running+=amount;consumed+=amount;}return{uid:`sale-${ev.sale.id}`,kind:'sale',created_at:ev.created_at,title:`Compra #${ev.sale.id}`,status:ev.sale.status,amount_cents:amount,running_balance_cents:running,sale:ev.sale};}const amount=Number(ev.payment.amount_cents);running-=amount;paid+=amount;return{uid:`pay-${ev.payment.id}`,kind:'payment',created_at:ev.created_at,title:`Pagamento (${ev.payment.method})`,amount_cents:amount,running_balance_cents:running,payment:ev.payment};});
      return json({employee:{...emp,total_consumed_cents:consumed,total_paid_cents:paid,balance_cents:consumed-paid,last_activity_at:ledger.at(-1)?.created_at??null},ledger:ledger.reverse()});
    }
    if (path === '/api/sales' && method === 'GET') return json(await saleRows(db,await all(db,`${saleSelect} ORDER BY s.created_at DESC,s.id DESC LIMIT 200`)));
    if (path === '/api/sales' && method === 'POST') { const d=await body(req); return json(await createSale(db,{employee_id:Number(d.employee_id),items:d.items,notes:String(d.notes??''),created_by:String(d.created_by??'Administrador')}),201); }
    if (match && match[1] === 'sales' && match[3] === 'cancel' && method === 'POST') {
      const id=Number(match[2]), d=await body(req), sale=await first<Row>(db,'SELECT * FROM sales WHERE id=?',id); if(!sale)return err('Venda não encontrada.'); if(sale.status!=='active')return err('Esta venda já foi cancelada ou corrigida anteriormente.');
      const items=await all<Row>(db,'SELECT * FROM sale_items WHERE sale_id=?',id), stamp=now(), actor=d.actor??'Administrador', reason=String(d.reason??'Cancelado pelo administrador').trim()||'Cancelamento administrativo'; const stmts:D1PreparedStatement[]=[];
      for(const it of items){const p=await first<{stock:number}>(db,'SELECT stock FROM products WHERE id=?',it.product_id);if(p){const before=Number(p.stock),after=before+Number(it.quantity);stmts.push(db.prepare('UPDATE products SET stock=?,updated_at=? WHERE id=?').bind(after,stamp,it.product_id),db.prepare(`INSERT INTO stock_movements(product_id,type,quantity_delta,stock_before,stock_after,reason,reference_id,created_by,created_at) VALUES(?,'sale_reversal',?,?,?,?,?,?,?)`).bind(it.product_id,it.quantity,before,after,`Estorno por cancelamento da Venda #${id}: ${reason}`,id,actor,stamp));}}
      stmts.push(db.prepare('UPDATE sales SET status=?,cancelled_at=?,cancel_reason=? WHERE id=?').bind('cancelled',stamp,reason,id));await batch(db,stmts);return json((await saleRows(db,[await first(db,`${saleSelect} WHERE s.id=?`,id) as Row]))[0]);
    }
    if (match && match[1] === 'sales' && match[3] === 'correct' && method === 'POST') {
      const id=Number(match[2]),d=await body(req),old=await first<Row>(db,'SELECT * FROM sales WHERE id=?',id);if(!old)return err('Venda original não encontrada.');if(old.status!=='active')return err('Esta venda já foi cancelada ou corrigida anteriormente.');
      const items=await all<Row>(db,'SELECT * FROM sale_items WHERE sale_id=?',id),stamp=now(),actor=String(d.actor??'Administrador'),reason=String(d.reason??'Correção de venda').trim();const stmts:D1PreparedStatement[]=[],credits=new Map<number,number>();
      for(const it of items){const pid=Number(it.product_id),p=await first<{stock:number}>(db,'SELECT stock FROM products WHERE id=?',pid);if(p){const before=Number(p.stock),after=before+Number(it.quantity);credits.set(pid,(credits.get(pid)??0)+Number(it.quantity));stmts.push(db.prepare('UPDATE products SET stock=?,updated_at=? WHERE id=?').bind(after,stamp,pid),db.prepare(`INSERT INTO stock_movements(product_id,type,quantity_delta,stock_before,stock_after,reason,reference_id,created_by,created_at) VALUES(?,'sale_reversal',?,?,?,?,?,?,?)`).bind(pid,it.quantity,before,after,`Estorno por correção da Venda #${id}: ${reason}`,id,actor,stamp));}}
      stmts.push(db.prepare("UPDATE sales SET status='corrected',cancelled_at=?,cancel_reason=? WHERE id=?").bind(stamp,reason,id));
      const result=await createSale(db,{employee_id:Number(d.employee_id??old.employee_id),items:d.items,notes:String(d.notes??''),created_by:actor,corrected_from_sale_id:id,stockCredits:credits,preStatements:stmts});return json(result,201);
    }
    if (path === '/api/payments' && method === 'GET') return json(await all(db,'SELECT p.*,e.name employee_name FROM payments p JOIN employees e ON e.id=p.employee_id ORDER BY p.created_at DESC,p.id DESC LIMIT 200'));
    if (path === '/api/payments' && method === 'POST') {
      const d=await body(req),id=Number(d.employee_id),amount=Math.round(Number(d.amount_cents));if(!Number.isFinite(amount)||amount<=0)return err('Valor do pagamento deve ser maior que zero.');const emp=await first<Row>(db,'SELECT id FROM employees WHERE id=?',id);if(!emp)return err('Cliente não encontrado.');
      const paymentId=await newId(db,'payments'),b=await balance(db,id)-amount;await run(db,'INSERT INTO payments(id,employee_id,amount_cents,method,received_by,notes,balance_after_cents,created_at) VALUES(?,?,?,?,?,?,?,?)',paymentId,id,amount,String(d.method??'Pix').trim(),String(d.received_by??'Administrador'),String(d.notes??''),b,now());return json(await first(db,'SELECT p.*,e.name employee_name FROM payments p JOIN employees e ON e.id=p.employee_id WHERE p.id=?',paymentId),201);
    }
    if (path === '/api/dashboard' && method === 'GET') {
      const rev=await first<{total:number}>(db,"SELECT COALESCE(SUM(total_cents),0) total FROM sales WHERE status='active'"),paid=await first<{total:number}>(db,'SELECT COALESCE(SUM(amount_cents),0) total FROM payments');
      const balances=await all<{balance:number}>(db,`SELECT COALESCE(s.total,0)-COALESCE(p.total,0) balance FROM employees e LEFT JOIN (SELECT employee_id,SUM(total_cents) total FROM sales WHERE status='active' GROUP BY employee_id)s ON s.employee_id=e.id LEFT JOIN (SELECT employee_id,SUM(amount_cents) total FROM payments GROUP BY employee_id)p ON p.employee_id=e.id`);
      const low=await all(db,'SELECT * FROM products WHERE stock<=min_stock ORDER BY stock,name');
      const top=await all(db,`SELECT si.product_id,si.product_name,COALESCE(p.category,'Outros') category,SUM(si.quantity) units_sold,SUM(si.subtotal_cents) revenue_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id WHERE s.status='active' GROUP BY si.product_id,si.product_name ORDER BY units_sold DESC,revenue_cents DESC LIMIT 6`);
      const sr=await all(db,`${saleSelect} ORDER BY s.created_at DESC,s.id DESC LIMIT 6`),payments=await all(db,'SELECT p.*,e.name employee_name FROM payments p JOIN employees e ON e.id=p.employee_id ORDER BY p.created_at DESC,p.id DESC LIMIT 6');
      const pending=balances.reduce((sum,r)=>sum+Math.max(0,Number(r.balance)),0);
      return json({total_revenue_cents:Number(rev?.total??0),total_credit_sales_cents:Number(rev?.total??0),total_received_cents:Number(paid?.total??0),total_pending_cents:pending,debtors_count:balances.filter(r=>Number(r.balance)>0).length,low_stock_products:low,top_products:top,recent_sales:await saleRows(db,sr),recent_payments:payments});
    }
    if (path === '/api/reports' && method === 'GET') {
      const today=new Date(),start=String(url.searchParams.get('startDate')??new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10)),end=String(url.searchParams.get('endDate')??today.toISOString().slice(0,10)),from=`${start}T00:00:00.000Z`,to=`${end}T23:59:59.999Z`;
      const sales=await saleRows(db,await all(db,`${saleSelect} WHERE s.created_at>=? AND s.created_at<=? ORDER BY s.created_at DESC,s.id DESC`,from,to));
      const payments=await all(db,'SELECT p.*,e.name employee_name FROM payments p JOIN employees e ON e.id=p.employee_id WHERE p.created_at>=? AND p.created_at<=? ORDER BY p.created_at DESC,p.id DESC',from,to);
      const movements=await all(db,'SELECT sm.*,p.name product_name,p.category product_category FROM stock_movements sm JOIN products p ON p.id=sm.product_id WHERE sm.created_at>=? AND sm.created_at<=? ORDER BY sm.created_at DESC,sm.id DESC',from,to);
      const top=await all(db,`SELECT si.product_id,si.product_name,COALESCE(p.category,'Outros') category,SUM(si.quantity) units_sold,SUM(si.subtotal_cents) revenue_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN products p ON p.id=si.product_id WHERE s.status='active' AND s.created_at>=? AND s.created_at<=? GROUP BY si.product_id,si.product_name ORDER BY units_sold DESC,revenue_cents DESC`,from,to);
      const emps=await all<Row>(db,'SELECT id,name,department FROM employees ORDER BY name'),cons=await all<Row>(db,"SELECT employee_id,SUM(total_cents) total,COUNT(*) cnt FROM sales WHERE status='active' AND created_at>=? AND created_at<=? GROUP BY employee_id",from,to),pay=await all<Row>(db,'SELECT employee_id,SUM(amount_cents) total FROM payments WHERE created_at>=? AND created_at<=? GROUP BY employee_id',from,to);
      const consumption=[];let pending=0;for(const e of emps){const c=cons.find(r=>r.employee_id===e.id),p=pay.find(r=>r.employee_id===e.id),b=await balance(db,Number(e.id));if(b>0)pending+=b;consumption.push({employee_id:e.id,employee_name:e.name,department:e.department,period_consumed_cents:Number(c?.total??0),period_paid_cents:Number(p?.total??0),current_balance_cents:b,purchases_count:Number(c?.cnt??0)});}
      const active=sales.filter(s=>s.status==='active');return json({start_date:start,end_date:end,total_sales_cents:active.reduce((s,r)=>s+Number(r.total_cents),0),active_sales_count:active.length,cancelled_sales_count:sales.length-active.length,total_received_cents:payments.reduce((s,r)=>s+Number(r.amount_cents),0),payments_count:payments.length,overall_pending_cents:pending,employee_consumption:consumption,top_products:top,sales,payments,stock_movements:movements,closures:await all(db,'SELECT * FROM period_closures ORDER BY created_at DESC,id DESC LIMIT 20')});
    }
    if(path==='/api/closures'&&method==='POST'){
      const d=await body(req);if(!d.period_label||!d.start_date||!d.end_date)return err('Informe rótulo e intervalo de datas do fechamento.');const from=`${d.start_date}T00:00:00.000Z`,to=`${d.end_date}T23:59:59.999Z`;
      const ss=await first<{n:number}>(db,"SELECT COALESCE(SUM(total_cents),0) n FROM sales WHERE status='active' AND created_at>=? AND created_at<=?",from,to),pp=await first<{n:number}>(db,'SELECT COALESCE(SUM(amount_cents),0) n FROM payments WHERE created_at>=? AND created_at<=?',from,to),bs=await all<Row>(db,`SELECT COALESCE(s.total,0)-COALESCE(p.total,0) b FROM employees e LEFT JOIN (SELECT employee_id,SUM(total_cents) total FROM sales WHERE status='active' GROUP BY employee_id)s ON s.employee_id=e.id LEFT JOIN (SELECT employee_id,SUM(amount_cents) total FROM payments GROUP BY employee_id)p ON p.employee_id=e.id`),pending=bs.reduce((s,r)=>s+Math.max(0,Number(r.b)),0);
      const id=await newId(db,'period_closures');await run(db,'INSERT INTO period_closures(id,period_label,start_date,end_date,total_sales_cents,total_received_cents,total_pending_cents,notes,closed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,String(d.period_label).trim(),String(d.start_date),String(d.end_date),Number(ss?.n??0),Number(pp?.n??0),pending,String(d.notes??''),String(d.closed_by??'Administrador'),now());return json(await first(db,'SELECT * FROM period_closures WHERE id=?',id),201);
    }
    return err('Rota não encontrada.',404);
  } catch (error) {
    const message=error instanceof Error?error.message:'Erro interno.';
    return err(message, message.includes('UNIQUE')?409:500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url=new URL(request.url);
    if(env.CANONICAL_STORE_URL)return Response.redirect(env.CANONICAL_STORE_URL,308);
    if(url.pathname.startsWith('/api/admin/'))return handlePlatformApi(request,env);
    let storeSlug='marlene',apiRequest=request;
    if(url.pathname.startsWith('/s/')){
      const match=url.pathname.match(/^\/s\/([a-z0-9-]+)(\/.*)?$/);
      if(!match)return json({error:'Endereço de loja inválido.'},404);
      storeSlug=match[1]!;
      const store=await first<ManagedStore>(env.DB,'SELECT id,slug,store_name,username,created_at FROM managed_stores WHERE slug=?',storeSlug);
      if(!store)return json({error:'Loja não encontrada.'},404);
      const remainder=match[2]??'';
      if(remainder.startsWith('/api/')){
        url.pathname=remainder;
        apiRequest=new Request(url,request);
        return handleApi(apiRequest,env,store,env.DB);
      }
      url.pathname='/';
      return env.ASSETS.fetch(new Request(url,request));
    }
    if(url.pathname.startsWith('/api/')){
      const store=await first<ManagedStore>(env.DB,'SELECT id,slug,store_name,username,created_at FROM managed_stores WHERE slug=?',storeSlug);
      if(!store)return json({error:'Loja não encontrada.'},404);
      return handleApi(apiRequest,env,store,env.DB);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

import { useEffect, useState } from 'react';
import { Check, Copy, LoaderCircle, LogOut, Plus, Store } from 'lucide-react';

interface ManagedStore {
  id: number;
  slug: string;
  store_name: string;
  username: string;
  store_type: 'complete' | 'lite';
  created_at: string;
}

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `Erro na requisição (${response.status})`);
  return data as T;
}

function makeSlug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function PlatformAdminView() {
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [stores, setStores] = useState<ManagedStore[]>([]);
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [storeUsername, setStoreUsername] = useState('');
  const [storePassword, setStorePassword] = useState('');
  const [storeType, setStoreType] = useState<'complete' | 'lite'>('complete');
  const [productLines, setProductLines] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [accessText, setAccessText] = useState('');
  const [copied, setCopied] = useState(false);

  const loadStores = async () => setStores(await call<ManagedStore[]>('/api/admin/stores'));
  useEffect(() => {
    call<{ authenticated: boolean }>('/api/admin/auth/status').then(async (result) => {
      setAuthenticated(result.authenticated);
      if (result.authenticated) await loadStores();
    }).catch(() => undefined).finally(() => setReady(true));
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await call('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setAuthenticated(true);
      setPassword('');
      await loadStores();
    } catch (err) { setError((err as Error).message); }
  };

  const createStore = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const products = productLines.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((name) => ({ name, category: 'Lanches & Bebidas', price_cents: 0, stock: 0, min_stock: 5, available: 0 }));
      const initialPassword = storePassword;
      const created = await call<ManagedStore>('/api/admin/stores', { method: 'POST', body: JSON.stringify({ store_name: storeName, slug, username: storeUsername, password: initialPassword, products, store_type: storeType }) });
      setStores((current) => [...current, created]);
      setAccessText(makeAccessText(created, initialPassword));
      setCopied(false);
      setStoreName(''); setSlug(''); setStoreUsername(''); setStorePassword(''); setProductLines(''); setStoreType('complete');
      setNotice(`Loja ${created.store_name} criada. Acesse ${window.location.origin}/s/${created.slug}`);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const makeAccessText = (store: ManagedStore, initialPassword?: string) => [
    `Olá! Seja bem-vindo(a) à plataforma Tem o quê?`,
    `Sua loja ${store.store_name} já está criada.`,
    '',
    `Acesse seu painel por este link: ${window.location.origin}/s/${store.slug}`,
    `Login: ${store.username}`,
    ...(initialPassword ? [`Senha inicial: ${initialPassword}`] : ['Senha: use a senha que foi cadastrada para sua loja.']),
    '',
    'No painel você pode organizar produtos, preços, estoque, vendas, clientes e personalizar as configurações da loja.',
    'Recomendamos alterar a senha inicial após o primeiro acesso.',
  ].join('\n');

  const copyAccessText = async () => {
    try {
      await navigator.clipboard.writeText(accessText);
      setCopied(true);
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie o texto manualmente.');
    }
  };

  if (!ready) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Carregando…</main>;
  if (!authenticated) return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4">
      <form onSubmit={login} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3"><Store className="h-6 w-6 text-emerald-700" /><div><h1 className="font-display text-xl font-bold">Tem o quê?</h1><p className="text-sm text-slate-500">Administração das lojas</p></div></div>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Login<input required autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 font-normal" /></label>
        <label className="block space-y-1.5 text-sm font-medium text-slate-700">Senha<input required type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 font-normal" /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
        <button className="h-12 w-full rounded-xl bg-emerald-700 font-semibold text-white hover:bg-emerald-800">Entrar</button>
      </form>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3"><Store className="h-6 w-6 text-emerald-700" /><div><h1 className="font-display text-xl font-bold">Painel administrador</h1><p className="text-sm text-slate-500">Gerencie as lojas no mesmo site</p></div></div>
          <button onClick={async () => { await call('/api/admin/auth/logout', { method: 'POST' }); setAuthenticated(false); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-sm font-medium"><LogOut className="h-4 w-4" />Sair</button>
        </header>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

        {accessText && <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
          <div><h2 className="font-semibold text-emerald-950">Mensagem de boas-vindas e acesso</h2><p className="mt-1 text-sm text-emerald-900">Revise o texto e copie para enviar ao responsável pela loja.</p></div>
          <textarea aria-label="Texto de boas-vindas e acesso" rows={8} value={accessText} onChange={(event) => setAccessText(event.target.value)} className="w-full rounded-xl border border-emerald-200 bg-white p-3 text-sm leading-relaxed" />
          <button type="button" onClick={copyAccessText} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Texto copiado' : 'Copiar texto'}</button>
        </section>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Lojas cadastradas ({stores.length})</h2>
          <div className="divide-y divide-slate-100">
            {stores.map((store) => <div key={store.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <div><p className="font-semibold">{store.store_name} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{store.store_type === 'lite' ? 'Lite' : 'Completa'}</span></p><p className="mt-0.5 text-xs text-slate-500">Login: {store.username} · Caminho: /s/{store.slug}</p></div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setAccessText(makeAccessText(store)); setCopied(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Gerar texto de acesso</button>
                <a href={`/s/${store.slug}`} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">Abrir loja</a>
              </div>
            </div>)}
          </div>
        </section>

        <form onSubmit={createStore} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div><h2 className="text-base font-semibold">Criar nova loja</h2><p className="mt-1 text-sm text-slate-500">Cada loja terá catálogo, clientes, vendas e configurações separados.</p></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-semibold text-slate-700">Nome da loja<input required value={storeName} onChange={(e) => { setStoreName(e.target.value); setSlug(makeSlug(e.target.value)); }} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Ex.: Minhoca Lanches" /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-700">Caminho da loja<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="minhoca-lanches" /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-700">Login do responsável<input required value={storeUsername} onChange={(e) => setStoreUsername(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="yasmin" /></label>
            <label className="space-y-1 text-xs font-semibold text-slate-700">Senha inicial (mínimo 12 caracteres)<input required minLength={12} type="password" autoComplete="new-password" value={storePassword} onChange={(e) => setStorePassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
          </div>
          <fieldset className="space-y-2"><legend className="text-xs font-semibold text-slate-700">Tipo de loja</legend><div className="grid gap-2 sm:grid-cols-2">{([{ value: 'complete', title: 'Completa', detail: 'Todos os recursos atuais.' }, { value: 'lite', title: 'Lite', detail: 'PDV, estoque, clientes e pendências.' }] as const).map((option) => <label key={option.value} className={`cursor-pointer rounded-xl border p-3 ${storeType === option.value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}><input className="sr-only" type="radio" name="store-type" value={option.value} checked={storeType === option.value} onChange={() => setStoreType(option.value)} /><span className="block text-sm font-semibold">{option.title}</span><span className="mt-0.5 block text-xs font-normal text-slate-500">{option.detail}</span></label>)}</div></fieldset>
          <label className="block space-y-1 text-xs font-semibold text-slate-700">Produtos iniciais (um por linha)<textarea rows={3} value={productLines} onChange={(e) => setProductLines(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder={'Cuscuz salgado\nBolo mole'} /></label>
          <p className="text-xs text-slate-500">Produtos iniciais ficam sem preço e indisponíveis até serem configurados no catálogo.</p>
          <button disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Criando loja…' : 'Criar loja'}</button>
        </form>
      </div>
    </main>
  );
}

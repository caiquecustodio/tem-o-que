import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ApiError } from '../api/client';
import { publicApi } from '../api/publicApi';
import type { PixInfo, PublicCatalog, PublicOffer, PublicOrder, PublicProduct } from '../api/publicApi';
import { buildPixPayload } from '../utils/pix';
import { CATEGORY_IMAGES, formatBRL } from '../utils/format';

/** Página pública de pedidos: o cliente entra com nome + 4 últimos dígitos do WhatsApp e reserva sem criar conta. */

const STATUS_LABEL: Record<PublicOrder['status'], string> = {
  pending_review: 'Em análise', approved: 'Aprovado pela loja', delivered: 'Entregue', rejected: 'Recusado', cancelled: 'Cancelado',
};
const shortRef = (id: number) => `#${String(id).slice(-4)}`;
const formatServiceDate = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : null;

const inputClass = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/25';
const primaryButton = 'inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 px-4 text-base font-semibold text-white hover:bg-emerald-800 active:scale-[0.99] disabled:opacity-50 cursor-pointer';
const secondaryButton = 'inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

interface CartLine { key: string; productId: number; offerId: number | null; name: string; category: string; price: number; quantity: number; max: number }

declare global { interface Window { turnstile?: { render: (el: HTMLElement, options: Record<string, unknown>) => string; reset: (id?: string) => void } } }

function TurnstileBox({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const render = () => { if (!cancelled && ref.current && window.turnstile && !ref.current.hasChildNodes()) window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, 'expired-callback': () => onToken(''), language: 'pt-br' }); };
    if (window.turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!script) { script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.dataset.turnstile = '1'; document.head.appendChild(script); }
      script.addEventListener('load', render);
    }
    return () => { cancelled = true; };
  }, [siteKey, onToken]);
  return <div ref={ref} className="min-h-[65px]" />;
}

function PixPanel({ order, customerName, onClose, onChanged }: { order: PublicOrder; customerName: string; onClose: () => void; onChanged: () => void }) {
  const [pix, setPix] = useState<PixInfo | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => { publicApi.pixInfo().then(setPix).catch((e) => setError((e as Error).message)); }, []);
  const payload = useMemo(() => pix?.pix_key ? buildPixPayload({ pixKey: pix.pix_key, keyType: pix.pix_key_type as never, beneficiaryName: pix.pix_beneficiary_name || pix.store_name, city: pix.pix_city || 'SAO PAULO', amountCents: order.total_cents, txid: `PED${String(order.id).slice(-10)}` }) : '', [pix, order]);
  useEffect(() => { if (payload) QRCode.toDataURL(payload, { margin: 1, width: 260 }).then(setQr).catch(() => setQr('')); }, [payload]);
  const copy = async (label: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(label); window.setTimeout(() => setCopied(''), 2500); } catch { setError('Não foi possível copiar. Selecione o texto e copie manualmente.'); } };
  const whatsappDigits = (pix?.whatsapp_phone ?? '').replace(/\D/g, '');
  const sendReceipt = async () => {
    try { await publicApi.receiptSent(order.id); onChanged(); } catch (e) { setError((e as Error).message); return; }
    const text = `Olá! Segue o comprovante do pedido ${shortRef(order.id)} de ${customerName} (${formatBRL(order.total_cents)}).`;
    window.open(`https://wa.me/${whatsappDigits.length <= 11 ? `55${whatsappDigits}` : whatsappDigits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Pagar com Pix" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <header className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Pagar com Pix</h2><p className="text-sm text-slate-600">Pedido {shortRef(order.id)} · {formatBRL(order.total_cents)}</p></div>
          <button onClick={onClose} aria-label="Fechar" className="min-h-11 min-w-11 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">✕</button>
        </header>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {!pix ? <p className="py-6 text-center text-sm text-slate-500">Carregando dados do Pix…</p> : !pix.pix_key ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A loja ainda não cadastrou a chave Pix. Combine o pagamento direto pelo WhatsApp.</p> : (
          <>
            {qr && <img src={qr} alt="QR Code do Pix" className="mx-auto h-60 w-60 rounded-xl border border-slate-200" />}
            <div className="space-y-2">
              <button onClick={() => void copy('chave', pix.pix_key)} className={secondaryButton}>{copied === 'chave' ? 'Chave copiada' : 'Copiar chave Pix'}</button>
              <button onClick={() => void copy('codigo', payload)} className={primaryButton}>{copied === 'codigo' ? 'Código copiado' : 'Copiar Pix Copia e Cola'}</button>
            </div>
            <p className="text-center text-xs text-slate-500">Favorecido: {pix.pix_beneficiary_name || pix.store_name}</p>
            <div className="border-t border-slate-200 pt-4 space-y-2">
              <p className="text-sm text-slate-700">Depois de pagar, envie o comprovante para a loja.</p>
              <button onClick={() => void sendReceipt()} disabled={!whatsappDigits} className={secondaryButton}>Enviar comprovante pelo WhatsApp</button>
              {!whatsappDigits && <p className="text-xs text-slate-500">A loja ainda não cadastrou o WhatsApp para receber comprovantes.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PublicOrderView() {
  const [view, setView] = useState<'loading' | 'identify' | 'shop'>('loading');
  const [storeName, setStoreName] = useState('Loja');
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [token, setToken] = useState('');
  const [identifyError, setIdentifyError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [checkout, setCheckout] = useState(false);
  const [payChoice, setPayChoice] = useState<'later' | 'pix_now'>('later');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pixOrder, setPixOrder] = useState<PublicOrder | null>(null);

  const loadShop = useCallback(async () => {
    try {
      const [cat, mine] = await Promise.all([publicApi.catalog(), publicApi.myOrders()]);
      setCatalog(cat); setOrders(mine); setView('shop');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setView('identify');
      else { setMessage({ type: 'error', text: (e as Error).message }); setView((current) => current === 'loading' ? 'identify' : current); }
    }
  }, []);

  useEffect(() => {
    publicApi.config().then((config) => { setStoreName(config.store_name); setSiteKey(config.turnstile_site_key); document.title = `Pedidos · ${config.store_name}`; }).catch(() => undefined);
    void loadShop();
  }, [loadShop]);

  const identify = async (event: React.FormEvent) => {
    event.preventDefault();
    setIdentifyError(''); setBusy(true);
    try { await publicApi.identify({ name, phone_last4: last4, turnstile_token: token || undefined }); setLast4(''); await loadShop(); }
    catch (e) { setIdentifyError((e as Error).message); if (siteKey) window.turnstile?.reset(); setToken(''); }
    finally { setBusy(false); }
  };

  const productsById = useMemo(() => new Map((catalog?.products ?? []).map((p) => [p.id, p])), [catalog]);
  const setQuantity = (line: Omit<CartLine, 'quantity'>, quantity: number) => setCart((current) => {
    const next = { ...current };
    const clamped = Math.max(0, Math.min(line.max, quantity));
    if (clamped === 0) delete next[line.key]; else next[line.key] = { ...line, quantity: clamped };
    return next;
  });
  const cartLines = Object.values(cart);
  const cartTotal = cartLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  const submitOrder = async () => {
    setBusy(true); setMessage(null);
    try {
      const order = await publicApi.createOrder({ items: cartLines.map((l) => ({ product_id: l.productId, offer_id: l.offerId, quantity: l.quantity })), payment_choice: payChoice, notes: notes.trim() });
      setCart({}); setNotes(''); setCheckout(false);
      setMessage({ type: 'ok', text: `Pedido ${shortRef(order.id)} enviado! A loja vai conferir e confirmar com você.` });
      await loadShop();
      if (order.payment_choice === 'pix_now') setPixOrder(order);
    } catch (e) { setMessage({ type: 'error', text: (e as Error).message }); setCheckout(false); await loadShop(); }
    finally { setBusy(false); }
  };

  const cancelOrder = async (id: number) => { try { await publicApi.cancelOrder(id); await loadShop(); } catch (e) { setMessage({ type: 'error', text: (e as Error).message }); } };

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-slate-50 pb-32 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <h1 className="truncate text-lg font-bold">{storeName}</h1>
          {view === 'shop' && <button onClick={() => void publicApi.logout().then(() => { setCatalog(null); setCart({}); setView('identify'); })} className="min-h-11 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer">Sair</button>}
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">{children}</div>
    </main>
  );

  if (view === 'loading') return shell(<p className="py-16 text-center text-sm text-slate-500">Carregando…</p>);

  if (view === 'identify') return shell(
    <form onSubmit={identify} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-xl font-semibold">Faça sua reserva</h2><p className="mt-1 text-sm text-slate-600">Digite seu nome e os 4 últimos números do seu WhatsApp cadastrado na loja.</p></div>
      <label className="block text-sm font-medium text-slate-700">Nome completo<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className={`${inputClass} mt-1`} /></label>
      <label className="block text-sm font-medium text-slate-700">4 últimos dígitos do WhatsApp<input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="\d{4}" maxLength={4} required className={`${inputClass} mt-1 tracking-[0.4em]`} /></label>
      {siteKey && <TurnstileBox siteKey={siteKey} onToken={setToken} />}
      {identifyError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{identifyError}</p>}
      {message?.type === 'error' && !identifyError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{message.text}</p>}
      <button type="submit" disabled={busy || (Boolean(siteKey) && !token)} className={primaryButton}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <p className="text-center text-xs text-slate-500">Não encontrou seu cadastro? Fale com a loja pelo WhatsApp.</p>
    </form>,
  );

  const offers = catalog?.offers ?? [];
  const grouped = new Map<string, PublicProduct[]>();
  for (const product of catalog?.products ?? []) grouped.set(product.category, [...(grouped.get(product.category) ?? []), product]);

  const stepper = (line: Omit<CartLine, 'quantity'>, disabled = false) => {
    const quantity = cart[line.key]?.quantity ?? 0;
    return disabled ? <span className="text-sm font-medium text-slate-500">Esgotado</span> : quantity === 0
      ? <button onClick={() => setQuantity(line, 1)} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white cursor-pointer">Adicionar</button>
      : (
        <div className="inline-flex items-center gap-1" role="group" aria-label={`Quantidade de ${line.name}`}>
          <button onClick={() => setQuantity(line, quantity - 1)} aria-label="Diminuir" className="h-11 w-11 rounded-xl border border-slate-300 text-lg cursor-pointer">−</button>
          <span className="w-8 text-center font-mono text-base tabular-nums">{quantity}</span>
          <button onClick={() => setQuantity(line, quantity + 1)} disabled={quantity >= line.max} aria-label="Aumentar" className="h-11 w-11 rounded-xl border border-slate-300 text-lg disabled:opacity-40 cursor-pointer">+</button>
        </div>
      );
  };

  const offerCard = (offer: PublicOffer) => {
    const product = productsById.get(offer.product_id); if (!product) return null;
    const date = formatServiceDate(offer.service_date);
    const full = offer.remaining !== null && offer.remaining <= 0;
    return (
      <article key={offer.id} className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
        <img src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Outros} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{product.name}</h3>
          <p className="text-sm text-slate-700">{date ? `Para ${date}` : 'Reserva aberta'} · {formatBRL(product.price_cents)}</p>
          <p className="text-xs text-slate-600">{offer.remaining === null ? 'Sem limite de porções' : full ? 'Reservas esgotadas' : `${offer.remaining === 1 ? 'Resta' : 'Restam'} ${offer.remaining} ${offer.remaining === 1 ? 'porção' : 'porções'}`}</p>
        </div>
        {stepper({ key: `o${offer.id}`, productId: product.id, offerId: offer.id, name: product.name, category: product.category, price: product.price_cents, max: Math.min(99, offer.remaining ?? 99) }, full)}
      </article>
    );
  };

  return shell(
    <>
      <p className="text-base text-slate-700">Olá, <strong>{catalog?.customer.first_name}</strong>! Escolha o que quer reservar.</p>
      {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>{message.text}</p>}

      {offers.length > 0 && <section className="space-y-2"><h2 className="text-base font-semibold">Reservas abertas</h2>{offers.map(offerCard)}</section>}

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Produtos disponíveis</h2>
        {grouped.size === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Nenhum produto disponível agora. Volte mais tarde.</p> : [...grouped.entries()].map(([category, items]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-medium text-slate-500">{category}</h3>
            {items.map((product) => (
              <article key={product.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <img src={CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.Outros} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
                <div className="min-w-0 flex-1"><h4 className="truncate font-semibold">{product.name}</h4>{product.description && <p className="line-clamp-2 text-xs text-slate-600">{product.description}</p>}<p className="font-mono text-sm tabular-nums">{formatBRL(product.price_cents)}</p></div>
                {stepper({ key: `p${product.id}`, productId: product.id, offerId: null, name: product.name, category: product.category, price: product.price_cents, max: 99 }, product.sold_out)}
              </article>
            ))}
          </div>
        ))}
      </section>

      {orders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Meus pedidos</h2>
          {orders.map((order) => (
            <article key={order.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3.5">
              <header className="flex items-center justify-between gap-2"><strong>Pedido {shortRef(order.id)}</strong><span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{STATUS_LABEL[order.status]}</span></header>
              <p className="text-sm text-slate-700">{order.items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ')}</p>
              <p className="text-sm"><span className="font-mono tabular-nums font-semibold">{formatBRL(order.total_cents)}</span> · {order.payment_choice === 'pix_now' ? (order.payment_state === 'confirmed' ? 'Pix confirmado' : order.payment_state === 'claimed' ? 'Comprovante enviado' : 'Aguardando Pix') : 'Pagar depois'}</p>
              {(order.status === 'pending_review' || order.status === 'approved') && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {order.payment_state !== 'confirmed' && order.payment_choice === 'pix_now' && <button onClick={() => setPixOrder(order)} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white cursor-pointer">Pagar com Pix</button>}
                  {order.status === 'pending_review' && <button onClick={() => void cancelOrder(order.id)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-medium text-red-700 cursor-pointer">Cancelar pedido</button>}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {cartCount > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-2xl"><button onClick={() => setCheckout(true)} className={primaryButton}>Revisar pedido · {cartCount} {cartCount === 1 ? 'item' : 'itens'} · {formatBRL(cartTotal)}</button></div>
        </div>
      )}

      {checkout && (
        <div role="dialog" aria-modal="true" aria-label="Revisar pedido" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center">
          <div className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
            <header className="flex items-center justify-between"><h2 className="text-lg font-semibold">Revisar pedido</h2><button onClick={() => setCheckout(false)} aria-label="Fechar" className="min-h-11 min-w-11 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer">✕</button></header>
            <ul className="space-y-1.5 text-sm">{cartLines.map((l) => <li key={l.key} className="flex justify-between gap-3"><span>{l.quantity}× {l.name}{l.offerId ? ' (reserva)' : ''}</span><span className="font-mono tabular-nums">{formatBRL(l.price * l.quantity)}</span></li>)}</ul>
            <p className="flex justify-between border-t border-slate-200 pt-3 text-base font-semibold"><span>Total</span><span className="font-mono tabular-nums">{formatBRL(cartTotal)}</span></p>
            <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">Como vai pagar?</legend>
              {([['later', 'Pagar depois', 'Fica registrado para a loja cobrar.'], ['pix_now', 'Pagar agora com Pix', 'Mostramos o QR Code e a chave para copiar.']] as const).map(([value, label, hint]) => (
                <label key={value} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${payChoice === value ? 'border-emerald-700 bg-emerald-50' : 'border-slate-300'}`}>
                  <input type="radio" name="pay" checked={payChoice === value} onChange={() => setPayChoice(value)} className="mt-1 h-4 w-4" /><span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-slate-600">{hint}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium text-slate-700">Observação (opcional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} rows={2} className={`${inputClass} mt-1 py-2`} /></label>
            <p className="text-xs text-slate-500">A loja confere o pedido antes de confirmar. Nada é cobrado até lá.</p>
            <button onClick={() => void submitOrder()} disabled={busy} className={primaryButton}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
          </div>
        </div>
      )}

      {pixOrder && <PixPanel order={pixOrder} customerName={catalog?.customer.first_name ?? ''} onClose={() => setPixOrder(null)} onChanged={() => void loadShop()} />}
    </>,
  );
}

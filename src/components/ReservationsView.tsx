import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import type { Order, OrderStatus, Product, ProductionRow, ReservationOffer } from '../types';
import { api, getStorePathPrefix } from '../api/client';
import { formatBRL, formatDateTime } from '../utils/format';

type Tab = 'orders' | 'offers' | 'production';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_review: 'Em análise', approved: 'Aprovado', delivered: 'Entregue', rejected: 'Recusado', cancelled: 'Cancelado pelo cliente',
};
const STATUS_STYLE: Record<OrderStatus, string> = {
  pending_review: 'bg-amber-50 text-amber-800 border-amber-200', approved: 'bg-sky-50 text-sky-800 border-sky-200', delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-slate-100 text-slate-600 border-slate-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatServiceDate = (value: string | null) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'Sem data';
const whatsappLink = (phone?: string) => { const digits = (phone ?? '').replace(/\D/g, ''); return digits ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}` : null; };

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20';
const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';

interface ReservationsViewProps { products: Product[]; onDataChanged: () => Promise<void> }

export function ReservationsView({ products, onDataChanged }: ReservationsViewProps) {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [offers, setOffers] = useState<ReservationOffer[]>([]);
  const [sheet, setSheet] = useState<ProductionRow[]>([]);
  const [sheetDate, setSheetDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [payNow, setPayNow] = useState<Record<number, boolean>>({});
  const [offerProductId, setOfferProductId] = useState('');
  const [offerDate, setOfferDate] = useState('');
  const [offerLimit, setOfferLimit] = useState('');
  const [offerCloses, setOfferCloses] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const publicLink = `${window.location.origin}${getStorePathPrefix()}/pedido`;
  const copyPublicLink = async () => { try { await navigator.clipboard.writeText(publicLink); setLinkCopied(true); window.setTimeout(() => setLinkCopied(false), 2500); } catch { setError('Não foi possível copiar. Selecione o link e copie manualmente.'); } };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordersData, offersData, sheetData] = await Promise.all([api.getOrders(), api.getOffers(), api.getProductionSheet(sheetDate || undefined)]);
      setOrders(ordersData); setOffers(offersData); setSheet(sheetData); setError('');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [sheetDate]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, task: () => Promise<unknown>, refreshStore = false) => {
    setBusyKey(key); setError('');
    try { await task(); await load(true); if (refreshStore) await onDataChanged(); } catch (e) { setError((e as Error).message); } finally { setBusyKey(null); }
  };

  const pendingCount = orders.filter((o) => o.status === 'pending_review').length;
  const sortedProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [products]);

  const createOffer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!offerProductId) { setError('Escolha o produto da reserva.'); return; }
    void act('offer-new', async () => {
      await api.createOffer({ product_id: Number(offerProductId), service_date: offerDate || null, limit_qty: offerLimit ? Number(offerLimit) : null, closes_at: offerCloses ? new Date(offerCloses).toISOString() : null });
      setOfferProductId(''); setOfferDate(''); setOfferLimit(''); setOfferCloses('');
    });
  };

  const tabs: Array<{ id: Tab; label: string; badge?: number }> = [
    { id: 'orders', label: 'Pedidos', badge: pendingCount }, { id: 'offers', label: 'Reservas abertas' }, { id: 'production', label: 'Ficha de produção' },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Seções de reservas" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map((item) => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
              className={`min-h-10 rounded-lg px-3.5 text-sm font-medium cursor-pointer ${tab === item.id ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {item.label}{item.badge ? <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">{item.badge}</span> : null}
            </button>
          ))}
        </div>
        <button onClick={() => void load()} className={secondaryButton}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5">
        <p className="min-w-0 text-sm text-slate-700">Página para os clientes reservarem: <a href={publicLink} target="_blank" rel="noreferrer" className="break-all font-mono text-xs font-semibold text-emerald-800 underline">{publicLink}</a></p>
        <button onClick={() => void copyPublicLink()} className={secondaryButton}>{linkCopied ? 'Link copiado' : 'Copiar link'}</button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Carregando…</p> : (
        <>
          {tab === 'orders' && (orders.length === 0
            ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nenhum pedido ainda. Quando um cliente reservar pela página pública, ele aparece aqui.</p>
            : <div className="space-y-3">{orders.map((order) => {
              const link = whatsappLink(order.employee_phone);
              const canAct = order.status === 'pending_review' || order.status === 'approved';
              const payChecked = payNow[order.id] ?? (order.payment_state === 'confirmed');
              return (
                <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <header className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{order.employee_name}</h3>
                      <p className="text-xs text-slate-500">{formatDateTime(order.created_at)} · {order.payment_choice === 'pix_now' ? 'Pix agora' : 'Paga depois'}{order.payment_state === 'claimed' ? ' · comprovante enviado' : order.payment_state === 'confirmed' ? ' · Pix confirmado' : ''}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
                  </header>
                  <ul className="space-y-1 text-sm text-slate-700">{order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3"><span>{item.quantity}× {item.product_name}{item.offer_id ? ' (reserva)' : ''}</span><span className="font-mono tabular-nums">{formatBRL(item.unit_price_cents * item.quantity)}</span></li>
                  ))}</ul>
                  {order.notes && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Observação: {order.notes}</p>}
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <strong className="font-mono tabular-nums">{formatBRL(order.total_cents)}</strong>
                    <div className="flex flex-wrap items-center gap-2">
                      {link && <a href={link} target="_blank" rel="noreferrer" className={secondaryButton} aria-label={`Chamar ${order.employee_name} no WhatsApp`}><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a>}
                      {order.status === 'pending_review' && <button disabled={busyKey === `o${order.id}`} onClick={() => void act(`o${order.id}`, () => api.orderAction(order.id, 'approve'))} className={primaryButton}>Aprovar</button>}
                      {order.status === 'approved' && (
                        <>
                          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={payChecked} onChange={(e) => setPayNow((current) => ({ ...current, [order.id]: e.target.checked }))} className="h-4 w-4" />Pix recebido</label>
                          <button disabled={busyKey === `o${order.id}`} onClick={() => void act(`o${order.id}`, () => api.orderAction(order.id, 'deliver', { confirm_payment: payChecked }), true)} className={primaryButton}>Entregar</button>
                        </>
                      )}
                      {canAct && <button disabled={busyKey === `o${order.id}`} onClick={() => void act(`o${order.id}`, () => api.orderAction(order.id, 'reject'))} className={`${secondaryButton} text-red-700`}>Recusar</button>}
                    </div>
                  </footer>
                </article>
              );
            })}</div>)}

          {tab === 'offers' && (
            <div className="space-y-4">
              <form onSubmit={createOffer} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <h3 className="font-semibold text-slate-900">Nova reserva</h3>
                <p className="text-xs text-slate-500">Ex.: cuscuz de sexta, até 20 porções, pedidos até quinta às 18h. Sem data, vira uma fila geral.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm text-slate-700">Produto<select value={offerProductId} onChange={(e) => setOfferProductId(e.target.value)} className={`${inputClass} mt-1`}><option value="">Selecione</option>{sortedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                  <label className="text-sm text-slate-700">Dia da produção<input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} className={`${inputClass} mt-1`} /></label>
                  <label className="text-sm text-slate-700">Limite de porções<input type="number" min={1} inputMode="numeric" value={offerLimit} onChange={(e) => setOfferLimit(e.target.value)} placeholder="Sem limite" className={`${inputClass} mt-1`} /></label>
                  <label className="text-sm text-slate-700">Pedidos até<input type="datetime-local" value={offerCloses} onChange={(e) => setOfferCloses(e.target.value)} className={`${inputClass} mt-1`} /></label>
                </div>
                <button type="submit" disabled={busyKey === 'offer-new'} className={primaryButton}>Criar reserva</button>
              </form>
              {offers.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nenhuma reserva criada.</p> : (
                <div className="grid gap-3 sm:grid-cols-2">{offers.map((offer) => (
                  <article key={offer.id} className={`rounded-2xl border bg-white p-4 space-y-2 ${offer.status === 'open' ? 'border-slate-200' : 'border-slate-200 opacity-70'}`}>
                    <header className="flex items-start justify-between gap-2"><h3 className="font-semibold text-slate-900">{offer.product_name}</h3><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${offer.status === 'open' ? STATUS_STYLE.delivered : STATUS_STYLE.rejected}`}>{offer.status === 'open' ? 'Aberta' : 'Encerrada'}</span></header>
                    <p className="text-sm text-slate-600">{formatServiceDate(offer.service_date)}{offer.closes_at ? ` · pedidos até ${formatDateTime(offer.closes_at)}` : ''}</p>
                    <p className="text-sm text-slate-900"><strong className="font-mono tabular-nums">{offer.reserved_qty}</strong>{offer.limit_qty ? ` de ${offer.limit_qty}` : ''} reservadas · {formatBRL(offer.price_cents)}</p>
                    <div className="flex gap-2 pt-1">
                      <button disabled={busyKey === `f${offer.id}`} onClick={() => void act(`f${offer.id}`, () => api.updateOffer(offer.id, { status: offer.status === 'open' ? 'closed' : 'open' }))} className={secondaryButton}>{offer.status === 'open' ? 'Encerrar' : 'Reabrir'}</button>
                      {offer.reserved_qty === 0 && <button disabled={busyKey === `f${offer.id}`} onClick={() => void act(`f${offer.id}`, () => api.deleteOffer(offer.id))} className={`${secondaryButton} text-red-700`}>Excluir</button>}
                    </div>
                  </article>
                ))}</div>
              )}
            </div>
          )}

          {tab === 'production' && (
            <div className="space-y-3">
              <label className="block max-w-xs text-sm text-slate-700">Filtrar por dia<input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} className={`${inputClass} mt-1`} /></label>
              {sheet.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nada reservado para produzir.</p> : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <p className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">{sheet.length} {sheet.length === 1 ? 'item' : 'itens'} · pedidos em análise e aprovados</p>
                  <div className="divide-y divide-slate-100">{sheet.map((row) => (
                    <div key={`${row.product_id}-${row.service_date}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{row.product_name}</p><p className="text-xs text-slate-500">{formatServiceDate(row.service_date)} · {row.orders_count} {row.orders_count === 1 ? 'pedido' : 'pedidos'}{row.pending_quantity ? ` · ${row.pending_quantity} em análise` : ''}</p></div>
                      <strong className="font-mono text-lg tabular-nums text-slate-900">{row.quantity}</strong>
                    </div>
                  ))}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

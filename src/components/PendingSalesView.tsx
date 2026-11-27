import { useEffect, useMemo, useState } from 'react';
import { Check, RefreshCw, Search } from 'lucide-react';
import type { Sale } from '../types';
import { api } from '../api/client';
import { outbox, useOutbox } from '../api/outbox';
import { formatBRL, formatDateTime } from '../utils/format';

export function PendingSalesView({ onDataChanged }: { onDataChanged: () => Promise<void> }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const { ops, syncTick } = useOutbox();
  const settledIds = useMemo(() => new Set(ops.filter((op) => op.kind === 'sale.settle' && op.state !== 'failed').map((op) => Number(op.meta.sale_id))), [ops]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const load = async (silent = false) => { if (!silent) setLoading(true); try { setSales(await api.getPendingSales()); setError(''); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { void load(syncTick > 0); }, [syncTick]);
  const openSales = useMemo(() => sales.filter((sale) => !settledIds.has(sale.id)), [sales, settledIds]);
  const filteredSales = useMemo(() => { const query=search.trim().toLocaleLowerCase('pt-BR'); return query ? openSales.filter(sale=>sale.employee_name.toLocaleLowerCase('pt-BR').includes(query)) : openSales; }, [openSales,search]);
  const grouped = useMemo(() => {
    const map = new Map<number, { name: string; total: number; sales: Sale[] }>();
    for (const sale of filteredSales) { const row = map.get(sale.employee_id) ?? { name: sale.employee_name, total: 0, sales: [] }; row.total += sale.total_cents; row.sales.push(sale); map.set(sale.employee_id, row); }
    return [...map.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name));
  }, [filteredSales]);
  // A venda sai da lista na hora; a baixa segue na fila, com reenvio seguro (idempotente).
  const settle = (sale: Sale) => { outbox.enqueue({ kind: 'sale.settle', label: `Baixa da venda #${sale.id} de ${sale.employee_name}`, path: `/api/sales/${sale.id}/settle`, meta: { sale_id: sale.id } }); };
  return <section className="space-y-4">
    <header className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Vendas não pagas</h2><p className="text-sm text-slate-500">{filteredSales.length} {filteredSales.length === 1 ? 'venda' : 'vendas'} · {formatBRL(filteredSales.reduce((sum,s)=>sum+s.total_cents,0))} em aberto</p></div><button onClick={()=>void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm"><RefreshCw className="h-4 w-4"/>Atualizar</button></header>
    {openSales.length > 0 && <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 shrink-0 text-slate-400"/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar cliente pelo nome" aria-label="Buscar pendências por cliente" className="w-full bg-transparent text-sm outline-none"/></label>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Carregando pendências…</p> : openSales.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Tudo certo: não há vendas pendentes.</p> : filteredSales.length===0 ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Nenhuma pendência encontrada para “{search}”.</p> : <div className="space-y-4">{grouped.map(([customerId,group])=><article key={customerId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3"><h3 className="font-semibold">{group.name}</h3><strong className="font-mono">{formatBRL(group.total)}</strong></header><div className="divide-y divide-slate-100">{group.sales.map(sale=><div key={sale.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs text-slate-500">Venda #{sale.id} · {formatDateTime(sale.created_at)}</p><p className="mt-1 text-sm">{sale.items.map(item=>`${item.quantity}× ${item.product_name}`).join(', ')}</p><p className="mt-1 font-mono text-sm font-semibold">{formatBRL(sale.total_cents)}</p></div><button onClick={()=>settle(sale)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white"><Check className="h-4 w-4"/>Marcar como paga</button></div>)}</div></article>)}</div>}
  </section>;
}

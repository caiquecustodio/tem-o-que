import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import type { PeriodReport, StoreType } from '../types';
import { api } from '../api/client';
import { formatBRL } from '../utils/format';

function currentMonthValue() { const now=new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; }
function monthRange(value: string) { const [year,month]=value.split('-').map(Number); const start=`${value}-01`; const endDay=new Date(year!,month!,0).getDate(); return {start,end:`${value}-${String(endDay).padStart(2,'0')}`}; }

export function QuickMonthlySalesView({ storeType }: { storeType: StoreType }) {
  const [month,setMonth]=useState(currentMonthValue);
  const [report,setReport]=useState<PeriodReport|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const range=useMemo(()=>monthRange(month),[month]);
  useEffect(()=>{let active=true;setLoading(true);setError('');api.getReports(range.start,range.end).then(data=>{if(active)setReport(data);}).catch(err=>{if(active)setError((err as Error).message||'Não foi possível carregar as vendas.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[range.start,range.end]);
  const sales=report?.sales.filter(sale=>sale.status==='active')??[];
  const total=sales.reduce((sum,sale)=>sum+sale.total_cents,0);
  const paid=sales.filter(sale=>sale.payment_status==='paid').reduce((sum,sale)=>sum+sale.total_cents,0);
  const pending=sales.filter(sale=>sale.payment_status==='pending').reduce((sum,sale)=>sum+sale.total_cents,0);
  const average=sales.length?Math.round(total/sales.length):0;
  const monthLabel=new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  return <section className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Vendas do mês</h2><p className="text-sm text-slate-500">Resumo rápido do que a loja vendeu.</p></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><CalendarDays className="h-4 w-4 text-slate-400"/><span className="sr-only">Escolher mês</span><input type="month" value={month} onChange={event=>setMonth(event.target.value)} className="min-h-8 border-0 bg-transparent text-sm outline-none"/></label></header>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading&&!report?<p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Carregando vendas…</p>:<>
      <p className="text-sm font-medium capitalize text-slate-600">{monthLabel}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4">
        <article className="col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6"><p className="text-sm font-medium text-emerald-900">Total vendido</p><p className="mt-2 font-mono text-3xl font-bold tabular-nums text-emerald-800 sm:text-4xl">{formatBRL(total)}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Vendas realizadas</p><p className="mt-2 font-mono text-2xl font-semibold tabular-nums">{sales.length}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Média por venda</p><p className="mt-2 font-mono text-xl font-semibold tabular-nums sm:text-2xl">{formatBRL(average)}</p></article>
        {storeType==='lite'&&<><article className="rounded-2xl border border-emerald-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Já pago</p><p className="mt-2 font-mono text-xl font-semibold tabular-nums text-emerald-700 sm:text-2xl">{formatBRL(paid)}</p></article><article className="rounded-2xl border border-amber-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">Ainda pendente</p><p className="mt-2 font-mono text-xl font-semibold tabular-nums text-amber-700 sm:text-2xl">{formatBRL(pending)}</p></article></>}
      </div>
      {!loading&&sales.length===0&&<p className="rounded-xl bg-white p-4 text-center text-sm text-slate-500">Nenhuma venda ativa neste mês.</p>}
      <button onClick={()=>{setReport(null);setLoading(true);const {start,end}=range;api.getReports(start,end).then(setReport).catch(err=>setError((err as Error).message)).finally(()=>setLoading(false));}} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600"><RefreshCw className="h-4 w-4"/>Atualizar valores</button>
    </>}
  </section>;
}

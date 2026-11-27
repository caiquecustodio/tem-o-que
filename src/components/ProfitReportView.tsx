import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ProfitReport, ProfitRow } from '../types';
import { api } from '../api/client';
import { formatBRL } from '../utils/format';

type Preset = 'month' | 'last-month' | 'week' | 'custom';

const pad = (value: number) => String(value).padStart(2, '0');
const toIso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function presetRange(preset: Exclude<Preset, 'custom'>) {
  const today = new Date();
  if (preset === 'month') return { start: toIso(new Date(today.getFullYear(), today.getMonth(), 1)), end: toIso(today) };
  if (preset === 'last-month') return { start: toIso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), end: toIso(new Date(today.getFullYear(), today.getMonth(), 0)) };
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 6);
  return { start: toIso(weekAgo), end: toIso(today) };
}
const PRESETS: Array<{ id: Exclude<Preset, 'custom'>; label: string }> = [{ id: 'month', label: 'Este mês' }, { id: 'last-month', label: 'Mês passado' }, { id: 'week', label: 'Últimos 7 dias' }];

/** Margem sobre a receita das vendas que têm custo informado. */
const marginOf = (row: Pick<ProfitRow, 'profit_cents' | 'revenue_with_cost_cents'>) => row.revenue_with_cost_cents > 0 ? `${((row.profit_cents / row.revenue_with_cost_cents) * 100).toFixed(0)}%` : '-';
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const profitTone = (cents: number) => cents < 0 ? 'text-red-700' : 'text-emerald-700';

export function ProfitReportView() {
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [useCurrentCost, setUseCurrentCost] = useState(false);
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await api.getProfitReport(range.start, range.end, useCurrentCost)); setError(''); }
    catch (e) { setError((e as Error).message || 'Não foi possível carregar o relatório.'); }
    finally { setLoading(false); }
  }, [range.start, range.end, useCurrentCost]);
  useEffect(() => { void load(); }, [load]);

  const choosePreset = (next: Exclude<Preset, 'custom'>) => { setPreset(next); setRange(presetRange(next)); };
  const withoutCost = useMemo(() => (report?.by_product ?? []).filter((row) => row.lines_without_cost > 0), [report]);
  const bestDay = useMemo(() => Math.max(1, ...(report?.by_day ?? []).map((row) => Math.abs(row.profit_cents))), [report]);
  const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div role="group" aria-label="Período" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {PRESETS.map((item) => (
              <button key={item.id} onClick={() => choosePreset(item.id)} aria-pressed={preset === item.id}
                className={`min-h-10 rounded-lg px-3 text-sm font-medium cursor-pointer ${preset === item.id ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>
            ))}
          </div>
          <label className="text-xs font-medium text-slate-600">De<input type="date" value={range.start} max={range.end} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, start: e.target.value })); }} className={inputClass} /></label>
          <label className="text-xs font-medium text-slate-600">Até<input type="date" value={range.end} min={range.start} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, end: e.target.value })); }} className={inputClass} /></label>
        </div>
        <button onClick={() => void load()} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"><RefreshCw className="mr-2 h-4 w-4" />Atualizar</button>
      </div>

      <label className="flex min-h-11 items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <input type="checkbox" checked={useCurrentCost} onChange={(e) => setUseCurrentCost(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>Usar o custo atual do produto nas vendas feitas antes de cadastrar o custo<span className="block text-xs text-slate-500">Estima o lucro do passado. O custo congelado em cada venda nova nunca muda.</span></span>
      </label>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {loading && !report ? <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Carregando…</p> : report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Faturamento', formatBRL(report.revenue_cents), 'text-slate-900', 'Todas as vendas do período'],
              ['Custo', formatBRL(report.cost_cents), 'text-slate-900', 'Só itens com custo informado'],
              ['Lucro', formatBRL(report.profit_cents), profitTone(report.profit_cents), 'Receita com custo menos o custo'],
              ['Margem', report.revenue_with_cost_cents > 0 ? `${((report.profit_cents / report.revenue_with_cost_cents) * 100).toFixed(1)}%` : '-', profitTone(report.profit_cents), 'Lucro sobre a receita com custo'],
            ].map(([label, value, tone, hint]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1.5 font-mono text-xl font-semibold tabular-nums sm:text-2xl ${tone}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>
            ))}
          </div>

          {report.revenue_without_cost_cents > 0 && (
            <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
              <strong className="font-semibold">{formatBRL(report.revenue_without_cost_cents)}</strong> em vendas estão sem custo informado e ficaram fora do lucro.
              {withoutCost.length > 0 && <span className="block text-xs mt-1">Produtos sem custo: {withoutCost.slice(0, 6).map((row) => row.product_name).join(', ')}{withoutCost.length > 6 ? ` e mais ${withoutCost.length - 6}` : ''}. Cadastre o custo no Estoque.</span>}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">{report.by_product.length} {report.by_product.length === 1 ? 'produto vendido' : 'produtos vendidos'} no período</p>
            {report.by_product.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Nenhuma venda no período.</p> : (
              <>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-2.5 font-medium">Produto</th><th className="px-3 py-2.5 text-right font-medium">Unidades</th><th className="px-3 py-2.5 text-right font-medium">Receita</th><th className="px-3 py-2.5 text-right font-medium">Custo</th><th className="px-3 py-2.5 text-right font-medium">Lucro</th><th className="px-4 py-2.5 text-right font-medium">Margem</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{report.by_product.map((row) => (
                      <tr key={`${row.product_id}-${row.product_name}`}>
                        <td className="max-w-[260px] truncate px-4 py-2.5 font-medium text-slate-900" title={row.product_name}>{row.product_name}{row.lines_without_cost > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Sem custo</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{row.units}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatBRL(row.revenue_cents)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">{row.revenue_with_cost_cents > 0 ? formatBRL(row.cost_cents) : '-'}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums ${profitTone(row.profit_cents)}`}>{row.revenue_with_cost_cents > 0 ? formatBRL(row.profit_cents) : '-'}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{marginOf(row)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="divide-y divide-slate-100 sm:hidden">{report.by_product.map((row) => (
                  <div key={`${row.product_id}-${row.product_name}`} className="space-y-1 p-4">
                    <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate font-medium text-slate-900">{row.product_name}</p>{row.lines_without_cost > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Sem custo</span>}</div>
                    <p className="text-xs text-slate-500">{row.units} un. · receita {formatBRL(row.revenue_cents)}</p>
                    <p className="text-sm">Lucro <strong className={`font-mono tabular-nums ${profitTone(row.profit_cents)}`}>{row.revenue_with_cost_cents > 0 ? formatBRL(row.profit_cents) : '-'}</strong> · margem {marginOf(row)}</p>
                  </div>
                ))}</div>
              </>
            )}
          </div>

          {report.by_day.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900">Lucro por dia</h3>
              {report.by_day.map((row) => (
                <div key={row.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-slate-500">{dayLabel(row.day!)}</span>
                  <div className="h-2.5 min-w-0 flex-1 rounded-full bg-slate-100"><div className={`h-2.5 rounded-full ${row.profit_cents < 0 ? 'bg-red-500' : 'bg-emerald-600'}`} style={{ width: `${Math.max(2, (Math.abs(row.profit_cents) / bestDay) * 100)}%` }} /></div>
                  <span className={`w-24 shrink-0 text-right font-mono tabular-nums ${profitTone(row.profit_cents)}`}>{row.revenue_with_cost_cents > 0 ? formatBRL(row.profit_cents) : '-'}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

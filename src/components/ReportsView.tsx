import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, FileCheck2, Printer, X } from 'lucide-react';
import type { PeriodReport } from '../types';
import { api } from '../api/client';
import { formatBRL, formatDate, formatDateTime } from '../utils/format';

interface ReportsViewProps {
  onOpenEmployeeAccount: (employeeId: number) => void;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ReportsView({ onOpenEmployeeAccount }: ReportsViewProps) {
  const today = new Date();
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState(() => toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [endDate, setEndDate] = useState(() => toIsoDate(today));
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'employees' | 'products' | 'sales' | 'stock' | 'closures'>('employees');

  // Closure modal
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closureLabel, setClosureLabel] = useState('');
  const [closureNotes, setClosureNotes] = useState('');
  const [savingClosure, setSavingClosure] = useState(false);
  const [closureSuccess, setClosureSuccess] = useState<string | null>(null);

  const loadReport = async (s: string, e: string) => {
    setLoading(true);
    try {
      const data = await api.getReports(s, e);
      setReport(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(startDate, endDate);
  }, [startDate, endDate]);

  const applyPreset = (p: 'today' | 'week' | 'month') => {
    setPreset(p);
    const now = new Date();
    const end = toIsoDate(now);
    if (p === 'today') {
      setStartDate(end);
      setEndDate(end);
    } else if (p === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      setStartDate(toIsoDate(start));
      setEndDate(end);
    } else {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toIsoDate(start));
      setEndDate(end);
    }
  };

  const openClosureDialog = () => {
    const label = `Fechamento ${formatDate(startDate)} a ${formatDate(endDate)}`;
    setClosureLabel(label);
    setClosureNotes('');
    setShowClosureModal(true);
  };

  const handleSaveClosure = async () => {
    if (!closureLabel.trim()) return;
    setSavingClosure(true);
    try {
      await api.createClosure({
        period_label: closureLabel.trim(),
        start_date: startDate,
        end_date: endDate,
        notes: closureNotes.trim(),
      });
      setShowClosureModal(false);
      setClosureSuccess('Fechamento financeiro do período registrado com sucesso.');
      setActiveTab('closures');
      await loadReport(startDate, endDate);
    } finally {
      setSavingClosure(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Period Selector & Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 no-print">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            {[
              { key: 'today', label: 'Hoje' },
              { key: 'week', label: 'Esta semana' },
              { key: 'month', label: 'Este mês' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => applyPreset(item.key as 'today' | 'week' | 'month')}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  preset === item.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset('custom');
                setStartDate(e.target.value);
              }}
              className="flex-1 sm:flex-none px-2.5 py-2 border border-slate-200 rounded-xl font-mono text-xs"
            />
            <span className="text-slate-400">até</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset('custom');
                setEndDate(e.target.value);
              }}
              className="flex-1 sm:flex-none px-2.5 py-2 border border-slate-200 rounded-xl font-mono text-xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[40px]"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
          <button
            onClick={openClosureDialog}
            className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[40px]"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            Gerar fechamento do período
          </button>
        </div>
      </div>

      {closureSuccess && (
        <div className="px-4 py-3 rounded-2xl border bg-emerald-50 border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{closureSuccess}</span>
          </div>
          <button onClick={() => setClosureSuccess(null)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && !report ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
          Gerando relatório do período...
        </div>
      ) : report ? (
        <>
          {/* Period Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">Vendas no período</p>
              <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {formatBRL(report.total_sales_cents)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {report.active_sales_count} venda(s) ativa(s)
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">Recebido no período</p>
              <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
                {formatBRL(report.total_received_cents)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {report.payments_count} pagamento(s)
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">Pendente geral atual</p>
              <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-amber-700 font-mono tabular-nums">
                {formatBRL(report.overall_pending_cents)}
              </p>
              <p className="mt-1 text-xs text-slate-500">A receber de clientes</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-medium text-slate-500">Canceladas / corrigidas</p>
              <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900 font-mono tabular-nums">
                {report.cancelled_sales_count}
              </p>
              <p className="mt-1 text-xs text-slate-500">No intervalo selecionado</p>
            </div>
          </div>

          {/* Sub-navigation Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl overflow-x-auto max-w-full no-print">
            {[
              { key: 'employees', label: 'Consumo por cliente' },
              { key: 'products', label: 'Mais vendidos' },
              { key: 'sales', label: `Vendas e pagamentos (${report.sales.length + report.payments.length})` },
              { key: 'stock', label: `Estoque (${report.stock_movements.length})` },
              { key: 'closures', label: `Fechamentos (${report.closures.length})` },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as typeof activeTab)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                  activeTab === t.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content: Clients Consumption */}
          {activeTab === 'employees' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">
                  Consumo individual e saldo devedor ({formatDate(startDate)} – {formatDate(endDate)})
                </h3>
              </div>

              {/* Mobile Client Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {report.employee_consumption.map((row) => (
                  <div key={row.employee_id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{row.employee_name}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {row.purchases_count} retirada(s) no período
                        </p>
                      </div>
                      <button
                        onClick={() => onOpenEmployeeAccount(row.employee_id)}
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl cursor-pointer whitespace-nowrap"
                      >
                        Ver extrato
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                      <div className="bg-slate-50 rounded-xl p-2">
                        <p className="text-[11px] text-slate-500">Consumido</p>
                        <p className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                          {formatBRL(row.period_consumed_cents)}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2">
                        <p className="text-[11px] text-slate-500">Pago</p>
                        <p className="font-mono tabular-nums font-semibold text-emerald-700 mt-0.5">
                          {formatBRL(row.period_paid_cents)}
                        </p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-2">
                        <p className="text-[11px] text-slate-500">Devedor atual</p>
                        <p
                          className={`font-mono tabular-nums font-semibold mt-0.5 ${
                            row.current_balance_cents > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatBRL(row.current_balance_cents)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4 text-right">Retiradas</th>
                      <th className="py-3 px-4 text-right">Consumido no período</th>
                      <th className="py-3 px-4 text-right">Pago no período</th>
                      <th className="py-3 px-4 text-right">Saldo devedor atual</th>
                      <th className="py-3 px-4 text-right no-print">Extrato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {report.employee_consumption.map((row) => (
                      <tr key={row.employee_id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">{row.employee_name}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          {row.purchases_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                          {formatBRL(row.period_consumed_cents)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                          {formatBRL(row.period_paid_cents)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            row.current_balance_cents > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatBRL(row.current_balance_cents)}
                        </td>
                        <td className="py-3 px-4 text-right no-print">
                          <button
                            onClick={() => onOpenEmployeeAccount(row.employee_id)}
                            className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Ver extrato
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab Content: Top Products */}
          {activeTab === 'products' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">Ranking de produtos mais vendidos no período</h3>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {report.top_products.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">Nenhuma venda no período selecionado.</p>
                ) : (
                  report.top_products.map((p, idx) => (
                    <div key={p.product_id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2.5 min-w-0">
                        <span className="text-xs font-mono tabular-nums text-slate-400">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{p.product_name}</p>
                          <p className="text-xs text-slate-500">{p.category}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold font-mono tabular-nums text-slate-900">
                          {formatBRL(p.revenue_cents)}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-slate-500">{p.units_sold} un.</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Produto</th>
                      <th className="py-3 px-4">Categoria</th>
                      <th className="py-3 px-4 text-right">Unidades vendidas</th>
                      <th className="py-3 px-4 text-right">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {report.top_products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-500">
                          Nenhuma venda no período selecionado.
                        </td>
                      </tr>
                    ) : (
                      report.top_products.map((p, idx) => (
                        <tr key={p.product_id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-400">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{p.product_name}</td>
                          <td className="py-3 px-4 text-xs text-slate-500">{p.category}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {p.units_sold} un.
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {formatBRL(p.revenue_cents)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab Content: Sales & Payments */}
          {activeTab === 'sales' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Vendas no período ({report.sales.length})</h3>
                </div>
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {report.sales.length === 0 ? (
                    <p className="p-8 text-center text-xs text-slate-500">Sem vendas no período.</p>
                  ) : (
                    report.sales.map((s) => (
                      <div key={s.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            #{s.id} · {s.employee_name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {s.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-400">{formatDateTime(s.created_at)}</p>
                        </div>
                        <span
                          className={`text-sm font-mono tabular-nums font-semibold shrink-0 ${
                            s.status === 'active' ? 'text-slate-900' : 'text-slate-400 line-through'
                          }`}
                        >
                          {formatBRL(s.total_cents)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Pagamentos recebidos ({report.payments.length})</h3>
                </div>
                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {report.payments.length === 0 ? (
                    <p className="p-8 text-center text-xs text-slate-500">Sem pagamentos no período.</p>
                  ) : (
                    report.payments.map((p) => (
                      <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{p.employee_name}</p>
                          <p className="text-xs text-slate-500">
                            {p.method} · <span className="font-mono tabular-nums">{formatDateTime(p.created_at)}</span>
                          </p>
                        </div>
                        <span className="text-sm font-mono tabular-nums font-semibold text-emerald-700 shrink-0">
                          + {formatBRL(p.amount_cents)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab Content: Stock Movements */}
          {activeTab === 'stock' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {/* Mobile Movement Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {report.stock_movements.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">Sem movimentações de estoque no período.</p>
                ) : (
                  report.stock_movements.map((m) => (
                    <div key={m.id} className="p-4 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{m.product_name}</p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-400">
                            {formatDateTime(m.created_at)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-semibold font-mono tabular-nums ${
                              m.quantity_delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {m.quantity_delta >= 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500">Final: {m.stock_after} un.</p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600">{m.reason}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Data / Hora</th>
                      <th className="py-3 px-4">Produto</th>
                      <th className="py-3 px-4 text-right">Variação</th>
                      <th className="py-3 px-4 text-right">Saldo final</th>
                      <th className="py-3 px-4">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {report.stock_movements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          Sem movimentações de estoque no período.
                        </td>
                      </tr>
                    ) : (
                      report.stock_movements.map((m) => (
                        <tr key={m.id}>
                          <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                            {formatDateTime(m.created_at)}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{m.product_name}</td>
                          <td
                            className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                              m.quantity_delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {m.quantity_delta >= 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                            {m.stock_after} un.
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">{m.reason}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab Content: Closures */}
          {activeTab === 'closures' && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Fechamentos financeiros registrados</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {report.closures.length === 0 ? (
                  <p className="p-10 text-center text-sm text-slate-500">
                    Nenhum fechamento semanal ou mensal salvo ainda. Use o botão "Gerar fechamento do período".
                  </p>
                ) : (
                  report.closures.map((c) => (
                    <div key={c.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.period_label}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          Período: {formatDate(c.start_date)} até {formatDate(c.end_date)} · Gerado em {formatDateTime(c.created_at)}
                        </p>
                        {c.notes && <p className="text-xs text-slate-600 mt-1">{c.notes}</p>}
                      </div>
                      <div className="grid grid-cols-3 sm:flex items-center gap-3 sm:gap-6 shrink-0 font-mono tabular-nums sm:text-right">
                        <div className="bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl">
                          <p className="text-[11px] font-sans text-slate-500">Vendas</p>
                          <p className="text-sm font-semibold text-slate-900">{formatBRL(c.total_sales_cents)}</p>
                        </div>
                        <div className="bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl">
                          <p className="text-[11px] font-sans text-slate-500">Recebido</p>
                          <p className="text-sm font-semibold text-emerald-700">{formatBRL(c.total_received_cents)}</p>
                        </div>
                        <div className="bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl">
                          <p className="text-[11px] font-sans text-slate-500">Pendente</p>
                          <p className="text-sm font-semibold text-amber-700">{formatBRL(c.total_pending_cents)}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Closure Modal */}
      {showClosureModal && report && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Gerar fechamento financeiro</h3>
              <button onClick={() => setShowClosureModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Vendas no período:</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">{formatBRL(report.total_sales_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recebido no período:</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">{formatBRL(report.total_received_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pendente de recebimento atual:</span>
                <span className="font-mono tabular-nums font-semibold text-amber-700">{formatBRL(report.overall_pending_cents)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Identificação do fechamento</label>
                <input
                  type="text"
                  value={closureLabel}
                  onChange={(e) => setClosureLabel(e.target.value)}
                  placeholder="Ex.: Fechamento Semana 03 / Novembro"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observações (opcional)</label>
                <input
                  type="text"
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  placeholder="Ex.: Cobranças enviadas para pagamento via Pix"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClosureModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveClosure}
                disabled={savingClosure}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer"
              >
                {savingClosure ? 'Salvando...' : 'Salvar fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

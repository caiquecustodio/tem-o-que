import { AlertTriangle, ArrowUpRight, CreditCard, PackagePlus, Plus, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import type { DashboardSummary, Employee } from '../types';
import { formatBRL, formatDateTime, saleRef } from '../utils/format';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  employees: Employee[];
  loading: boolean;
  onNavigate: (tab: 'pos' | 'accounts' | 'inventory' | 'reports', employeeId?: number) => void;
  onRestockShortcut: (productId: number) => void;
  onQuickPay: (employeeId: number) => void;
}

export function DashboardView({
  summary,
  employees,
  loading,
  onNavigate,
  onRestockShortcut,
  onQuickPay,
}: DashboardViewProps) {
  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const debtors = employees
    .filter((e) => e.balance_cents > 0)
    .sort((a, b) => b.balance_cents - a.balance_cents)
    .slice(0, 6);

  const maxUnits = Math.max(1, ...summary.top_products.map((p) => p.units_sold));

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Quick Action Bar (prominent on mobile/tablet and clean on desktop) */}
      <section aria-label="Ações rápidas" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigate('pos')}
          className="col-span-2 sm:col-span-1 px-4 py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white flex items-center justify-center sm:justify-start gap-2.5 text-sm font-semibold transition-all cursor-pointer shadow-xs"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Nova venda fiada</span>
        </button>
        <button
          onClick={() => onNavigate('accounts')}
          className="px-4 py-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 active:scale-[0.98] text-slate-800 flex items-center justify-center sm:justify-start gap-2.5 text-sm font-medium transition-all cursor-pointer"
        >
          <CreditCard className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="truncate">Receber pagamento</span>
        </button>
        <button
          onClick={() => onNavigate('inventory')}
          className="px-4 py-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 active:scale-[0.98] text-slate-800 flex items-center justify-center sm:justify-start gap-2.5 text-sm font-medium transition-all cursor-pointer"
        >
          <PackagePlus className="w-4 h-4 text-slate-700 shrink-0" />
          <span className="truncate">Repor estoque</span>
        </button>
        <button
          onClick={() => onNavigate('reports')}
          className="hidden sm:flex px-4 py-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 active:scale-[0.98] text-slate-800 items-center gap-2.5 text-sm font-medium transition-all cursor-pointer"
        >
          <TrendingUp className="w-4 h-4 text-slate-700 shrink-0" />
          <span className="truncate">Fechamento</span>
        </button>
      </section>

      {/* KPI Strip */}
      <section aria-label="Indicadores Financeiros">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
          <div className="col-span-2 sm:col-span-1 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">Pendente de recebimento</p>
            <p className="mt-1.5 text-2xl font-semibold text-amber-700 font-mono tabular-nums">
              {formatBRL(summary.total_pending_cents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Saldo em aberto geral</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">Total recebido</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
              {formatBRL(summary.total_received_cents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Pagamentos recebidos</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">Clientes com débito</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {summary.debtors_count}
            </p>
            <p className="mt-1 text-xs text-slate-500">De {employees.length} cadastrados</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">Faturamento total</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {formatBRL(summary.total_revenue_cents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Vendas ativas</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">Vendas fiadas</p>
            <p className="mt-1.5 text-xl sm:text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {formatBRL(summary.total_credit_sales_cents)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Em conta interna</p>
          </div>
        </div>
      </section>

      {/* Main 2-column operational panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Right-priority on mobile via order: Debtors first on mobile? Keep logical flow with Debtors + Low Stock */}
        <div className="lg:col-span-5 lg:order-2 space-y-6">
          {/* Open Client Tabs */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-700 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">Saldos em aberto</h2>
              </div>
              <button
                onClick={() => onNavigate('accounts')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Ver todas
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {debtors.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500 text-center">
                Nenhum cliente possui saldo devedor no momento.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {debtors.map((emp) => (
                  <div
                    key={emp.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <button
                      onClick={() => onNavigate('accounts', emp.id)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-slate-900 truncate">{emp.name}</p>
                      <p className="text-xs text-slate-500 truncate font-mono tabular-nums">
                        {emp.phone || `Cód. ${emp.code}`}
                      </p>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-semibold text-amber-700 font-mono tabular-nums">
                        {formatBRL(emp.balance_cents)}
                      </p>
                      <button
                        onClick={() => onQuickPay(emp.id)}
                        className="px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap min-h-[36px]"
                      >
                        Receber
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Sales */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-slate-700 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">Últimas retiradas</h2>
              </div>
              <button
                onClick={() => onNavigate('pos')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Nova venda
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {summary.recent_sales.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500 text-center">Nenhuma venda registrada.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.recent_sales.map((sale) => (
                  <div key={sale.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{sale.employee_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {saleRef(sale.id)}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        {sale.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        {formatDateTime(sale.created_at)}
                        {sale.status !== 'active' && (
                          <span className="ml-2 text-red-600 font-sans font-medium">
                            ({sale.status === 'cancelled' ? 'Cancelada' : 'Corrigida'})
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${
                        sale.status === 'active' ? 'text-slate-900' : 'text-slate-400 line-through'
                      }`}
                    >
                      {formatBRL(sale.total_cents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Payments */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-emerald-700 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">Últimos pagamentos</h2>
              </div>
            </div>

            {summary.recent_payments.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500 text-center">Nenhum pagamento registrado.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.recent_payments.map((pay) => (
                  <div key={pay.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{pay.employee_name}</p>
                      <p className="text-xs text-slate-500">
                        {pay.method}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatDateTime(pay.created_at)}</span>
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700 font-mono tabular-nums shrink-0">
                      + {formatBRL(pay.amount_cents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Left: Low Stock & Top Selling Products */}
        <div className="lg:col-span-7 lg:order-1 space-y-6">
          {/* Low stock alerts */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">Produtos com estoque baixo</h2>
              </div>
              <button
                onClick={() => onNavigate('inventory')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Gerenciar estoque
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {summary.low_stock_products.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500 text-center">
                Todos os produtos estão acima do estoque mínimo configurado.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.low_stock_products.map((prod) => (
                  <div key={prod.id} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{prod.name}</p>
                      <p className="text-xs text-slate-500">
                        {prod.category}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        Mínimo: <span className="font-mono tabular-nums">{prod.min_stock}</span> un.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span
                          className={`text-sm font-semibold font-mono tabular-nums ${
                            prod.stock === 0 ? 'text-red-600' : 'text-amber-700'
                          }`}
                        >
                          {prod.stock} un.
                        </span>
                        <p className="text-[11px] text-slate-500">{prod.stock === 0 ? 'Esgotado' : 'Baixo'}</p>
                      </div>
                      <button
                        onClick={() => onRestockShortcut(prod.id)}
                        className="px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors min-h-[36px]"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        Repor
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Top Products */}
          <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-emerald-700 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900">Produtos mais vendidos</h2>
              </div>
              <button
                onClick={() => onNavigate('reports')}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Ver relatório
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {summary.top_products.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500 text-center">
                Nenhuma venda registrada ainda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {summary.top_products.map((item, idx) => {
                  const pct = Math.round((item.units_sold / maxUnits) * 100);
                  return (
                    <div key={item.product_id} className="px-5 py-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex items-baseline gap-2.5">
                          <span className="text-xs font-mono tabular-nums text-slate-400">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-sm font-medium text-slate-900 truncate">{item.product_name}</span>
                          <span className="hidden sm:inline text-xs text-slate-500 shrink-0">{item.category}</span>
                        </div>
                        <div className="text-right shrink-0 flex items-baseline gap-3">
                          <span className="text-xs text-slate-600 font-mono tabular-nums">{item.units_sold} un.</span>
                          <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums w-20 text-right">
                            {formatBRL(item.revenue_cents)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

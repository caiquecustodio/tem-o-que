import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CreditCard, Printer, QrCode, Search, UserPlus, X } from 'lucide-react';
import type { Employee, EmployeeStatement, LoyaltyProgress, LoyaltySettings, StoreSettings } from '../types';
import { api } from '../api/client';
import { formatBRL, formatDateTime, parseBRLToCents } from '../utils/format';
import { PixBillingModal } from './PixBillingModal';
import { LoyaltyCardPanel } from './LoyaltyCardPanel';

interface AccountsViewProps {
  employees: Employee[];
  settings: StoreSettings;
  loyaltySettings: LoyaltySettings | null;
  initialEmployeeId?: number | null;
  quickPayEmployeeId?: number | null;
  onClearQuickPay?: () => void;
  onOpenSettings: () => void;
  onDataChanged: () => Promise<void>;
}

export function AccountsView({
  employees,
  settings,
  loyaltySettings,
  initialEmployeeId,
  quickPayEmployeeId,
  onClearQuickPay,
  onOpenSettings,
  onDataChanged,
}: AccountsViewProps) {
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'debtors' | 'settled'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(() => initialEmployeeId ?? employees[0]?.id ?? null);
  const [mobileShowDetail, setMobileShowDetail] = useState(Boolean(initialEmployeeId || quickPayEmployeeId));
  const [statement, setStatement] = useState<EmployeeStatement | null>(null);
  const [loyaltyProgress, setLoyaltyProgress] = useState<LoyaltyProgress | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payMethod, setPayMethod] = useState('Pix');
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [showPixBillingModal, setShowPixBillingModal] = useState(false);

  // New Client modal
  const [showNewEmpModal, setShowNewEmpModal] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empError, setEmpError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEmployeeId) {
      setSelectedId(initialEmployeeId);
      setMobileShowDetail(true);
    }
  }, [initialEmployeeId]);

  useEffect(() => {
    if (!selectedId && employees.length > 0) {
      setSelectedId(employees[0].id);
    }
  }, [employees, selectedId]);

  const loadStatement = async (id: number) => {
    setLoadingStatement(true);
    try {
      const data = await api.getEmployeeStatement(id);
      setStatement(data);
    } catch {
      setStatement(null);
    } finally {
      setLoadingStatement(false);
    }
  };

  useEffect(() => {
    if (selectedId) {
      loadStatement(selectedId);
    }
  }, [selectedId, employees]);

  useEffect(() => {
    if (!selectedId || !loyaltySettings?.enabled) {
      setLoyaltyProgress(null);
      return;
    }
    let active = true;
    api.getLoyaltyProgress(selectedId).then((progress) => { if (active) setLoyaltyProgress(progress); }).catch(() => { if (active) setLoyaltyProgress(null); });
    return () => { active = false; };
  }, [selectedId, employees, loyaltySettings]);

  // Handle quick-pay shortcut triggered from Dashboard
  useEffect(() => {
    if (quickPayEmployeeId) {
      setSelectedId(quickPayEmployeeId);
      setMobileShowDetail(true);
      const target = employees.find((e) => e.id === quickPayEmployeeId);
      if (target) {
        const defaultAmt = Math.max(0, target.balance_cents);
        setPayAmountStr((defaultAmt / 100).toFixed(2).replace('.', ','));
        setPayMethod('Pix');
        setPayNotes('');
        setPayError(null);
        setShowPayModal(true);
      }
      onClearQuickPay?.();
    }
  }, [quickPayEmployeeId, employees, onClearQuickPay]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (balanceFilter === 'debtors' && e.balance_cents <= 0) return false;
      if (balanceFilter === 'settled' && e.balance_cents > 0) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.phone.toLowerCase().includes(q) && !e.code.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [employees, search, balanceFilter]);

  const openPaymentModal = () => {
    if (!statement) return;
    const defaultAmt = Math.max(0, statement.employee.balance_cents);
    setPayAmountStr((defaultAmt / 100).toFixed(2).replace('.', ','));
    setPayMethod('Pix');
    setPayNotes('');
    setPayError(null);
    setShowPayModal(true);
  };

  const handleRegisterPayment = async () => {
    if (!statement) return;
    const cents = parseBRLToCents(payAmountStr);
    if (cents <= 0) {
      setPayError('Informe um valor maior que zero.');
      return;
    }
    setSubmitting(true);
    setPayError(null);
    try {
      await api.createPayment({
        employee_id: statement.employee.id,
        amount_cents: cents,
        method: payMethod,
        received_by: 'Administrador',
        notes: payNotes.trim(),
      });
      setShowPayModal(false);
      await onDataChanged();
      await loadStatement(statement.employee.id);
    } catch (err) {
      setPayError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateEmployee = async () => {
    if (!empName.trim()) {
      setEmpError('Informe o nome completo do cliente.');
      return;
    }
    if (!empPhone.trim()) {
      setEmpError('Informe o WhatsApp do cliente.');
      return;
    }
    setSubmitting(true);
    setEmpError(null);
    try {
      const created = await api.createEmployee({
        name: empName.trim(),
        department: '',
        phone: empPhone.trim(),
        email: '',
      });
      setShowNewEmpModal(false);
      setEmpName('');
      setEmpPhone('');
      await onDataChanged();
      setSelectedId(created.id);
      setMobileShowDetail(true);
    } catch (err) {
      setEmpError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Client List (hidden on mobile when viewing detail) */}
      <div
        className={`lg:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden no-print ${
          mobileShowDetail ? 'hidden lg:block' : 'block'
        }`}
      >
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">Clientes ({employees.length})</h2>
            <button
              onClick={() => {
                setEmpError(null);
                setShowNewEmpModal(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[38px]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Cadastrar
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome ou WhatsApp..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
            {[
              { key: 'all', label: 'Todos' },
              { key: 'debtors', label: 'Com débito' },
              { key: 'settled', label: 'Em dia' },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => setBalanceFilter(opt.key as typeof balanceFilter)}
                className={`py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  balanceFilter === opt.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
          {filteredEmployees.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">Nenhum cliente encontrado.</p>
          ) : (
            filteredEmployees.map((emp) => {
              const isSelected = emp.id === selectedId;
              return (
                <button
                  key={emp.id}
                  onClick={() => {
                    setSelectedId(emp.id);
                    setMobileShowDetail(true);
                  }}
                  className={`w-full px-4 py-4 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer min-h-[64px] ${
                    isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-900' : 'text-slate-900'}`}>
                      {emp.name}
                    </p>
                    <p className="text-xs text-slate-500 truncate font-mono tabular-nums mt-0.5">
                      {emp.phone || emp.code}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-semibold font-mono tabular-nums ${
                        emp.balance_cents > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatBRL(emp.balance_cents)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {emp.balance_cents > 0 ? 'Saldo devedor' : 'Quitado'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Individual Account & Full Financial Statement */}
      <div className={`lg:col-span-8 space-y-4 ${mobileShowDetail ? 'block' : 'hidden lg:block'}`}>
        {/* Mobile Back to Clients Button */}
        <button
          onClick={() => setMobileShowDetail(false)}
          className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer no-print"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para clientes
        </button>

        {loadingStatement && !statement ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
            Carregando extrato individual...
          </div>
        ) : !statement ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
            Selecione um cliente para visualizar a conta individual e o extrato completo.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">Conta individual · Cód. {statement.employee.code}</p>
                <h2 className="text-xl font-semibold text-slate-900 mt-0.5">{statement.employee.name}</h2>
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  WhatsApp: {statement.employee.phone || 'Não informado'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 no-print">
                <button
                  onClick={openPaymentModal}
                  className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[40px]"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Registrar pagamento
                </button>
                <button
                  onClick={() => setShowPixBillingModal(true)}
                  className="px-3.5 py-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[40px]"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Cobrar Pix / QR
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[40px]"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimir
                </button>
              </div>
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/50">
              <div className="p-3.5 sm:p-5">
                <p className="text-[11px] sm:text-xs text-slate-500">Consumido</p>
                <p className="mt-1 text-base sm:text-xl font-semibold text-slate-900 font-mono tabular-nums">
                  {formatBRL(statement.employee.total_consumed_cents)}
                </p>
              </div>
              <div className="p-3.5 sm:p-5">
                <p className="text-[11px] sm:text-xs text-slate-500">Pago</p>
                <p className="mt-1 text-base sm:text-xl font-semibold text-emerald-700 font-mono tabular-nums">
                  {formatBRL(statement.employee.total_paid_cents)}
                </p>
              </div>
              <div className="p-3.5 sm:p-5">
                <p className="text-[11px] sm:text-xs text-slate-500">Saldo atual</p>
                <p
                  className={`mt-1 text-base sm:text-xl font-semibold font-mono tabular-nums ${
                    statement.employee.balance_cents > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {formatBRL(statement.employee.balance_cents)}
                </p>
              </div>
            </div>

            {loyaltySettings?.enabled && loyaltyProgress && (
              <LoyaltyCardPanel
                config={loyaltySettings}
                progress={loyaltyProgress}
                customerName={statement.employee.name}
                storeName={settings.store_name}
                logoDataUrl={settings.logo_data_url}
              />
            )}

            {/* Chronological Ledger */}
            <div className="p-4 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Extrato completo da movimentação financeira</h3>

              {statement.ledger.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Nenhuma compra ou pagamento registrado nesta conta ainda.
                </p>
              ) : (
                <>
                  {/* Mobile Transaction Cards */}
                  <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {statement.ledger.map((entry) => {
                      const isPayment = entry.kind === 'payment';
                      const isVoid = entry.kind === 'sale' && entry.status !== 'active';
                      return (
                        <div key={entry.uid} className="p-4 space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p
                                className={`text-sm font-semibold ${
                                  isPayment ? 'text-emerald-700' : isVoid ? 'text-slate-400 line-through' : 'text-slate-900'
                                }`}
                              >
                                {entry.title}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-slate-400">
                                {formatDateTime(entry.created_at)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p
                                className={`text-sm font-semibold font-mono tabular-nums ${
                                  isPayment ? 'text-emerald-700' : isVoid ? 'text-slate-400 line-through' : 'text-slate-900'
                                }`}
                              >
                                {isPayment ? `- ${formatBRL(entry.amount_cents)}` : `+ ${formatBRL(entry.amount_cents)}`}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-slate-500">
                                Saldo: {formatBRL(entry.running_balance_cents)}
                              </p>
                            </div>
                          </div>
                          {entry.sale && (
                            <p className="text-xs text-slate-600">
                              {entry.sale.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                            </p>
                          )}
                          {entry.payment?.notes && <p className="text-xs text-slate-500">{entry.payment.notes}</p>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">Data / Hora</th>
                          <th className="py-3 px-4">Movimentação / Detalhes</th>
                          <th className="py-3 px-4 text-right">Valor</th>
                          <th className="py-3 px-4 text-right">Saldo após</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {statement.ledger.map((entry) => {
                          const isPayment = entry.kind === 'payment';
                          const isVoid = entry.kind === 'sale' && entry.status !== 'active';
                          return (
                            <tr key={entry.uid} className="hover:bg-slate-50/70 align-top">
                              <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                                {formatDateTime(entry.created_at)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-medium ${
                                      isPayment ? 'text-emerald-700' : isVoid ? 'text-slate-400 line-through' : 'text-slate-900'
                                    }`}
                                  >
                                    {entry.title}
                                  </span>
                                  {isVoid && (
                                    <span className="text-xs text-red-600 font-medium">
                                      ({entry.status === 'cancelled' ? 'Cancelada' : 'Corrigida'})
                                    </span>
                                  )}
                                </div>

                                {entry.sale && (
                                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                                    {entry.sale.items.map((it) => (
                                      <li key={it.id} className="font-mono tabular-nums">
                                        {it.quantity}× {it.product_name} ({formatBRL(it.unit_price_cents)} cada) —{' '}
                                        {formatBRL(it.subtotal_cents)}
                                      </li>
                                    ))}
                                    {entry.sale.notes && <li className="font-sans text-slate-400">Obs.: {entry.sale.notes}</li>}
                                    {entry.sale.cancel_reason && (
                                      <li className="font-sans text-red-600">Motivo: {entry.sale.cancel_reason}</li>
                                    )}
                                  </ul>
                                )}

                                {entry.payment && (
                                  <p className="mt-1 text-xs text-slate-500">
                                    Recebido por {entry.payment.received_by}
                                    {entry.payment.notes ? ` · ${entry.payment.notes}` : ''}
                                  </p>
                                )}
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                                  isPayment
                                    ? 'text-emerald-700'
                                    : isVoid
                                    ? 'text-slate-400 line-through'
                                    : 'text-slate-900'
                                }`}
                              >
                                {isPayment ? `- ${formatBRL(entry.amount_cents)}` : `+ ${formatBRL(entry.amount_cents)}`}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                                {formatBRL(entry.running_balance_cents)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Register Payment Modal */}
      {showPayModal && statement && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Registrar pagamento</h3>
              <button onClick={() => setShowPayModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="text-sm font-semibold text-slate-900">{statement.employee.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Saldo atual</p>
                <p className="text-sm font-semibold text-amber-700 font-mono tabular-nums">
                  {formatBRL(statement.employee.balance_cents)}
                </p>
              </div>
            </div>

            {payError && <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{payError}</div>}

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Valor recebido (R$)</label>
                  {statement.employee.balance_cents > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setPayAmountStr((statement.employee.balance_cents / 2 / 100).toFixed(2).replace('.', ','))
                        }
                        className="text-emerald-700 font-medium hover:underline cursor-pointer"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPayAmountStr((statement.employee.balance_cents / 100).toFixed(2).replace('.', ','))
                        }
                        className="text-emerald-700 font-medium hover:underline cursor-pointer"
                      >
                        Quitar total
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={payAmountStr}
                  onChange={(e) => setPayAmountStr(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Forma de pagamento</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                >
                  <option value="Pix">Pix</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Desconto em Folha">Desconto em Folha</option>
                  <option value="Transferência">Transferência</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observação</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Ex.: Acerto semanal via Pix"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowPayModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegisterPayment}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer"
              >
                {submitting ? 'Registrando...' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {showNewEmpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Cadastrar cliente</h3>
              <button onClick={() => setShowNewEmpModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {empError && <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{empError}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome completo</label>
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Ex.: Fernanda Lima"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewEmpModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateEmployee}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                {submitting ? 'Salvando...' : 'Cadastrar conta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pix QR Code Billing Modal */}
      {showPixBillingModal && statement && (
        <PixBillingModal
          statement={statement}
          settings={settings}
          onClose={() => setShowPixBillingModal(false)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}

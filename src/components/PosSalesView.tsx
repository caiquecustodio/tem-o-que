import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronRight,
  Edit3,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type { Employee, LoyaltyProgress, LoyaltySettings, Product, Sale, StoreSettings, StoreType } from '../types';
import { api } from '../api/client';
import { CATEGORY_OPTIONS, formatBRL, formatDateTime } from '../utils/format';
import { ProductImage } from './ProductImage';
import { LoyaltyCardPanel } from './LoyaltyCardPanel';

interface PosSalesViewProps {
  products: Product[];
  employees: Employee[];
  sales: Sale[];
  loyaltySettings: LoyaltySettings | null;
  storeSettings: StoreSettings;
  storeType: StoreType;
  onDataChanged: () => Promise<void>;
}

interface CartItem {
  product: Product;
  quantity: number;
}

export function PosSalesView({ products, employees, sales, loyaltySettings, storeSettings, storeType, onDataChanged }: PosSalesViewProps) {
  const [subTab, setSubTab] = useState<'register' | 'history'>('register');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number>(() => employees[0]?.id ?? 0);
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loyaltyAfterSale, setLoyaltyAfterSale] = useState<LoyaltyProgress | null>(null);
  const [mobileBagOpen, setMobileBagOpen] = useState(false);

  // Quick New Client modal right inside POS
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientError, setNewClientError] = useState<string | null>(null);

  // Cancel / Correct modal state
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [correctTarget, setCorrectTarget] = useState<Sale | null>(null);
  const [correctEmployeeId, setCorrectEmployeeId] = useState<number>(0);
  const [correctItems, setCorrectItems] = useState<Array<{ product_id: number; quantity: number }>>([]);
  const [correctReason, setCorrectReason] = useState('');
  const [correctNotes, setCorrectNotes] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'active' | 'cancelled'>('all');
  const [historySearch, setHistorySearch] = useState('');

  const activeEmployees = useMemo(() => employees.filter((e) => e.active === 1), [employees]);
  const selectedEmployee = useMemo(
    () => activeEmployees.find((e) => e.id === selectedEmployeeId) ?? activeEmployees[0] ?? null,
    [activeEmployees, selectedEmployeeId]
  );

  useEffect(() => { setLoyaltyAfterSale(null); }, [selectedEmployeeId]);

  const availableProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.available) return false;
      if (selectedCategory !== 'Todos' && p.category !== selectedCategory) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, selectedCategory, search]);

  const cartList = Object.values(cart);
  const cartTotalUnits = cartList.reduce((acc, c) => acc + c.quantity, 0);
  const cartTotalCents = cartList.reduce((acc, c) => acc + c.product.price_cents * c.quantity, 0);

  const updateCartQty = (product: Product, delta: number) => {
    setFeedback(null);
    setCart((prev) => {
      const current = prev[product.id]?.quantity ?? 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[product.id];
        if (Object.keys(copy).length === 0) setMobileBagOpen(false);
        return copy;
      }
      if (next > product.stock) {
        setFeedback({ type: 'error', message: `Estoque máximo disponível para ${product.name}: ${product.stock} un.` });
        return prev;
      }
      return { ...prev, [product.id]: { product, quantity: next } };
    });
  };

  const handleCreateQuickClient = async () => {
    if (!newClientName.trim()) {
      setNewClientError('Informe o nome completo do cliente.');
      return;
    }
    if (storeType !== 'lite' && !newClientPhone.trim()) {
      setNewClientError('Informe o WhatsApp do cliente.');
      return;
    }
    setSubmitting(true);
    setNewClientError(null);
    try {
      const created = storeType === 'lite' ? await api.createCustomer(newClientName.trim()) : await api.createEmployee({ name: newClientName.trim(), department: '', phone: newClientPhone.trim(), email: '' });
      await onDataChanged();
      setSelectedEmployeeId(created.id);
      setShowNewClientModal(false);
      setNewClientName('');
      setNewClientPhone('');
    } catch (err) {
      setNewClientError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeSale = async () => {
    if (!selectedEmployee) {
      setFeedback({ type: 'error', message: 'Selecione um cliente para vincular a venda.' });
      return;
    }
    if (cartList.length === 0) {
      setFeedback({ type: 'error', message: 'Adicione pelo menos um produto à sacola.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    setLoyaltyAfterSale(null);
    try {
      const created = await api.createSale({
        employee_id: selectedEmployee.id,
        items: cartList.map((c) => ({ product_id: c.product.id, quantity: c.quantity })),
        notes,
        created_by: 'Administrador',
        ...(storeType === 'lite' ? { payment_status: paymentStatus } : {}),
      });
      setCart({});
      setNotes('');
      setMobileBagOpen(false);
      await onDataChanged();
      if (loyaltySettings?.enabled) {
        try { setLoyaltyAfterSale(await api.getLoyaltyProgress(selectedEmployee.id)); } catch { setLoyaltyAfterSale(null); }
      }
      setFeedback({
        type: 'success',
        message: `Venda #${created.id} registrada para ${created.employee_name} (${formatBRL(created.total_cents)})${storeType === 'lite' ? paymentStatus === 'paid' ? ' · paga' : ' · pendente' : ''}.`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) {
      setFeedback({ type: 'error', message: 'Informe o motivo do cancelamento.' });
      return;
    }
    setSubmitting(true);
    try {
      await api.cancelSale(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason('');
      setLoyaltyAfterSale(null);
      await onDataChanged();
      setFeedback({ type: 'success', message: `Venda #${cancelTarget.id} cancelada e estoque estornado.` });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const openCorrectModal = (sale: Sale) => {
    setCorrectTarget(sale);
    setCorrectEmployeeId(sale.employee_id);
    setCorrectItems(sale.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })));
    setCorrectReason('');
    setCorrectNotes(sale.notes || '');
  };

  const handleConfirmCorrect = async () => {
    if (!correctTarget) return;
    if (!correctReason.trim()) {
      setFeedback({ type: 'error', message: 'Informe o motivo da correção.' });
      return;
    }
    const validItems = correctItems.filter((it) => it.quantity > 0);
    if (validItems.length === 0) {
      setFeedback({ type: 'error', message: 'Mantenha ao menos um item na venda corrigida.' });
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.correctSale(correctTarget.id, {
        employee_id: correctEmployeeId,
        items: validItems,
        notes: correctNotes,
        reason: correctReason.trim(),
      });
      setCorrectTarget(null);
      setLoyaltyAfterSale(null);
      await onDataChanged();
      setFeedback({
        type: 'success',
        message: `Venda #${correctTarget.id} corrigida. Novo lançamento #${updated.id} gerado (${formatBRL(updated.total_cents)}).`,
      });
    } catch (err) {
      setFeedback({ type: 'error', message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSales = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return sales.filter((s) => {
      if (historyFilter === 'active' && s.status !== 'active') return false;
      if (historyFilter === 'cancelled' && s.status === 'active') return false;
      if (q) {
        const matchesEmp = s.employee_name.toLowerCase().includes(q);
        const matchesId = String(s.id).includes(q);
        const matchesItem = s.items.some((it) => it.product_name.toLowerCase().includes(q));
        if (!matchesEmp && !matchesId && !matchesItem) return false;
      }
      return true;
    });
  }, [sales, historyFilter, historySearch]);

  const bagContent = (
    <div className="space-y-4">
      {/* Client Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="pos-employee" className="text-xs font-semibold text-slate-700">
            Cliente do pedido
          </label>
          <button
            type="button"
            onClick={() => {
              setNewClientError(null);
              setShowNewClientModal(true);
            }}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Novo cliente
          </button>
        </div>
        {storeType === 'lite' && <>
          <input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); const match = activeEmployees.find((employee) => employee.name.toLowerCase() === event.target.value.trim().toLowerCase()); setSelectedEmployeeId(match?.id ?? 0); }} placeholder="Buscar cliente pelo nome" className="mb-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" list="lite-customer-options" />
          <datalist id="lite-customer-options">{activeEmployees.filter((employee) => !customerSearch || employee.name.toLowerCase().includes(customerSearch.toLowerCase())).map((employee) => <option key={employee.id} value={employee.name} />)}</datalist>
          <button type="button" onClick={() => { setNewClientError(null); setNewClientPhone(''); setShowNewClientModal(true); }} className="mb-2 text-xs font-semibold text-emerald-700">+ Cadastrar novo cliente pelo nome</button>
        </>}
        <select
          id="pos-employee"
          value={selectedEmployee?.id ?? ''}
          onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
          className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 min-h-[44px]"
        >
          {activeEmployees.filter((emp) => storeType !== 'lite' || !customerSearch || emp.name.toLowerCase().includes(customerSearch.toLowerCase())).map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} ({emp.phone || emp.code})
            </option>
          ))}
        </select>
        {selectedEmployee && storeType === 'lite' && <p className="text-sm font-semibold text-slate-800">Cliente: {selectedEmployee.name}</p>}
        {selectedEmployee && storeType !== 'lite' && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
            <span>Saldo em aberto atual</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {formatBRL(selectedEmployee.balance_cents)}
            </span>
          </div>
        )}
      </div>

      {/* Cart Items */}
      <div className="border-t border-slate-200 pt-4">
        {cartList.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Toque nos produtos para adicionar à sacola.
          </p>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {cartList.map(({ product, quantity }) => (
              <div key={product.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {formatBRL(product.price_cents)} un.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="inline-flex items-center gap-1 border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                    <button
                      onClick={() => updateCartQty(product, -1)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 hover:bg-white cursor-pointer"
                      aria-label={`Diminuir ${product.name}`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-5 text-center text-xs font-semibold font-mono tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={() => updateCartQty(product, 1)}
                      disabled={quantity >= product.stock}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-700 hover:bg-white disabled:opacity-40 cursor-pointer"
                      aria-label={`Aumentar ${product.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums w-16 text-right">
                    {formatBRL(product.price_cents * quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {storeType === 'lite' && <fieldset className="space-y-2"><legend className="text-xs font-semibold text-slate-600">Pagamento</legend><div className="grid grid-cols-2 gap-2">{([{value:'paid',label:'Pagou'},{value:'pending',label:'Não pagou'}] as const).map(option=><button type="button" key={option.value} onClick={()=>setPaymentStatus(option.value)} className={`min-h-11 rounded-xl border text-sm font-semibold ${paymentStatus===option.value?'border-emerald-700 bg-emerald-50 text-emerald-900':'border-slate-200 text-slate-600'}`}>{option.label}</button>)}</div></fieldset>}
      {/* Notes */}
      {storeType !== 'lite' && <div className="space-y-1.5">
        <label htmlFor="pos-notes" className="block text-xs font-medium text-slate-600">
          Observação (opcional)
        </label>
        <input
          id="pos-notes"
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: Retirado no intervalo..."
          className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
        />
      </div>}

      {/* Totals & Primary CTA */}
      <div className="border-t border-slate-200 pt-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-600">Total do pedido</span>
          <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {formatBRL(cartTotalCents)}
          </span>
        </div>
        {storeType !== 'lite' && selectedEmployee && cartTotalCents > 0 && (
          <div className="flex items-baseline justify-between text-xs text-slate-500">
            <span>Novo saldo após registro</span>
            <span className="font-mono tabular-nums font-semibold text-slate-800">
              {formatBRL(selectedEmployee.balance_cents + cartTotalCents)}
            </span>
          </div>
        )}

        <div className="hidden lg:block">
          <button
            onClick={handleFinalizeSale}
            disabled={submitting || cartList.length === 0 || !selectedEmployee}
            className="w-full h-12 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            {submitting ? 'Registrando venda...' : storeType === 'lite' ? 'Registrar venda' : 'Confirmar venda na conta'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Segmented Top Switcher */}
      {storeType !== 'lite' && <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            onClick={() => setSubTab('register')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
              subTab === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lançar venda (PDV)
          </button>
          <button
            onClick={() => setSubTab('history')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
              subTab === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Histórico e correções ({sales.length})
          </button>
        </div>
      </div>}

      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl border text-sm flex items-center justify-between gap-4 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-500 hover:text-slate-800 cursor-pointer p-1" aria-label="Fechar aviso">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loyaltySettings?.enabled && loyaltyAfterSale && selectedEmployee && (
        <LoyaltyCardPanel
          config={loyaltySettings}
          progress={loyaltyAfterSale}
          customerName={selectedEmployee.name}
          storeName={storeSettings.store_name}
          logoDataUrl={storeSettings.logo_data_url}
        />
      )}

      {subTab === 'register' || storeType === 'lite' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: iFood-inspired Menu & Quick Selector */}
          <div className="lg:col-span-8 space-y-4">
            {/* Mobile Quick Client Selector Banner */}
            <div className="lg:hidden bg-white border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-slate-500">Vendendo para</p>
                <select
                  value={selectedEmployee?.id ?? ''}
                  onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
                  aria-label="Selecionar cliente"
                  className="w-full mt-0.5 text-sm font-semibold text-slate-900 bg-transparent focus:outline-none truncate"
                >
                  {activeEmployees.filter((emp) => storeType !== 'lite' || !customerSearch || emp.name.toLowerCase().includes(customerSearch.toLowerCase())).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.phone || emp.code})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewClientError(null);
                  setShowNewClientModal(true);
                }}
                className="px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl inline-flex items-center gap-1.5 shrink-0 cursor-pointer min-h-[40px]"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Novo
              </button>
            </div>

            {/* Search & Sticky Category Scroller */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar suco, vitamina, trufa ou lanche..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {['Todos', ...CATEGORY_OPTIONS].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product List (iFood horizontal cards on mobile, clean grid on md+) */}
            {availableProducts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-12 text-center text-sm text-slate-500">
                Nenhum produto encontrado para o filtro selecionado.
              </div>
            ) : (
              <>
                {/* Mobile iFood-style Horizontal Menu List */}
                <div className="md:hidden bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                  {availableProducts.map((prod) => {
                    const inCart = cart[prod.id]?.quantity ?? 0;
                    const outOfStock = prod.stock === 0;
                    return (
                      <div
                        key={prod.id}
                        className={`p-3.5 flex items-center justify-between gap-3.5 transition-colors ${
                          inCart > 0 ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-[11px] font-medium text-slate-500">{prod.category}</p>
                          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{prod.name}</h3>
                          <p className="text-xs text-slate-500 line-clamp-2">{prod.description}</p>
                          <div className="pt-1 flex items-baseline gap-2.5">
                            <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                              {formatBRL(prod.price_cents)}
                            </span>
                            <span
                              className={`text-[11px] font-mono tabular-nums ${
                                outOfStock ? 'text-red-600 font-medium' : prod.stock <= prod.min_stock ? 'text-amber-700' : 'text-slate-400'
                              }`}
                            >
                              {outOfStock ? 'Esgotado' : `${prod.stock} un.`}
                            </span>
                          </div>
                        </div>

                        <div className="relative w-24 h-24 shrink-0">
                          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80">
                            <ProductImage src={prod.image_url} alt={prod.name} category={prod.category} />
                          </div>

                          {/* Overlaid Touch Action Control (iFood style) */}
                          <div className="absolute -bottom-1.5 right-0 left-0 flex justify-center">
                            {inCart > 0 ? (
                              <div className="inline-flex items-center bg-white border border-emerald-600 rounded-xl shadow-sm h-9 px-1 gap-1">
                                <button
                                  onClick={() => updateCartQty(prod, -1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                  aria-label={`Remover 1 ${prod.name}`}
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-5 text-center text-xs font-bold font-mono tabular-nums text-slate-900">
                                  {inCart}
                                </span>
                                <button
                                  onClick={() => updateCartQty(prod, 1)}
                                  disabled={inCart >= prod.stock}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 cursor-pointer"
                                  aria-label={`Adicionar 1 ${prod.name}`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => updateCartQty(prod, 1)}
                                disabled={outOfStock}
                                aria-label={`Adicionar ${prod.name}`}
                                className="h-9 px-3.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:text-slate-400 inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet Crisp Grid */}
                <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                  {availableProducts.map((prod) => {
                    const inCart = cart[prod.id]?.quantity ?? 0;
                    const outOfStock = prod.stock === 0;
                    return (
                      <div
                        key={prod.id}
                        className={`border rounded-2xl p-3.5 flex flex-col justify-between gap-3 transition-all ${
                          inCart > 0
                            ? 'border-emerald-600 bg-emerald-50/30'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-slate-100 border border-slate-100">
                            <ProductImage src={prod.image_url} alt={prod.name} category={prod.category} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-slate-500 truncate">{prod.category}</p>
                            <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 mt-0.5">
                              {prod.name}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                          <div>
                            <p className="text-base font-semibold text-slate-900 font-mono tabular-nums">
                              {formatBRL(prod.price_cents)}
                            </p>
                            <p
                              className={`text-[11px] font-mono tabular-nums ${
                                outOfStock ? 'text-red-600 font-medium' : prod.stock <= prod.min_stock ? 'text-amber-700' : 'text-slate-500'
                              }`}
                            >
                              {outOfStock ? 'Sem estoque' : `Estoque: ${prod.stock}`}
                            </p>
                          </div>

                          {inCart > 0 ? (
                            <div className="inline-flex items-center gap-1 bg-white border border-emerald-600 rounded-xl p-0.5">
                              <button
                                onClick={() => updateCartQty(prod, -1)}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 cursor-pointer"
                                aria-label={`Diminuir ${prod.name}`}
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center text-xs font-semibold font-mono tabular-nums text-slate-900">
                                {inCart}
                              </span>
                              <button
                                onClick={() => updateCartQty(prod, 1)}
                                disabled={inCart >= prod.stock}
                                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                                aria-label={`Aumentar ${prod.name}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => updateCartQty(prod, 1)}
                              disabled={outOfStock}
                              className="px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 transition-all whitespace-nowrap shrink-0 cursor-pointer min-h-[38px]"
                            >
                              Adicionar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right: Desktop Sticky Sacola Panel */}
          <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-20 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-700" />
                <h2 className="text-base font-semibold text-slate-900">
                  Sacola do pedido {cartTotalUnits > 0 ? `(${cartTotalUnits})` : ''}
                </h2>
              </div>
              {cartList.length > 0 && (
                <button
                  onClick={() => setCart({})}
                  className="text-xs text-slate-500 hover:text-red-600 cursor-pointer whitespace-nowrap"
                >
                  Limpar
                </button>
              )}
            </div>
            {bagContent}
          </div>

          {/* Mobile Floating iFood-Style Bag Bar */}
          <AnimatePresence>
            {!mobileBagOpen && (
              <motion.div
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 24, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="lg:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] left-3 right-3 z-30"
              >
                <button
                  onClick={() => setMobileBagOpen(true)}
                  className="w-full h-12 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white shadow-lg shadow-emerald-900/20 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <ShoppingBag className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold">
                      {cartTotalUnits > 0 ? `Ver pedido · ${cartTotalUnits} ${cartTotalUnits === 1 ? 'item' : 'itens'}` : 'Pedido vazio · adicionar produtos'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono tabular-nums text-sm font-semibold">
                    <span>{formatBRL(cartTotalCents)}</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Slide-Up Checkout Bottom Sheet */}
          <AnimatePresence>
            {mobileBagOpen && (
              <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileBagOpen(false)}
                  className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
                />
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                  className="relative bg-white rounded-t-3xl pt-3 max-h-[min(88dvh,48rem)] flex flex-col shadow-2xl pb-[env(safe-area-inset-bottom)]"
                >
                  <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3 shrink-0" />
                  <div className="flex items-center justify-between px-5 pb-3 mb-3 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-emerald-700" />
                      <h2 className="text-base font-semibold text-slate-900">Sacola do pedido</h2>
                    </div>
                    <button
                      onClick={() => setMobileBagOpen(false)}
                      className="p-2 text-slate-500 hover:text-slate-800 rounded-lg"
                      aria-label="Fechar sacola"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="overflow-y-auto px-5 pb-4 overscroll-contain">
                    {bagContent}
                  </div>
                  <div className="shrink-0 border-t border-slate-200 bg-white px-5 pt-3 pb-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-slate-500">{cartTotalUnits} {cartTotalUnits === 1 ? 'item' : 'itens'} no pedido</p>
                        <p className="text-base font-semibold text-slate-900">Total</p>
                      </div>
                      <span className="text-xl font-semibold text-slate-900 font-mono tabular-nums">{formatBRL(cartTotalCents)}</span>
                    </div>
                    <button
                      onClick={handleFinalizeSale}
                      disabled={submitting || cartList.length === 0 || !selectedEmployee}
                      className="w-full h-12 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] disabled:bg-slate-200 disabled:text-slate-400 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                    >
                      {submitting ? 'Registrando venda...' : cartList.length === 0 ? 'Adicione produtos para continuar' : storeType === 'lite' ? 'Registrar venda' : 'Confirmar venda na conta'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* History & Corrections Tab */
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar por cliente, nº ou produto..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'active', label: 'Ativas' },
                { key: 'cancelled', label: 'Canceladas / Corrigidas' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setHistoryFilter(opt.key as typeof historyFilter)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    historyFilter === opt.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Sales Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredSales.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhuma venda encontrada.</p>
            ) : (
              filteredSales.map((sale) => (
                <div key={sale.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{sale.employee_name}</p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        #{sale.id} · {formatDateTime(sale.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold font-mono tabular-nums ${
                          sale.status === 'active' ? 'text-slate-900' : 'text-slate-400 line-through'
                        }`}
                      >
                        {formatBRL(sale.total_cents)}
                      </p>
                      <p className="text-[11px]">
                        {sale.status === 'active' && <span className="text-emerald-700 font-medium">Ativa</span>}
                        {sale.status === 'cancelled' && <span className="text-red-600 font-medium">Cancelada</span>}
                        {sale.status === 'corrected' && <span className="text-amber-700 font-medium">Substituída</span>}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">
                    {sale.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                  </p>
                  {sale.status === 'active' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => openCorrectModal(sale)}
                        className="flex-1 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Corrigir
                      </button>
                      <button
                        onClick={() => {
                          setCancelTarget(sale);
                          setCancelReason('');
                        }}
                        className="flex-1 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop Sales Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Venda</th>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Itens retirados</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      Nenhuma venda encontrada.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                        #{sale.id}
                        {sale.corrected_from_sale_id && (
                          <span className="block text-[11px] text-slate-400">Corrige #{sale.corrected_from_sale_id}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                        {formatDateTime(sale.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{sale.employee_name}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                        {sale.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                        {sale.notes && <p className="text-slate-400 mt-0.5">Obs.: {sale.notes}</p>}
                        {sale.cancel_reason && <p className="text-red-600 mt-0.5">Motivo: {sale.cancel_reason}</p>}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {sale.status === 'active' && <span className="font-medium text-emerald-700">Ativa</span>}
                        {sale.status === 'cancelled' && <span className="font-medium text-red-600">Cancelada</span>}
                        {sale.status === 'corrected' && <span className="font-medium text-amber-700">Substituída</span>}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          sale.status === 'active' ? 'text-slate-900' : 'text-slate-400 line-through'
                        }`}
                      >
                        {formatBRL(sale.total_cents)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {sale.status === 'active' ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => openCorrectModal(sale)}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              Corrigir
                            </button>
                            <button
                              onClick={() => {
                                setCancelTarget(sale);
                                setCancelReason('');
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Histórico preservado</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick New Client Modal */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Cadastrar cliente</h3>
              <button onClick={() => setShowNewClientModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            {newClientError && (
              <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{newClientError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome completo</label>
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Ex.: Fernanda Lima"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              {storeType !== 'lite' && <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="(11) 99999-0000"
                  className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                />
              </div>}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewClientModal(false)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateQuickClient}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl cursor-pointer"
              >
                {submitting ? 'Salvando...' : 'Cadastrar e selecionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Sale Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Cancelar Venda #{cancelTarget.id}</h3>
              <button onClick={() => setCancelTarget(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              O valor de <strong className="font-mono tabular-nums">{formatBRL(cancelTarget.total_cents)}</strong> será removido do saldo de{' '}
              <strong>{cancelTarget.employee_name}</strong> e os itens voltarão ao estoque automaticamente.
            </p>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Motivo do cancelamento</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex.: Lançamento em duplicidade"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Correct Sale Modal */}
      {correctTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Corrigir Venda #{correctTarget.id}</h3>
              <button onClick={() => setCorrectTarget(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              A venda original será marcada como substituída (mantendo o histórico) e um novo lançamento corrigido ajustará o estoque e o saldo automaticamente.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cliente</label>
                <select
                  value={correctEmployeeId}
                  onChange={(e) => setCorrectEmployeeId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                >
                  {activeEmployees.filter((emp) => storeType !== 'lite' || !customerSearch || emp.name.toLowerCase().includes(customerSearch.toLowerCase())).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.phone || emp.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Itens da venda</label>
                  <button
                    type="button"
                    onClick={() => {
                      const firstAvail = products.find((p) => p.available && p.stock > 0);
                      if (firstAvail) {
                        setCorrectItems((prev) => [...prev, { product_id: firstAvail.id, quantity: 1 }]);
                      }
                    }}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    + Adicionar item
                  </button>
                </div>
                {correctItems.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={it.product_id}
                      onChange={(e) => {
                        const pid = Number(e.target.value);
                        setCorrectItems((prev) => prev.map((row, i) => (i === idx ? { ...row, product_id: pid } : row)));
                      }}
                      className="flex-1 px-2.5 py-2 text-sm border border-slate-200 rounded-xl"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatBRL(p.price_cents)})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => {
                        const qty = Math.max(1, Number(e.target.value));
                        setCorrectItems((prev) => prev.map((row, i) => (i === idx ? { ...row, quantity: qty } : row)));
                      }}
                      className="w-20 px-2.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => setCorrectItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Motivo da correção</label>
                <input
                  type="text"
                  value={correctReason}
                  onChange={(e) => setCorrectReason(e.target.value)}
                  placeholder="Ex.: Cliente devolveu 1 trufa"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observação</label>
                <input
                  type="text"
                  value={correctNotes}
                  onChange={(e) => setCorrectNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCorrectTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmCorrect}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Salvar correção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

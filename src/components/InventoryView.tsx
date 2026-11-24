import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownUp, Edit2, PackagePlus, Search, Trash2, X } from 'lucide-react';
import type { Product, StockMovement } from '../types';
import { api } from '../api/client';
import { CATEGORY_IMAGES, CATEGORY_OPTIONS, formatDateTime, parseBRLToCents } from '../utils/format';

interface InventoryViewProps {
  products: Product[];
  preselectedProductId?: number | null;
  onClearPreselected?: () => void;
  onDataChanged: () => Promise<void>;
}

const MOVEMENT_LABELS: Record<string, { label: string; tone: string }> = {
  entry: { label: 'Entrada', tone: 'text-emerald-700' },
  sale: { label: 'Venda', tone: 'text-slate-700' },
  sale_reversal: { label: 'Estorno', tone: 'text-amber-700' },
  adjustment: { label: 'Ajuste', tone: 'text-slate-900' },
};

export function InventoryView({ products, preselectedProductId, onClearPreselected, onDataChanged }: InventoryViewProps) {
  const [tab, setTab] = useState<'levels' | 'movements'>('levels');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [onlyLow, setOnlyLow] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Stock modal
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [modalMode, setModalMode] = useState<'entry' | 'adjustment'>('entry');
  const [entryQty, setEntryQty] = useState(10);
  const [targetStock, setTargetStock] = useState(0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Sucos');
  const [editPrice, setEditPrice] = useState('');
  const [editMinStock, setEditMinStock] = useState(0);
  const [editAvailable, setEditAvailable] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.getStockMovements().then(setMovements).catch(() => {});
  }, [products]);

  useEffect(() => {
    if (preselectedProductId) {
      const found = products.find((p) => p.id === preselectedProductId);
      if (found) {
        openStockModal(found, 'entry');
      }
      onClearPreselected?.();
    }
  }, [preselectedProductId, products, onClearPreselected]);

  const openStockModal = (prod: Product, mode: 'entry' | 'adjustment') => {
    setTargetProduct(prod);
    setModalMode(mode);
    setEntryQty(10);
    setTargetStock(prod.stock);
    setReason(mode === 'entry' ? 'Reposição de estoque' : '');
    setErrorMsg(null);
  };

  const openEditModal = (product: Product) => {
    setEditTarget(product);
    setEditName(product.name);
    setEditDescription(product.description || '');
    setEditCategory(product.category);
    setEditPrice((product.price_cents / 100).toFixed(2).replace('.', ','));
    setEditMinStock(product.min_stock);
    setEditAvailable(Boolean(product.available));
    setEditError(null);
  };

  const handleSaveProduct = async () => {
    if (!editTarget) return;
    if (!editName.trim()) { setEditError('Informe o nome do produto.'); return; }
    if (!editPrice.trim()) { setEditError('Informe o preço do produto.'); return; }
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.updateProduct(editTarget.id, {
        name: editName.trim(), description: editDescription.trim(), category: editCategory,
        image_url: CATEGORY_IMAGES[editCategory] || CATEGORY_IMAGES.Outros,
        price_cents: parseBRLToCents(editPrice), min_stock: editMinStock,
        available: editAvailable ? 1 : 0,
      });
      setEditTarget(null);
      await onDataChanged();
    } catch (err) { setEditError((err as Error).message); }
    finally { setSavingEdit(false); }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteProduct(deleteTarget.id);
      setDeleteTarget(null);
      await onDataChanged();
      setMovements(await api.getStockMovements());
    } catch (err) { setDeleteError((err as Error).message); }
    finally { setDeleting(false); }
  };

  const handleSaveStock = async () => {
    if (!targetProduct) return;
    if (!reason.trim()) {
      setErrorMsg('Informe a justificativa da movimentação.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.adjustStock(targetProduct.id, {
        type: modalMode,
        quantity: modalMode === 'entry' ? entryQty : undefined,
        new_stock: modalMode === 'adjustment' ? targetStock : undefined,
        reason: reason.trim(),
      });
      setTargetProduct(null);
      await onDataChanged();
      const updatedMoves = await api.getStockMovements();
      setMovements(updatedMoves);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'Todos' && p.category !== categoryFilter) return false;
      if (onlyLow && p.stock > p.min_stock) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, categoryFilter, onlyLow]);

  const lowCount = products.filter((p) => p.stock <= p.min_stock).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            onClick={() => setTab('levels')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
              tab === 'levels' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Posição ({products.length})
          </button>
          <button
            onClick={() => setTab('movements')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px] ${
              tab === 'movements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Movimentações ({movements.length})
          </button>
        </div>

        {lowCount > 0 && (
          <button
            onClick={() => {
              setTab('levels');
              setOnlyLow((v) => !v);
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border inline-flex items-center gap-2 cursor-pointer whitespace-nowrap min-h-[38px] ${
              onlyLow
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {onlyLow ? 'Mostrando estoque baixo' : `${lowCount} com estoque baixo`}
          </button>
        )}
      </div>

      {tab === 'levels' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar produto..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {['Todos', ...CATEGORY_OPTIONS].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === cat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Stock Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredProducts.map((prod) => {
              const isZero = prod.stock === 0;
              const isLow = prod.stock > 0 && prod.stock <= prod.min_stock;
              return (
                <div key={prod.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{prod.name}</p>
                    <p className="text-xs text-slate-500">
                      {prod.category}
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          isZero ? 'text-red-600' : isLow ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {prod.stock} un.
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums"> (mín. {prod.min_stock})</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 shrink-0">
                    <button
                      onClick={() => openStockModal(prod, 'entry')}
                      className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl inline-flex items-center gap-1 cursor-pointer min-h-[38px]"
                    >
                      <PackagePlus className="w-3.5 h-3.5" />
                      Entrada
                    </button>
                    <button
                      onClick={() => openStockModal(prod, 'adjustment')}
                      className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                      aria-label={`Ajustar estoque de ${prod.name}`}
                    >
                      <ArrowDownUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(prod)}
                      className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                      aria-label={`Editar ${prod.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(prod); setDeleteError(null); }}
                      className="p-2 text-red-700 bg-red-50 hover:bg-red-100 rounded-xl cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                      aria-label={`Excluir ${prod.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Stock Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-right">Estoque atual</th>
                  <th className="py-3 px-4 text-right">Mínimo</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredProducts.map((prod) => {
                  const isZero = prod.stock === 0;
                  const isLow = prod.stock > 0 && prod.stock <= prod.min_stock;
                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-medium text-slate-900">{prod.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-500">{prod.category}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {prod.stock} un.
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500">
                        {prod.min_stock} un.
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {isZero ? (
                          <span className="font-medium text-red-600">Sem estoque</span>
                        ) : isLow ? (
                          <span className="font-medium text-amber-700">Estoque baixo</span>
                        ) : (
                          <span className="font-medium text-emerald-700">Normal</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openStockModal(prod, 'entry')}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            Entrada
                          </button>
                          <button
                            onClick={() => openStockModal(prod, 'adjustment')}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowDownUp className="w-3.5 h-3.5" />
                            Ajustar
                          </button>
                          <button
                            onClick={() => openEditModal(prod)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Editar
                          </button>
                          <button
                            onClick={() => { setDeleteTarget(prod); setDeleteError(null); }}
                            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Mobile Movements Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {movements.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Nenhuma movimentação registrada.</p>
            ) : (
              movements.map((m) => {
                const meta = MOVEMENT_LABELS[m.type] ?? { label: m.type, tone: 'text-slate-700' };
                return (
                  <div key={m.id} className="p-4 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{m.product_name}</p>
                        <p className="text-xs text-slate-500">
                          <span className={`font-semibold ${meta.tone}`}>{meta.label}</span> ·{' '}
                          <span className="font-mono tabular-nums">{formatDateTime(m.created_at)}</span>
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <p className={`text-sm font-semibold ${m.quantity_delta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {m.quantity_delta >= 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {m.stock_before} → {m.stock_after}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">{m.reason}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Movements Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Variação</th>
                  <th className="py-3 px-4 text-right">Saldo (Antes → Depois)</th>
                  <th className="py-3 px-4">Justificativa / Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      Nenhuma movimentação registrada.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const meta = MOVEMENT_LABELS[m.type] ?? { label: m.type, tone: 'text-slate-700' };
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {formatDateTime(m.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{m.product_name}</p>
                          <p className="text-xs text-slate-500">{m.product_category}</p>
                        </td>
                        <td className={`py-3 px-4 text-xs font-semibold ${meta.tone}`}>{meta.label}</td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            m.quantity_delta >= 0 ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {m.quantity_delta >= 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                          {m.stock_before} → <strong className="text-slate-900">{m.stock_after}</strong>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{m.reason}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Editar produto</h3>
                <p className="text-xs text-slate-500 mt-0.5">O estoque é alterado pela ação “Ajustar”.</p>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg" aria-label="Fechar edição">
                <X className="w-5 h-5" />
              </button>
            </div>
            {editError && <p role="alert" className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl">{editError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white">
                    {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preço (R$)</label>
                  <input inputMode="decimal" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="0,00" className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estoque mínimo</label>
                <input type="number" min={0} value={editMinStock} onChange={(e) => setEditMinStock(Math.max(0, Number(e.target.value)))} className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="checkbox" checked={editAvailable} onChange={(e) => setEditAvailable(e.target.checked)} className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />
                Produto disponível para venda
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl">Cancelar</button>
              <button onClick={handleSaveProduct} disabled={savingEdit} className="px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl">
                {savingEdit ? 'Salvando…' : 'Salvar produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5" /></div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Excluir produto?</h3>
                <p className="text-sm text-slate-600 mt-1"><strong>{deleteTarget.name}</strong> será removido do catálogo e seu histórico de estoque e preços também será apagado.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">Produtos vinculados a vendas antigas não podem ser excluídos; pause-os no catálogo para preservar o histórico.</p>
            {deleteError && <p role="alert" className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl">{deleteError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl">Cancelar</button>
              <button onClick={handleDeleteProduct} disabled={deleting} className="px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl">
                {deleting ? 'Excluindo…' : 'Excluir produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Entry / Adjustment Modal */}
      {targetProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {modalMode === 'entry' ? 'Entrada de estoque' : 'Ajuste manual de estoque'}
              </h3>
              <button onClick={() => setTargetProduct(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">{targetProduct.name}</p>
                <p className="text-xs text-slate-500">{targetProduct.category}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Atual</p>
                <p className="text-sm font-semibold font-mono tabular-nums text-slate-900">{targetProduct.stock} un.</p>
              </div>
            </div>

            {errorMsg && <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">{errorMsg}</div>}

            {modalMode === 'entry' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quantidade adicionada</label>
                <input
                  type="number"
                  min={1}
                  value={entryQty}
                  onChange={(e) => setEntryQty(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                />
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  Novo saldo previsto: {targetProduct.stock + entryQty} un.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Quantidade real em estoque (contagem)</label>
                <input
                  type="number"
                  min={0}
                  value={targetStock}
                  onChange={(e) => setTargetStock(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Justificativa obrigatória</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={modalMode === 'entry' ? 'Ex.: Compra semanal de polpas' : 'Ex.: Avaria / vencimento ou conferência'}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setTargetProduct(null)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveStock}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                {submitting ? 'Salvando...' : 'Confirmar movimentação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Edit2, History, Plus, Search, X } from 'lucide-react';
import type { PriceHistoryEntry, Product } from '../types';
import { api } from '../api/client';
import { CATEGORY_IMAGES, CATEGORY_OPTIONS, formatBRL, formatDateTime, parseBRLToCents } from '../utils/format';
import { ProductImage } from './ProductImage';

interface CatalogViewProps {
  products: Product[];
  onDataChanged: () => Promise<void>;
}

export function CatalogView({ products, onDataChanged }: CatalogViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [showPriceHistoryModal, setShowPriceHistoryModal] = useState(false);
  const [historyProductName, setHistoryProductName] = useState<string | null>(null);

  // Create / Edit modal
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState<string>('Sucos');
  const [formImage, setFormImage] = useState('');
  const [formPriceStr, setFormPriceStr] = useState('5,00');
  const [formStock, setFormStock] = useState(10);
  const [formMinStock, setFormMinStock] = useState(5);
  const [formAvailable, setFormAvailable] = useState(true);
  const [formPriceReason, setFormPriceReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getPriceHistory().then(setPriceHistory).catch(() => {});
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== 'Todos' && p.category !== categoryFilter) return false;
      if (availabilityFilter === 'available' && !p.available) return false;
      if (availabilityFilter === 'unavailable' && p.available) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, categoryFilter, availabilityFilter]);

  const openCreateModal = () => {
    setIsCreating(true);
    setEditingProduct(null);
    setFormName('');
    setFormDesc('');
    setFormCategory('Sucos');
    setFormImage(CATEGORY_IMAGES['Sucos']);
    setFormPriceStr('7,00');
    setFormStock(12);
    setFormMinStock(5);
    setFormAvailable(true);
    setFormPriceReason('');
    setErrorMsg(null);
  };

  const openEditModal = (prod: Product) => {
    setIsCreating(false);
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormDesc(prod.description);
    setFormCategory(prod.category);
    setFormImage(CATEGORY_IMAGES[prod.category] || CATEGORY_IMAGES.Outros);
    setFormPriceStr((prod.price_cents / 100).toFixed(2).replace('.', ','));
    setFormStock(prod.stock);
    setFormMinStock(prod.min_stock);
    setFormAvailable(Boolean(prod.available));
    setFormPriceReason('');
    setErrorMsg(null);
  };

  const openProductHistory = async (prod?: Product) => {
    try {
      const list = await api.getPriceHistory(prod?.id);
      setPriceHistory(list);
      setHistoryProductName(prod ? prod.name : null);
      setShowPriceHistoryModal(true);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    const priceCents = parseBRLToCents(formPriceStr);
    if (!formName.trim()) {
      setErrorMsg('Informe o nome do produto.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      if (isCreating) {
        await api.createProduct({
          name: formName.trim(),
          description: formDesc.trim(),
          category: formCategory,
          image_url: CATEGORY_IMAGES[formCategory] || CATEGORY_IMAGES.Outros,
          price_cents: priceCents,
          stock: formStock,
          min_stock: formMinStock,
          available: formAvailable ? 1 : 0,
        });
      } else if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          name: formName.trim(),
          description: formDesc.trim(),
          category: formCategory,
          image_url: CATEGORY_IMAGES[formCategory] || CATEGORY_IMAGES.Outros,
          price_cents: priceCents,
          min_stock: formMinStock,
          available: formAvailable ? 1 : 0,
          price_reason: formPriceReason.trim() || 'Atualização de tabela de preços',
        });
      }
      setIsCreating(false);
      setEditingProduct(null);
      await onDataChanged();
      const updatedHist = await api.getPriceHistory();
      setPriceHistory(updatedHist);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (prod: Product) => {
    await api.updateProduct(prod.id, {
      name: prod.name,
      description: prod.description,
      category: prod.category,
      image_url: prod.image_url,
      price_cents: prod.price_cents,
      min_stock: prod.min_stock,
      available: prod.available ? 0 : 1,
    });
    await onDataChanged();
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar no catálogo..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
            {['Todos', ...CATEGORY_OPTIONS].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as typeof availabilityFilter)}
            className="px-3 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="all">Todos os status</option>
            <option value="available">Disponíveis</option>
            <option value="unavailable">Pausados</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => openProductHistory()}
            className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer min-h-[40px]"
          >
            <History className="w-3.5 h-3.5" />
            Histórico de preços
          </button>
          <button
            onClick={openCreateModal}
            className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer min-h-[40px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo produto
          </button>
        </div>
      </div>

      {/* Product List / Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <p className="text-sm text-slate-600">Nenhum produto encontrado para este filtro.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-xl cursor-pointer"
          >
            Cadastrar produto
          </button>
        </div>
      ) : (
        <>
          {/* Mobile Compact Horizontal Cards */}
          <div className="md:hidden bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {filtered.map((prod) => (
              <div key={prod.id} className={`p-4 space-y-3 ${!prod.available ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500">{prod.category}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className={prod.available ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                        {prod.available ? 'Disponível' : 'Pausado'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{prod.name}</h3>
                    <div className="flex items-baseline gap-2.5 pt-0.5">
                      <span className="text-base font-semibold text-slate-900 font-mono tabular-nums">
                        {formatBRL(prod.price_cents)}
                      </span>
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          prod.stock === 0 ? 'text-red-600' : prod.stock <= prod.min_stock ? 'text-amber-700' : 'text-slate-500'
                        }`}
                      >
                        Estoque: {prod.stock} un.
                      </span>
                    </div>
                  </div>
                  <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                    <ProductImage src={prod.image_url} alt={prod.name} category={prod.category} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openProductHistory(prod)}
                    className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    <History className="w-3.5 h-3.5" />
                    Preços
                  </button>
                  <button
                    onClick={() => handleToggleAvailability(prod)}
                    className="flex-1 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer min-h-[38px]"
                  >
                    {prod.available ? 'Pausar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => openEditModal(prod)}
                    className="flex-1 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Grid */}
          <div className="hidden md:grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((prod) => (
              <div
                key={prod.id}
                className={`bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5 ${
                  !prod.available ? 'opacity-70' : ''
                }`}
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden border-b border-slate-100">
                    <ProductImage src={prod.image_url} alt={prod.name} category={prod.category} />
                  </div>
                  <div className="p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{prod.category}</span>
                      <span className={prod.available ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                        {prod.available ? 'Disponível' : 'Indisponível'}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">{prod.name}</h3>
                    <p className="text-xs text-slate-600 line-clamp-2">{prod.description || 'Sem descrição adicional.'}</p>
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900 font-mono tabular-nums">
                      {formatBRL(prod.price_cents)}
                    </p>
                    <p
                      className={`text-xs font-mono tabular-nums ${
                        prod.stock === 0 ? 'text-red-600' : prod.stock <= prod.min_stock ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      Estoque: {prod.stock} un. (mín. {prod.min_stock})
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openProductHistory(prod)}
                      className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer"
                      title="Histórico de preços"
                      aria-label={`Histórico de preços de ${prod.name}`}
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleAvailability(prod)}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer whitespace-nowrap"
                    >
                      {prod.available ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => openEditModal(prod)}
                      className="px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <Edit2 className="w-3 h-3" />
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create / Edit Modal */}
      {(isCreating || editingProduct) && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                {isCreating ? 'Cadastrar novo produto' : `Editar: ${editingProduct?.name}`}
              </h3>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingProduct(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl">{errorMsg}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do produto</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex.: Suco de Maracujá"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      const cat = e.target.value;
                      setFormCategory(cat);
                      setFormImage(CATEGORY_IMAGES[cat] || CATEGORY_IMAGES.Outros);
                    }}
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Preço (R$)</label>
                  <input
                    type="text"
                    value={formPriceStr}
                    onChange={(e) => setFormPriceStr(e.target.value)}
                    placeholder="7,00"
                    className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {editingProduct && parseBRLToCents(formPriceStr) !== editingProduct.price_cents && (
                <div>
                  <label className="block text-xs font-semibold text-amber-800 mb-1">
                    Motivo da alteração de preço (registrado no histórico)
                  </label>
                  <input
                    type="text"
                    value={formPriceReason}
                    onChange={(e) => setFormPriceReason(e.target.value)}
                    placeholder="Ex.: Reajuste do fornecedor"
                    className="w-full px-3 py-2.5 text-sm border border-amber-300 bg-amber-50/40 rounded-xl"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Detalhes, volume ou sabor..."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isCreating && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estoque inicial</label>
                    <input
                      type="number"
                      min={0}
                      value={formStock}
                      onChange={(e) => setFormStock(Math.max(0, Number(e.target.value)))}
                      className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                    />
                  </div>
                )}
                <div className={isCreating ? '' : 'col-span-2'}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alerta de estoque mínimo</label>
                  <input
                    type="number"
                    min={0}
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Imagem do catálogo</label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {Object.entries(CATEGORY_IMAGES).map(([label, path]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setFormImage(path)}
                      className={`p-1 rounded-xl border text-[11px] text-center cursor-pointer ${
                        formImage === path ? 'border-emerald-600 ring-2 ring-emerald-600/20' : 'border-slate-200'
                      }`}
                    >
                      <img src={path} alt={label} className="w-full h-12 object-cover rounded-lg mb-1" />
                      <span className="block truncate text-slate-700">{label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">As ilustrações vetoriais acompanham a categoria do produto.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAvailable}
                  onChange={(e) => setFormAvailable(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                />
                Produto disponível para venda
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setEditingProduct(null);
                }}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                {saving ? 'Salvando...' : 'Salvar produto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {showPriceHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Histórico de alterações de preços
                </h3>
                <p className="text-xs text-slate-500">
                  {historyProductName ? `Produto: ${historyProductName}` : 'Todas as atualizações de preços do catálogo'}
                </p>
              </div>
              <button onClick={() => setShowPriceHistoryModal(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {priceHistory.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">Nenhuma alteração de preço registrada.</p>
              ) : (
                priceHistory.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.product_name}</p>
                      <p className="text-xs text-slate-600">{item.reason}</p>
                      <p className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        {formatDateTime(item.created_at)} · {item.changed_by}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <span className="text-xs text-slate-400 line-through mr-2">{formatBRL(item.old_price_cents)}</span>
                      <span className="text-sm font-semibold text-slate-900">{formatBRL(item.new_price_cents)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BarChart3,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  Store,
  Utensils,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { api, apiUrl } from './api/client';
import type { DashboardSummary, Employee, LoyaltySettings, Product, Sale, StoreSettings, StoreType } from './types';
import { DEFAULT_BILLING_TEMPLATE } from './utils/pix';
import { DashboardView } from './components/DashboardView';
import { PosSalesView } from './components/PosSalesView';
import { CatalogView } from './components/CatalogView';
import { AccountsView } from './components/AccountsView';
import { InventoryView } from './components/InventoryView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { MenuView } from './components/MenuView';
import { PendingSalesView } from './components/PendingSalesView';
import { LiteCustomersView } from './components/LiteCustomersView';
import { QuickMonthlySalesView } from './components/QuickMonthlySalesView';

type AdminTab = 'dashboard' | 'pos' | 'catalog' | 'accounts' | 'inventory' | 'menu' | 'reports' | 'settings' | 'pending' | 'customers' | 'quick-report';

const DEFAULT_SETTINGS: StoreSettings = {
  id: 1,
  store_name: 'Tem o quê?',
  logo_data_url: '',
  pix_key: '',
  pix_key_type: 'auto',
  pix_beneficiary_name: 'MARLENE INTERPRISE',
  pix_city: 'SAO PAULO',
  billing_message_template: DEFAULT_BILLING_TEMPLATE,
  brand_primary_color: '#047857',
  brand_secondary_color: '#f59e0b',
  updated_at: '',
};

function blendHex(color: string, target: string, targetWeight: number) {
  const toRgb = (hex: string) => hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [4, 120, 87];
  const from = toRgb(color);
  const to = toRgb(target);
  return `#${from.map((value, index) => Math.round(value * (1 - targetWeight) + to[index]! * targetWeight).toString(16).padStart(2, '0')).join('')}`;
}

function createBrandStyle(primaryColor: string, secondaryColor: string): CSSProperties {
  const primary = /^#[\da-f]{6}$/i.test(primaryColor) ? primaryColor : '#047857';
  return {
    '--color-emerald-50': blendHex(primary, '#ffffff', 0.96),
    '--color-emerald-100': blendHex(primary, '#ffffff', 0.9),
    '--color-emerald-200': blendHex(primary, '#ffffff', 0.78),
    '--color-emerald-300': blendHex(primary, '#ffffff', 0.63),
    '--color-emerald-400': blendHex(primary, '#ffffff', 0.46),
    '--color-emerald-500': blendHex(primary, '#ffffff', 0.3),
    '--color-emerald-600': blendHex(primary, '#ffffff', 0.13),
    '--color-emerald-700': primary,
    '--color-emerald-800': blendHex(primary, '#000000', 0.12),
    '--color-emerald-900': blendHex(primary, '#000000', 0.24),
    '--color-emerald-950': blendHex(primary, '#000000', 0.38),
    '--store-secondary-color': /^#[\da-f]{6}$/i.test(secondaryColor) ? secondaryColor : '#f59e0b',
  } as CSSProperties;
}

const ADMIN_NAV: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Painel geral', icon: LayoutDashboard },
  { id: 'pos', label: 'Vendas e retiradas', icon: ShoppingCart },
  { id: 'catalog', label: 'Catálogo', icon: Package },
  { id: 'accounts', label: 'Contas e fiado', icon: Users },
  { id: 'inventory', label: 'Estoque', icon: Boxes },
  { id: 'quick-report', label: 'Vendas do mês', icon: BarChart3 },
  { id: 'menu', label: 'Criar cardápio', icon: Utensils },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'settings', label: 'Loja e Pix', icon: Settings },
];

const TAB_TITLES: Record<AdminTab, { title: string; subtitle: string }> = {
  pending: { title: 'Pendências', subtitle: 'Vendas em aberto por cliente' },
  'quick-report': { title: 'Vendas do mês', subtitle: 'Resumo rápido das vendas realizadas' },
  customers: { title: 'Clientes', subtitle: 'Cadastro simples por nome' },
  dashboard: {
    title: 'Painel Administrativo',
    subtitle: 'Indicadores de faturamento, saldos em aberto e alertas de reposição',
  },
  pos: {
    title: 'Vendas e Retiradas',
    subtitle: 'Registro rápido de compras fiadas com baixa automática no estoque',
  },
  catalog: {
    title: 'Catálogo de Produtos',
    subtitle: 'Preços, categorias, disponibilidade e histórico de reajustes',
  },
  accounts: {
    title: 'Contas Individuais (Fiado)',
    subtitle: 'Extrato detalhado por cliente, cobrança Pix com QR Code e pagamentos',
  },
  inventory: {
    title: 'Controle de Estoque',
    subtitle: 'Entradas, ajustes justificados e histórico completo de movimentações',
  },
  menu: {
    title: 'Criar cardápio',
    subtitle: 'Gere uma imagem pronta para compartilhar no WhatsApp e no Status',
  },
  reports: {
    title: 'Relatórios e Fechamento',
    subtitle: 'Consultas por período, consumo individual e fechamentos semanais/mensais',
  },
  settings: {
    title: 'Configurações da Loja e Pix',
    subtitle: 'Dados da loja, Pix e programa de cartão fidelidade',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [storeType, setStoreType] = useState<StoreType>('complete');
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [focusedAccountId, setFocusedAccountId] = useState<number | null>(null);
  const [quickPayEmployeeId, setQuickPayEmployeeId] = useState<number | null>(null);
  const [restockProductId, setRestockProductId] = useState<number | null>(null);

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [dash, prods, emps, sls, stgs, loyalty] = await Promise.all([
        api.getDashboard(),
        api.getProducts(),
        api.getEmployees(),
        api.getSales(),
        api.getSettings(),
        api.getLoyaltySettings(),
      ]);
      setSummary(dash);
      setProducts(prods);
      setEmployees(emps);
      setSales(sls);
      if (stgs) {
        setStoreSettings(stgs);
      }
      setLoyaltySettings(loyalty);
    } catch (err) {
      setLoadError((err as Error).message || 'Falha ao conectar com o banco local SQLite.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.getStoreInfo().then((data) => { const type = data.store_type ?? 'complete'; setStoreType(type); if (type === 'lite') setActiveTab('pos'); if (data.store_name) setStoreSettings((current) => ({ ...current, store_name: data.store_name })); }).catch(() => undefined);
    fetch(apiUrl('/api/auth/status')).then((res) => res.json() as Promise<{ authenticated?: boolean }>).then((data) => setAuthenticated(Boolean(data.authenticated)))
      .catch(() => setAuthenticated(false)).finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (authenticated) refreshAll();
  }, [refreshAll, authenticated]);

  const handleNavigateFromDashboard = (tab: 'pos' | 'accounts' | 'inventory' | 'reports', employeeId?: number) => {
    if (employeeId) setFocusedAccountId(employeeId);
    setActiveTab(tab);
  };

  const handleQuickPay = (employeeId: number) => {
    setQuickPayEmployeeId(employeeId);
    setFocusedAccountId(employeeId);
    setActiveTab('accounts');
  };

  const handleRestockShortcut = (productId: number) => {
    setRestockProductId(productId);
    setActiveTab('inventory');
  };

  const handleOpenEmployeeAccount = (employeeId: number) => {
    setFocusedAccountId(employeeId);
    setActiveTab('accounts');
  };

  const lowStockCount = products.filter((p) => p.stock <= p.min_stock).length;
  const isMoreTabActive = activeTab === 'catalog' || activeTab === 'menu' || activeTab === 'reports' || activeTab === 'settings' || activeTab === 'pending' || activeTab === 'customers' || activeTab === 'quick-report';
  const visibleNav = storeType === 'lite' ? [{ id: 'pos' as const, label: 'PDV', icon: ShoppingCart }, { id: 'customers' as const, label: 'Clientes', icon: Users }, { id: 'inventory' as const, label: 'Estoque', icon: Boxes }, { id: 'pending' as const, label: 'Pendências', icon: Users }, { id: 'quick-report' as const, label: 'Relatório', icon: BarChart3 }] : ADMIN_NAV;
  const brandName = storeSettings.store_name || 'Tem o quê?';
  const brandStyle = createBrandStyle(storeSettings.brand_primary_color, storeSettings.brand_secondary_color);

  const renderBrandIcon = (sizeClass = 'w-5 h-5') =>
    storeSettings.logo_data_url ? (
      <img
        src={storeSettings.logo_data_url}
        alt={brandName}
        className="w-7 h-7 rounded-lg object-contain bg-slate-50 border border-slate-200 shrink-0"
      />
    ) : (
      <Store className={`${sizeClass} text-emerald-700 shrink-0`} />
    );

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError('');
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      setAuthenticated(true);
      setLoginPassword('');
    } catch (error) { setLoginError((error as Error).message); }
  };

  if (!authReady) return <div className="min-h-screen grid place-items-center bg-slate-50 text-sm text-slate-500">Carregando…</div>;
  if (!authenticated) return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4" style={brandStyle}>
      <form onSubmit={handleLogin} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center gap-3">{renderBrandIcon()}<div><p className="font-display text-lg font-bold">{brandName}</p><p className="text-xs text-slate-500">Acesso administrativo</p></div></div>
        <div><label htmlFor="admin-username" className="mb-1.5 block text-sm font-medium text-slate-700">Login</label><input id="admin-username" type="text" autoComplete="username" required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20" /></div>
        <div><label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-slate-700">Senha</label><input id="admin-password" type="password" autoComplete="current-password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20" /></div>
        {loginError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">{loginError}</p>}
        <button type="submit" className="h-12 w-full rounded-xl bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800">Entrar</button>
      </form>
    </main>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex" style={brandStyle}>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 no-print">
        <div className="h-16 px-6 flex items-center gap-2.5 border-b border-slate-200">
          {renderBrandIcon()}
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 truncate">
            {brandName}
          </span>
        </div>

        <div className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          <nav className="space-y-1" aria-label="Menu Administrativo">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-700 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'inventory' && lowStockCount > 0 && (
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        isActive ? 'text-amber-300' : 'text-amber-700'
                      }`}
                    >
                      {lowStockCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Workspace Header */}
        <header style={{ boxShadow: 'inset 0 -2px 0 var(--store-secondary-color)' }} className="h-14 sm:h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-3 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="lg:hidden">{renderBrandIcon()}</div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-slate-900 truncate">
                {TAB_TITLES[activeTab].title}
              </h1>
              <p className="hidden sm:block text-xs text-slate-500 truncate">
                {TAB_TITLES[activeTab].subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={async () => { const response = await fetch(apiUrl('/api/auth/logout'), { method: 'POST' }); const data = await response.json() as { authenticated?: boolean }; setAuthenticated(Boolean(data.authenticated)); }}
              className="min-h-[38px] px-2.5 sm:px-3 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
              aria-label="Sair da conta"
            >
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sair</span>
            </button>
            {activeTab !== 'pos' && (
              <button
                onClick={() => setActiveTab('pos')}
                className="px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] rounded-xl inline-flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[38px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar venda</span>
              </button>
            )}
          </div>
        </header>

        {/* Viewport Body */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-28 lg:pb-8 max-w-[1400px] w-full mx-auto">
          {loadError ? (
            <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm font-medium text-red-700">{loadError}</p>
              <button
                onClick={refreshAll}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-xl cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {storeType !== 'lite' && activeTab === 'dashboard' && (
                <DashboardView
                  summary={summary}
                  employees={employees}
                  loading={loading}
                  onNavigate={handleNavigateFromDashboard}
                  onRestockShortcut={handleRestockShortcut}
                  onQuickPay={handleQuickPay}
                />
              )}
              {storeType === 'lite' && activeTab === 'pending' && <PendingSalesView onDataChanged={refreshAll} />}
              {activeTab === 'quick-report' && <QuickMonthlySalesView storeType={storeType} />}
              {storeType === 'lite' && activeTab === 'customers' && <LiteCustomersView customers={employees} onDataChanged={refreshAll} />}
              {activeTab === 'pos' && (
                <PosSalesView
                  products={products}
                  employees={employees}
                  sales={sales}
                  loyaltySettings={loyaltySettings}
                  storeSettings={storeSettings}
                  storeType={storeType}
                  onDataChanged={refreshAll}
                />
              )}
              {storeType !== 'lite' && activeTab === 'catalog' && <CatalogView products={products} onDataChanged={refreshAll} />}
              {storeType !== 'lite' && activeTab === 'accounts' && (
                <AccountsView
                  employees={employees}
                  settings={storeSettings}
                  loyaltySettings={loyaltySettings}
                  initialEmployeeId={focusedAccountId}
                  quickPayEmployeeId={quickPayEmployeeId}
                  onClearQuickPay={() => setQuickPayEmployeeId(null)}
                  onOpenSettings={() => setActiveTab('settings')}
                  onDataChanged={refreshAll}
                />
              )}
              {activeTab === 'inventory' && (
                <InventoryView
                  storeType={storeType}
                  products={products}
                  preselectedProductId={restockProductId}
                  onClearPreselected={() => setRestockProductId(null)}
                  onDataChanged={refreshAll}
                />
              )}
              {storeType !== 'lite' && activeTab === 'reports' && <ReportsView onOpenEmployeeAccount={handleOpenEmployeeAccount} />}
              {storeType !== 'lite' && activeTab === 'menu' && <MenuView products={products} settings={storeSettings} />}
              {storeType !== 'lite' && activeTab === 'settings' && (
                <SettingsView settings={storeSettings} loyaltySettings={loyaltySettings} products={products} onSettingsUpdated={setStoreSettings} onLoyaltySettingsUpdated={setLoyaltySettings} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navegação rápida"
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200 grid ${storeType === 'lite' ? 'grid-cols-5' : 'grid-cols-5'} no-print`}
      >
        {(storeType === 'lite' ? [{ id: 'pos' as const, label: 'Vender', icon: ShoppingCart }, { id: 'customers' as const, label: 'Clientes', icon: Users }, { id: 'inventory' as const, label: 'Estoque', icon: Boxes, badge: lowStockCount }, { id: 'pending' as const, label: 'Devendo', icon: Users }, { id: 'quick-report' as const, label: 'Relatório', icon: BarChart3 }] : [
          { id: 'dashboard' as const, label: 'Início', icon: LayoutDashboard },
          { id: 'pos' as const, label: 'Vender', icon: ShoppingCart },
          { id: 'accounts' as const, label: 'Clientes', icon: Users },
          { id: 'inventory' as const, label: 'Estoque', icon: Boxes, badge: lowStockCount },
        ]).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setMoreSheetOpen(false);
                setActiveTab(item.id);
              }}
              className={`relative flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                active ? 'text-emerald-700 font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white text-[10px] font-mono tabular-nums font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-none">{item.label}</span>
            </button>
          );
        })}

        {storeType !== 'lite' && <button
          onClick={() => setMoreSheetOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
            isMoreTabActive || moreSheetOpen ? 'text-emerald-700 font-semibold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[11px] leading-none">Mais</span>
        </button>}
      </nav>

      {/* Mobile "Mais opções" Bottom Sheet */}
      <AnimatePresence>
        {storeType !== 'lite' && moreSheetOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreSheetOpen(false)}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="relative bg-white rounded-t-3xl p-5 pt-3 shadow-2xl space-y-4"
            >
              <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto" />

              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  {renderBrandIcon('w-4 h-4')}
                  <span className="font-display text-base font-bold text-slate-900">{brandName}</span>
                </div>
                <button
                  onClick={() => setMoreSheetOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
                  aria-label="Fechar menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <button onClick={() => { setActiveTab('quick-report'); setMoreSheetOpen(false); }} className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 flex items-center justify-between gap-3 text-slate-800">
                  <span className="flex items-center gap-3"><BarChart3 className="h-5 w-5 text-emerald-700"/><span className="text-left"><span className="block text-sm font-semibold">Vendas do mês</span><span className="block text-xs text-slate-500">Resumo rápido do mês atual</span></span></span><ChevronRight className="h-4 w-4 text-slate-400"/>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('catalog');
                    setMoreSheetOpen(false);
                  }}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer ${
                    activeTab === 'catalog'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">Catálogo de Produtos</p>
                      <p className="text-xs text-slate-500">Cadastrar itens, preços e disponibilidade</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    setActiveTab('menu');
                    setMoreSheetOpen(false);
                  }}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer ${
                    activeTab === 'menu'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Utensils className="w-5 h-5 text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">Criar cardápio</p>
                      <p className="text-xs text-slate-500">Gerar imagem para WhatsApp e Status</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    setActiveTab('reports');
                    setMoreSheetOpen(false);
                  }}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer ${
                    activeTab === 'reports'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">Relatórios e Fechamento</p>
                      <p className="text-xs text-slate-500">Consultar períodos e gerar fechamentos</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setMoreSheetOpen(false);
                  }}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer ${
                    activeTab === 'settings'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-emerald-700" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">Configurações da Loja e Pix</p>
                      <p className="text-xs text-slate-500">Logo, chave Pix e modelo de cobrança</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

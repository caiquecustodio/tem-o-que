import type {
  DashboardSummary,
  Employee,
  EmployeeStatement,
  LoyaltyProgress,
  LoyaltySettings,
  Payment,
  PeriodClosure,
  PeriodReport,
  PixKeyType,
  PriceHistoryEntry,
  Product,
  Sale,
  StockMovement,
  StoreSettings,
  StoreType,
} from '../types';

export interface StoreInfo { id: number; slug: string; store_name: string; username: string; store_type: StoreType; created_at: string }

export function getStorePathPrefix() {
  return window.location.pathname.match(/^\/s\/([a-z0-9-]+)/)?.[0] ?? '';
}

export function getStoreSlugFromPath() {
  return window.location.pathname.match(/^\/s\/([a-z0-9-]+)/)?.[1] ?? 'marlene';
}

export function apiUrl(path: string) {
  return `${getStorePathPrefix()}${path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`}`;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface BootstrapData {
  version: number | null;
  summary: DashboardSummary;
  products: Product[];
  employees: Employee[];
  sales: Sale[];
  settings: StoreSettings | null;
  loyalty: LoyaltySettings | null;
}
export type BootstrapResponse = BootstrapData | { unchanged: true; version: number | null };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const targetUrl = url.startsWith('/api/') ? apiUrl(url) : url;
  const res = await fetch(targetUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error || `Erro na requisição (${res.status})`, res.status);
  }
  return data as T;
}

export const api = {
  getBootstrap: (since: number | null) => request<BootstrapResponse>(since === null ? '/api/bootstrap' : `/api/bootstrap?since=${since}`),
  getStoreInfo: () => request<StoreInfo>('/api/store-info'),
  getCustomers: () => request<Employee[]>('/api/customers'),
  createCustomer: (name: string) => request<Employee>('/api/customers', { method: 'POST', body: JSON.stringify({ name }) }),
  getPendingSales: () => request<Sale[]>('/api/pending-sales'),
  settleSale: (id: number) => request<Sale>(`/api/sales/${id}/settle`, { method: 'POST' }),
  changePassword: (payload: { current_password: string; new_password: string; confirm_password: string }) =>
    request<{ updated: boolean }>('/api/auth/password', { method: 'POST', body: JSON.stringify(payload) }),
  getDashboard: () => request<DashboardSummary>('/api/dashboard'),

  getProducts: () => request<Product[]>('/api/products'),
  createProduct: (payload: {
    name: string;
    description: string;
    category: string;
    image_url: string;
    price_cents: number;
    stock: number;
    min_stock: number;
    available: number;
  }) => request<Product>('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (
    id: number,
    payload: {
      name: string;
      description: string;
      category: string;
      image_url: string;
      price_cents: number;
      min_stock: number;
      available: number;
      price_reason?: string;
    }
  ) => request<Product>(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteProduct: (id: number) => request<{ deleted: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),
  getPriceHistory: (productId?: number) =>
    request<PriceHistoryEntry[]>(productId ? `/api/price-history?productId=${productId}` : '/api/price-history'),

  adjustStock: (
    productId: number,
    payload: { type: 'entry' | 'adjustment'; quantity?: number; new_stock?: number; reason: string }
  ) => request<Product>(`/api/products/${productId}/stock`, { method: 'POST', body: JSON.stringify(payload) }),
  getStockMovements: () => request<StockMovement[]>('/api/stock-movements'),

  getEmployees: () => request<Employee[]>('/api/employees'),
  createEmployee: (payload: { name: string; code?: string; department: string; phone: string; email: string; pin?: string }) =>
    request<Employee>('/api/employees', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmployee: (
    id: number,
    payload: { name: string; code: string; department: string; phone: string; email: string; active: number }
  ) => request<Employee>(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getEmployeeStatement: (id: number) => request<EmployeeStatement>(`/api/employees/${id}/statement`),

  getSales: () => request<Sale[]>('/api/sales'),
  createSale: (payload: {
    employee_id: number;
    items: Array<{ product_id: number; quantity: number }>;
    notes?: string;
    created_by?: string;
    payment_status?: 'paid' | 'pending';
  }) => request<Sale>('/api/sales', { method: 'POST', body: JSON.stringify(payload) }),
  cancelSale: (id: number, reason: string) =>
    request<Sale>(`/api/sales/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  correctSale: (
    id: number,
    payload: {
      employee_id: number;
      items: Array<{ product_id: number; quantity: number }>;
      notes?: string;
      reason: string;
    }
  ) => request<Sale>(`/api/sales/${id}/correct`, { method: 'POST', body: JSON.stringify(payload) }),

  getPayments: () => request<Payment[]>('/api/payments'),
  createPayment: (payload: {
    employee_id: number;
    amount_cents: number;
    method: string;
    received_by?: string;
    notes?: string;
  }) => request<Payment>('/api/payments', { method: 'POST', body: JSON.stringify(payload) }),

  getReports: (startDate: string, endDate: string) =>
    request<PeriodReport>(`/api/reports?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
  createClosure: (payload: { period_label: string; start_date: string; end_date: string; notes?: string }) =>
    request<PeriodClosure>('/api/closures', { method: 'POST', body: JSON.stringify(payload) }),

  getSettings: () => request<StoreSettings>('/api/settings'),
  getLoyaltySettings: () => request<LoyaltySettings>('/api/loyalty/settings'),
  updateLoyaltySettings: (payload: Pick<LoyaltySettings, 'enabled' | 'mode' | 'card_title' | 'card_message' | 'card_color' | 'product_id' | 'product_quantity' | 'reward_quantity' | 'purchase_threshold' | 'reward_credits'>) =>
    request<LoyaltySettings>('/api/loyalty/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  getLoyaltyProgress: (employeeId: number) => request<LoyaltyProgress>(`/api/loyalty/cards/${employeeId}`),
  updateSettings: (payload: {
    store_name: string;
    logo_data_url: string;
    pix_key: string;
    pix_key_type: PixKeyType;
    pix_beneficiary_name: string;
    pix_city: string;
    billing_message_template: string;
    brand_primary_color: string;
    brand_secondary_color: string;
  }) => request<StoreSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) }),
};

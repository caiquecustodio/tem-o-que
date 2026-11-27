export type SaleStatus = 'active' | 'cancelled' | 'corrected';
export type StoreType = 'complete' | 'lite';
export type StockMovementType = 'entry' | 'sale' | 'sale_reversal' | 'adjustment';
export type PaymentMethod = 'Pix' | 'Dinheiro' | 'Desconto em Folha' | 'Transferência';
export type PixKeyType = 'auto' | 'telefone' | 'cpf_cnpj' | 'email' | 'aleatoria';

export interface StoreSettings {
  id: number;
  store_name: string;
  logo_data_url: string;
  pix_key: string;
  pix_key_type: PixKeyType;
  pix_beneficiary_name: string;
  pix_city: string;
  billing_message_template: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  whatsapp_phone?: string;
  updated_at: string;
}

export interface LoyaltySettings {
  id: number;
  enabled: number;
  mode: 'product' | 'general';
  card_title: string;
  card_message: string;
  card_color: string;
  product_id: number | null;
  product_quantity: number;
  reward_quantity: number;
  purchase_threshold: number;
  reward_credits: number;
  starts_at: string | null;
  updated_at: string;
}

export interface LoyaltyProgress {
  mode: 'product' | 'general';
  total_purchases: number;
  total_product_units: number;
  progress: number;
  target: number;
  rewards: number;
  credits: number;
  product_name: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  image_url: string;
  price_cents: number;
  cost_cents?: number | null;
  stock: number;
  min_stock: number;
  available: number;
  created_at: string;
  updated_at: string;
}

export interface PriceHistoryEntry {
  id: number;
  product_id: number;
  product_name?: string;
  old_price_cents: number;
  new_price_cents: number;
  reason: string;
  changed_by: string;
  created_at: string;
}

export interface Employee {
  id: number;
  name: string;
  code: string;
  department: string;
  phone: string;
  email: string;
  active: number;
  created_at: string;
  total_consumed_cents: number;
  total_paid_cents: number;
  balance_cents: number;
  last_activity_at: string | null;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
}

export interface Sale {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_department?: string;
  total_cents: number;
  status: SaleStatus;
  notes: string;
  corrected_from_sale_id: number | null;
  created_by: string;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  payment_status?: 'untracked' | 'paid' | 'pending';
  paid_at?: string | null;
  items: SaleItem[];
}

export interface Payment {
  id: number;
  employee_id: number;
  employee_name?: string;
  amount_cents: number;
  method: PaymentMethod | string;
  received_by: string;
  notes: string;
  balance_after_cents: number;
  created_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  product_category: string;
  type: StockMovementType;
  quantity_delta: number;
  stock_before: number;
  stock_after: number;
  reason: string;
  reference_id: number | null;
  created_by: string;
  created_at: string;
}

export interface LedgerEntry {
  uid: string;
  kind: 'sale' | 'payment';
  created_at: string;
  title: string;
  status?: SaleStatus;
  amount_cents: number;
  running_balance_cents: number;
  sale?: Sale;
  payment?: Payment;
}

export interface EmployeeStatement {
  employee: Employee;
  ledger: LedgerEntry[];
}

export interface TopProductMetric {
  product_id: number;
  product_name: string;
  category: string;
  units_sold: number;
  revenue_cents: number;
}

export interface DashboardSummary {
  total_revenue_cents: number;
  total_credit_sales_cents: number;
  total_received_cents: number;
  total_pending_cents: number;
  debtors_count: number;
  low_stock_products: Product[];
  top_products: TopProductMetric[];
  recent_sales: Sale[];
  recent_payments: Payment[];
  pending_orders?: number;
}

export interface PeriodClosure {
  id: number;
  period_label: string;
  start_date: string;
  end_date: string;
  total_sales_cents: number;
  total_received_cents: number;
  total_pending_cents: number;
  notes: string;
  closed_by: string;
  created_at: string;
}

export interface PeriodReport {
  start_date: string;
  end_date: string;
  total_sales_cents: number;
  active_sales_count: number;
  cancelled_sales_count: number;
  total_received_cents: number;
  payments_count: number;
  overall_pending_cents: number;
  employee_consumption: Array<{
    employee_id: number;
    employee_name: string;
    department: string;
    period_consumed_cents: number;
    period_paid_cents: number;
    current_balance_cents: number;
    purchases_count: number;
  }>;
  top_products: TopProductMetric[];
  sales: Sale[];
  payments: Payment[];
  stock_movements: StockMovement[];
  closures: PeriodClosure[];
}

export type OrderStatus = 'pending_review' | 'approved' | 'delivered' | 'rejected' | 'cancelled';

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  offer_id: number | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
}

export interface Order {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_phone?: string;
  status: OrderStatus;
  payment_choice: 'later' | 'pix_now';
  payment_state: 'none' | 'claimed' | 'confirmed';
  total_cents: number;
  notes: string;
  sale_id: number | null;
  created_at: string;
  items: OrderItem[];
}

export interface ReservationOffer {
  id: number;
  product_id: number;
  product_name: string;
  price_cents: number;
  service_date: string | null;
  limit_qty: number | null;
  closes_at: string | null;
  status: 'open' | 'closed';
  reserved_qty: number;
}

export interface ProductionRow {
  product_id: number;
  product_name: string;
  service_date: string | null;
  quantity: number;
  pending_quantity: number;
  orders_count: number;
}

export interface ProfitRow {
  product_id?: number;
  product_name?: string;
  day?: string;
  units: number;
  revenue_cents: number;
  revenue_with_cost_cents: number;
  cost_cents: number;
  profit_cents: number;
  lines_without_cost: number;
}

export interface ProfitReport {
  start_date: string;
  end_date: string;
  use_current_cost: boolean;
  revenue_cents: number;
  revenue_with_cost_cents: number;
  revenue_without_cost_cents: number;
  cost_cents: number;
  profit_cents: number;
  products_without_cost: number;
  by_product: ProfitRow[];
  by_day: ProfitRow[];
}

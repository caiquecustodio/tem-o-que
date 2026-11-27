/**
 * Reflete na tela as operações ainda não confirmadas pelo servidor.
 * Estado exibido = dados do servidor + operações da fila (queued e sent). Quando o servidor confirma e os
 * dados são recarregados, a operação sai da fila e o número passa a vir do servidor, sem contar duas vezes.
 * Valores de resumo são aproximações até a sincronização; estoque e saldos seguem a mesma regra do servidor.
 */
import type { DashboardSummary, Employee, Product, Sale } from '../types';
import type { OutboxOp } from './outbox';

export interface ServerState {
  summary: DashboardSummary | null;
  products: Product[];
  employees: Employee[];
  sales: Sale[];
}

const positive = (cents: number) => Math.max(0, cents);

function adjustEmployee(state: ServerState, employeeId: number, consumedDelta: number, paidDelta: number, stamp: string) {
  const before = state.employees.find((employee) => employee.id === employeeId);
  if (!before) return;
  const balanceDelta = consumedDelta - paidDelta;
  const after = before.balance_cents + balanceDelta;
  state.employees = state.employees.map((employee) => employee.id === employeeId ? {
    ...employee,
    total_consumed_cents: employee.total_consumed_cents + consumedDelta,
    total_paid_cents: employee.total_paid_cents + paidDelta,
    balance_cents: after,
    last_activity_at: stamp,
  } : employee);
  if (state.summary) {
    state.summary = {
      ...state.summary,
      total_pending_cents: state.summary.total_pending_cents + positive(after) - positive(before.balance_cents),
      debtors_count: state.summary.debtors_count + (after > 0 ? 1 : 0) - (before.balance_cents > 0 ? 1 : 0),
    };
  }
}

function applySaleCreate(state: ServerState, op: OutboxOp) {
  const meta = op.meta as {
    employee_id: number; employee_name: string; total_cents: number; notes: string; payment_status?: 'paid' | 'pending';
    items: Array<{ product_id: number; product_name: string; quantity: number; unit_price_cents: number }>;
  };
  const stamp = new Date(op.createdAt).toISOString();
  const soldByProduct = new Map(meta.items.map((item) => [item.product_id, item.quantity]));
  state.products = state.products.map((product) => soldByProduct.has(product.id) ? { ...product, stock: Math.max(0, product.stock - soldByProduct.get(product.id)!) } : product);
  const sale: Sale = {
    id: -op.createdAt, employee_id: meta.employee_id, employee_name: meta.employee_name, total_cents: meta.total_cents,
    status: 'active', notes: meta.notes, corrected_from_sale_id: null, created_by: 'Administrador', created_at: stamp,
    cancelled_at: null, cancel_reason: null, payment_status: meta.payment_status ?? 'untracked', paid_at: meta.payment_status === 'paid' ? stamp : null,
    items: meta.items.map((item, index) => ({ id: -(index + 1), sale_id: -op.createdAt, product_id: item.product_id, product_name: item.product_name, quantity: item.quantity, unit_price_cents: item.unit_price_cents, subtotal_cents: item.unit_price_cents * item.quantity })),
  };
  state.sales = [sale, ...state.sales];
  adjustEmployee(state, meta.employee_id, meta.total_cents, 0, stamp);
  if (state.summary) {
    state.summary = {
      ...state.summary,
      total_revenue_cents: state.summary.total_revenue_cents + meta.total_cents,
      total_credit_sales_cents: state.summary.total_credit_sales_cents + meta.total_cents,
      recent_sales: [sale, ...state.summary.recent_sales].slice(0, 6),
    };
  }
}

function applyPaymentCreate(state: ServerState, op: OutboxOp) {
  const meta = op.meta as { employee_id: number; amount_cents: number };
  adjustEmployee(state, meta.employee_id, 0, meta.amount_cents, new Date(op.createdAt).toISOString());
  if (state.summary) state.summary = { ...state.summary, total_received_cents: state.summary.total_received_cents + meta.amount_cents };
}

export function applyOptimistic(base: ServerState, ops: OutboxOp[]): ServerState {
  const active = ops.filter((op) => op.state !== 'failed' && (op.kind === 'sale.create' || op.kind === 'payment.create'));
  if (!active.length) return base;
  const state: ServerState = { ...base };
  for (const op of active) {
    if (op.kind === 'sale.create') applySaleCreate(state, op);
    else applyPaymentCreate(state, op);
  }
  return state;
}

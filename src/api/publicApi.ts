import { request } from './client';
import type { OrderItem } from '../types';

export interface PublicProduct { id: number; name: string; description: string; category: string; image_url: string; price_cents: number; sold_out: boolean }
export interface PublicOffer { id: number; product_id: number; service_date: string | null; closes_at: string | null; remaining: number | null }
export interface PublicCatalog { customer: { first_name: string }; products: PublicProduct[]; offers: PublicOffer[] }
export interface PublicOrder {
  id: number; status: 'pending_review' | 'approved' | 'delivered' | 'rejected' | 'cancelled';
  payment_choice: 'later' | 'pix_now'; payment_state: 'none' | 'claimed' | 'confirmed'; total_cents: number; notes: string; created_at: string; items: OrderItem[];
}
export interface PixInfo { store_name: string; pix_key: string; pix_key_type: string; pix_beneficiary_name: string; pix_city: string; whatsapp_phone: string }

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const publicApi = {
  config: () => request<{ store_name: string; turnstile_site_key: string | null }>('/api/public/config'),
  identify: (payload: { name: string; phone_last4: string; turnstile_token?: string }) => post<{ identified: boolean; first_name: string }>('/api/public/identify', payload),
  logout: () => post<{ identified: boolean }>('/api/public/logout'),
  catalog: () => request<PublicCatalog>('/api/public/catalog'),
  myOrders: () => request<PublicOrder[]>('/api/public/my-orders'),
  createOrder: (payload: { items: Array<{ product_id: number; offer_id?: number | null; quantity: number }>; payment_choice: 'later' | 'pix_now'; notes: string }) => post<PublicOrder>('/api/public/orders', payload),
  cancelOrder: (id: number) => post<{ ok: boolean }>(`/api/public/orders/${id}/cancel`),
  receiptSent: (id: number) => post<{ ok: boolean }>(`/api/public/orders/${id}/receipt-sent`),
  pixInfo: () => request<PixInfo>('/api/public/pix-info'),
};

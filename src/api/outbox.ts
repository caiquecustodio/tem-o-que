/**
 * Fila de operações pendentes (outbox) com persistência local.
 *
 * A tela muda na hora (ver optimistic.ts) e a gravação segue em segundo plano:
 * - cada operação tem um id único enviado como Idempotency-Key, então reenviar nunca duplica;
 * - falha de rede ou erro 5xx: continua na fila e tenta de novo com espera crescente;
 * - erro 4xx (ex.: estoque insuficiente): marcada como "failed" e mostrada ao usuário, nunca some em silêncio;
 * - a operação só sai da fila depois que os dados do servidor foram recarregados (purgeSent).
 */
import { useSyncExternalStore } from 'react';
import { apiUrl } from './client';
import { localCache } from './localCache';

export type OutboxKind = 'sale.create' | 'payment.create' | 'sale.settle';
export type OutboxState = 'queued' | 'sent' | 'failed';

export interface OutboxOp {
  id: string;
  kind: OutboxKind;
  label: string;
  path: string;
  body?: unknown;
  /** Dados que o reducer otimista precisa para refletir a operação na tela. */
  meta: Record<string, any>;
  state: OutboxState;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

export interface OutboxSnapshot { ops: OutboxOp[]; syncTick: number }

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;

let storageKey = '';
let ops: OutboxOp[] = [];
let syncTick = 0;
let snapshot: OutboxSnapshot = { ops, syncTick };
let draining = false;
let retryTimer: number | undefined;
let retryDelay = RETRY_MIN_MS;
let onSent: (() => void) | null = null;
const listeners = new Set<() => void>();
const waiters = new Map<string, (value: unknown) => void>();

function commit(next: OutboxOp[], bumpTick = false) {
  ops = next;
  if (bumpTick) syncTick += 1;
  snapshot = { ops, syncTick };
  if (storageKey) void localCache.set(storageKey, ops);
  listeners.forEach((listener) => listener());
}

function patchOp(id: string, patch: Partial<OutboxOp>) {
  commit(ops.map((op) => (op.id === id ? { ...op, ...patch } : op)));
}

function scheduleRetry() {
  if (retryTimer !== undefined) return;
  retryTimer = window.setTimeout(() => { retryTimer = undefined; void drain(); }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
}

async function drain() {
  if (draining || !storageKey) return;
  draining = true;
  let sentAny = false;
  try {
    for (const op of ops.filter((candidate) => candidate.state === 'queued')) {
      let response: Response;
      try {
        response = await fetch(apiUrl(op.path), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': op.id },
          body: op.body === undefined ? undefined : JSON.stringify(op.body),
        });
      } catch {
        scheduleRetry();
        return;
      }
      if (response.ok) {
        const data = await response.json().catch(() => null);
        retryDelay = RETRY_MIN_MS;
        sentAny = true;
        patchOp(op.id, { state: 'sent', sentAt: Date.now() });
        waiters.get(op.id)?.(data);
        waiters.delete(op.id);
        continue;
      }
      // Sessão expirada: espera o login (o drain roda de novo ao autenticar). Servidor instável: tenta depois.
      if (response.status === 401) return;
      if (response.status >= 500 || response.status === 429) { scheduleRetry(); return; }
      const data = await response.json().catch(() => ({})) as { error?: string };
      patchOp(op.id, { state: 'failed', error: data.error || `Não foi possível concluir (${response.status}).` });
      waiters.get(op.id)?.(null);
      waiters.delete(op.id);
    }
  } finally {
    draining = false;
    if (sentAny) onSent?.();
  }
}

export const outbox = {
  /** Carrega a fila salva desta loja e tenta enviar o que ficou pendente. */
  async init(storeSlug: string) {
    storageKey = `outbox:${storeSlug}`;
    const saved = await localCache.get<OutboxOp[]>(storageKey);
    if (Array.isArray(saved) && saved.length) commit([...saved, ...ops.filter((op) => !saved.some((s) => s.id === op.id))]);
    window.addEventListener('online', () => { retryDelay = RETRY_MIN_MS; void drain(); });
    void drain();
  },

  enqueue(input: { kind: OutboxKind; label: string; path: string; body?: unknown; meta: Record<string, any> }) {
    const op: OutboxOp = { id: crypto.randomUUID(), state: 'queued', createdAt: Date.now(), ...input };
    const result = new Promise<unknown>((resolve) => waiters.set(op.id, resolve));
    commit([...ops, op]);
    void drain();
    return { id: op.id, result };
  },

  /** Chamado pelo app quando algum envio foi confirmado, para recarregar os dados do servidor. */
  setSentHandler(handler: (() => void) | null) { onSent = handler; },
  /** Remove da fila o que o servidor já confirmou e que está refletido nos dados recarregados. */
  purgeSent(reloadedAfter: number) {
    const remaining = ops.filter((op) => !(op.state === 'sent' && (op.sentAt ?? 0) <= reloadedAfter));
    if (remaining.length !== ops.length) commit(remaining, true);
  },
  dismiss(id: string) { commit(ops.filter((op) => op.id !== id), true); },
  retryNow() { retryDelay = RETRY_MIN_MS; void drain(); },

  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => snapshot,
};

export function useOutbox(): OutboxSnapshot {
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);
}

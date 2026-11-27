export function formatBRL(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function parseBRLToCents(input: string): number {
  const cleaned = input.replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export const CATEGORY_OPTIONS = ['Sucos', 'Vitaminas', 'Trufas', 'Lanches & Bebidas'] as const;

const svgData = (art: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">${art}</svg>`)}`;

export const CATEGORY_IMAGES: Record<string, string> = {
  Sucos: svgData(`<rect width="160" height="160" rx="28" fill="#ecfdf5"/><circle cx="126" cy="35" r="20" fill="#d1fae5"/><path d="M56 40h50l-7 92H63z" fill="#fff" stroke="#047857" stroke-width="5" stroke-linejoin="round"/><path d="M61 78h41l-4 49H65z" fill="#fb923c"/><path d="m88 24 16 52" stroke="#047857" stroke-width="5" stroke-linecap="round"/><circle cx="111" cy="101" r="17" fill="#fef3c7" stroke="#f59e0b" stroke-width="4"/><circle cx="111" cy="101" r="5" fill="#f59e0b"/><path d="M36 119c9-12 17-12 26 0" fill="none" stroke="#10b981" stroke-width="5" stroke-linecap="round"/>`),
  Vitaminas: svgData(`<rect width="160" height="160" rx="28" fill="#fdf2f8"/><circle cx="32" cy="38" r="15" fill="#fce7f3"/><path d="M54 49h55l-7 82H61z" fill="#fff" stroke="#be185d" stroke-width="5" stroke-linejoin="round"/><path d="M59 77h45l-4 49H63z" fill="#f9a8d4"/><path d="m88 27 13 50" stroke="#be185d" stroke-width="5" stroke-linecap="round"/><path d="M52 49c0-12 13-21 29-21s29 9 29 21" fill="#fff" stroke="#be185d" stroke-width="5"/><circle cx="78" cy="96" r="10" fill="#fff" opacity=".8"/><circle cx="93" cy="112" r="5" fill="#fff"/>`),
  Trufas: svgData(`<rect width="160" height="160" rx="28" fill="#fff7ed"/><circle cx="63" cy="81" r="35" fill="#78350f" stroke="#92400e" stroke-width="5"/><circle cx="111" cy="103" r="29" fill="#a16207" stroke="#92400e" stroke-width="5"/><path d="M44 66c8-12 22-16 34-9" fill="none" stroke="#d6a56d" stroke-width="6" stroke-linecap="round"/><path d="M96 94c7-9 17-11 26-6" fill="none" stroke="#fcd34d" stroke-width="5" stroke-linecap="round"/><path d="M34 119h60l-8 17H42zM91 127h45l-6 13H97z" fill="#fbbf24"/><path d="m45 119 6 17m13-17 4 17m13-17 2 17m19-9 4 13m13-13 3 13" stroke="#fff7ed" stroke-width="3"/>`),
  'Lanches & Bebidas': svgData(`<rect width="160" height="160" rx="28" fill="#eff6ff"/><path d="M42 43h34l4 82H38z" fill="#fff" stroke="#2563eb" stroke-width="5" stroke-linejoin="round"/><path d="M48 43V31h22v12" fill="#bfdbfe" stroke="#2563eb" stroke-width="5" stroke-linejoin="round"/><path d="M44 82h32l2 39H42z" fill="#93c5fd"/><path d="M88 65h42l-7 15H93z" fill="#fbbf24" stroke="#b45309" stroke-width="4"/><path d="M94 80h32l-5 29H99z" fill="#fef3c7" stroke="#b45309" stroke-width="4"/><path d="M91 92h35" stroke="#16a34a" stroke-width="6"/><path d="m91 82 8-8m17 8 8-8" stroke="#b45309" stroke-width="3"/>`),
  Outros: svgData(`<rect width="160" height="160" rx="28" fill="#f1f5f9"/><path d="M47 47h66v75H47z" fill="#fff" stroke="#475569" stroke-width="5"/><path d="M57 66h46M57 81h46M57 96h30" stroke="#94a3b8" stroke-width="5" stroke-linecap="round"/>`),
};

/** Venda ainda não confirmada pelo servidor tem id negativo temporário. */
export const isSyncedId = (id: number) => id > 0;
export const saleRef = (id: number) => (id > 0 ? `#${id}` : 'Sincronizando');

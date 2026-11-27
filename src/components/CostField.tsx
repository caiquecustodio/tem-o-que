import { formatBRL, marginPercent, parseOptionalBRLToCents } from '../utils/format';

interface CostFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  /** Preço de venda em centavos, para mostrar lucro e margem por unidade. */
  priceCents?: number;
  hint?: string;
}

/** Custo de compra por unidade: opcional. Em branco = sem custo informado (o produto fica fora do cálculo de lucro). */
export function CostField({ label = 'Custo de compra (R$, opcional)', value, onChange, priceCents, hint }: CostFieldProps) {
  const cost = parseOptionalBRLToCents(value);
  const margin = priceCents !== undefined ? marginPercent(priceCents, cost) : null;
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Deixe em branco se não souber"
        className="w-full px-3 py-2.5 text-sm font-mono tabular-nums border border-slate-200 rounded-xl"
      />
      {cost !== null && priceCents !== undefined && margin !== null
        ? <p className="mt-1 text-xs text-slate-500">Lucro por unidade: <span className="font-mono tabular-nums">{formatBRL(priceCents - cost)}</span> ({margin.toFixed(0)}% de margem)</p>
        : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

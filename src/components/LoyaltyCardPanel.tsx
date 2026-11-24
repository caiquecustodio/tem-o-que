import { useEffect, useState } from 'react';
import { Download, Gift, LoaderCircle } from 'lucide-react';
import type { LoyaltyProgress, LoyaltySettings } from '../types';
import { generateLoyaltyCardImage } from '../utils/loyaltyCardImage';

interface LoyaltyCardPanelProps {
  config: LoyaltySettings;
  progress: LoyaltyProgress;
  customerName: string;
  storeName: string;
  logoDataUrl?: string;
}

export function LoyaltyCardPanel({ config, progress, customerName, storeName, logoDataUrl }: LoyaltyCardPanelProps) {
  const [image, setImage] = useState('');
  useEffect(() => {
    let current = true;
    generateLoyaltyCardImage({ config, progress, customerName, storeName, logoDataUrl })
      .then((url) => { if (current) setImage(url); })
      .catch(() => { if (current) setImage(''); });
    return () => { current = false; };
  }, [config, progress, customerName, storeName, logoDataUrl]);

  const download = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image;
    link.download = `cartao-fidelidade-${customerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'cliente'}.png`;
    link.click();
  };

  return (
    <section className="border-b border-slate-200 p-4 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-emerald-700" />
          <h3 className="text-sm font-semibold text-slate-900">Cartão fidelidade</h3>
        </div>
        <button type="button" onClick={download} disabled={!image} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {image ? <Download className="h-3.5 w-3.5" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          Baixar imagem
        </button>
      </div>
      {image ? <img src={image} alt={`Cartão fidelidade de ${customerName}`} className="w-full max-w-2xl rounded-2xl shadow-sm" /> : <div className="h-36 max-w-2xl animate-pulse rounded-2xl bg-slate-100" />}
    </section>
  );
}

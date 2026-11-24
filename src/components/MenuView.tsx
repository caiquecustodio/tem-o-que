import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Share2, Utensils } from 'lucide-react';
import type { Product, StoreSettings } from '../types';
import { CATEGORY_IMAGES, CATEGORY_OPTIONS, formatBRL } from '../utils/format';

interface MenuViewProps {
  products: Product[];
  settings: StoreSettings;
}

const WIDTH = 1080;
const MARGIN = 72;
const CARD_HEIGHT = 154;
const CARD_GAP = 18;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    let last = clipped[maxLines - 1] ?? '';
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    clipped[maxLines - 1] = `${last.trimEnd()}…`;
    return clipped;
  }
  return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar uma imagem do cardápio.'));
    image.src = src;
  });
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

export function MenuView({ products, settings }: MenuViewProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const available = useMemo(
    () => products.filter((product) => Boolean(product.available) && product.stock > 0),
    [products]
  );
  const groups = useMemo(() => {
    const categories = [...CATEGORY_OPTIONS, ...Array.from(new Set(available.map((product) => product.category)).values()).filter((category) => !CATEGORY_OPTIONS.includes(category as typeof CATEGORY_OPTIONS[number]))];
    return categories.map((category) => ({ category, items: available.filter((product) => product.category === category) })).filter((group) => group.items.length > 0);
  }, [available]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  const generateMenu = async () => {
    if (!available.length) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      await document.fonts.ready;
      const height = 386 + groups.reduce((sum, group) => sum + 82 + group.items.length * (CARD_HEIGHT + CARD_GAP), 0) + 146;
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível preparar a imagem do cardápio.');

      ctx.fillStyle = '#f5f7f2';
      ctx.fillRect(0, 0, WIDTH, height);
      const storeName = settings.store_name || 'Tem o quê?';
      const brandPrimaryColor = /^#[\da-f]{6}$/i.test(settings.brand_primary_color) ? settings.brand_primary_color : '#075344';
      ctx.fillStyle = brandPrimaryColor;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(WIDTH, 0); ctx.lineTo(WIDTH, 296);
      ctx.quadraticCurveTo(770, 370, 520, 320); ctx.quadraticCurveTo(230, 260, 0, 340); ctx.closePath(); ctx.fill();

      if (settings.logo_data_url) {
        try {
          const logo = await loadImage(settings.logo_data_url);
          ctx.save();
          roundedRect(ctx, MARGIN, 48, 112, 112, 24); ctx.clip();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(MARGIN, 48, 112, 112);
          const ratio = Math.min(92 / logo.width, 92 / logo.height);
          const w = logo.width * ratio, h = logo.height * ratio;
          ctx.drawImage(logo, MARGIN + (112 - w) / 2, 48 + (112 - h) / 2, w, h);
          ctx.restore();
        } catch { /* The menu remains usable if the optional logo cannot be read. */ }
      } else {
        ctx.fillStyle = '#d1fae5'; ctx.beginPath(); ctx.arc(MARGIN + 56, 104, 56, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = brandPrimaryColor; ctx.font = '700 44px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(storeName.slice(0, 1).toUpperCase(), MARGIN + 56, 120); ctx.textAlign = 'left';
      }

      const titleX = settings.logo_data_url ? MARGIN + 138 : MARGIN + 138;
      ctx.fillStyle = '#d1fae5'; ctx.font = '700 22px "Plus Jakarta Sans", sans-serif'; ctx.fillText('CARDÁPIO', titleX, 69);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 42px "Outfit", "Plus Jakarta Sans", sans-serif';
      const titleLines = wrapText(ctx, storeName, WIDTH - titleX - MARGIN, 2);
      drawLines(ctx, titleLines, titleX, 124, 48);
      ctx.fillStyle = '#d1fae5'; ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Escolha seus favoritos', titleX, 190);
      ctx.fillStyle = 'rgba(255,255,255,.14)'; roundedRect(ctx, MARGIN, 234, 338, 56, 28); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '600 19px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(`${available.length} ${available.length === 1 ? 'opção disponível' : 'opções disponíveis'}`, MARGIN + 22, 270);

      const artwork = await Promise.all(groups.map(async ({ category }) => {
        try { return [category, await loadImage(CATEGORY_IMAGES[category] || CATEGORY_IMAGES.Outros)] as const; }
        catch { return [category, null] as const; }
      }));
      const artworkByCategory = new Map(artwork);
      let y = 388;
      for (const group of groups) {
        ctx.fillStyle = brandPrimaryColor; ctx.beginPath(); ctx.arc(MARGIN + 15, y - 7, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#10251f'; ctx.font = '700 28px "Outfit", "Plus Jakarta Sans", sans-serif'; ctx.fillText(group.category, MARGIN + 38, y);
        ctx.fillStyle = '#cbd5d1'; ctx.fillRect(MARGIN, y + 18, WIDTH - MARGIN * 2, 2);
        y += 42;

        for (const product of group.items) {
          const cardX = MARGIN, cardY = y, cardW = WIDTH - MARGIN * 2;
          ctx.shadowColor = 'rgba(15, 23, 42, .06)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
          roundedRect(ctx, cardX, cardY, cardW, CARD_HEIGHT, 22); ctx.fillStyle = '#ffffff'; ctx.fill();
          ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
          const art = artworkByCategory.get(group.category);
          if (art) {
            ctx.save(); roundedRect(ctx, cardX + 18, cardY + 18, 118, 118, 18); ctx.clip();
            ctx.drawImage(art, cardX + 18, cardY + 18, 118, 118); ctx.restore();
          }
          const textX = cardX + 158, textW = 510;
          ctx.fillStyle = '#172a24'; ctx.font = '700 25px "Plus Jakarta Sans", sans-serif';
          drawLines(ctx, wrapText(ctx, product.name, textW, 2), textX, cardY + 43, 31);
          ctx.fillStyle = '#64756f'; ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
          drawLines(ctx, wrapText(ctx, product.description || 'Preparado com cuidado para você.', textW, 2), textX, cardY + 91, 25);
          ctx.fillStyle = brandPrimaryColor; ctx.textAlign = 'right'; ctx.font = '700 26px "Outfit", "Plus Jakarta Sans", sans-serif';
          ctx.fillText(formatBRL(product.price_cents), cardX + cardW - 22, cardY + 84); ctx.textAlign = 'left';
          y += CARD_HEIGHT + CARD_GAP;
        }
        y += 26;
      }

      const footerY = height - 104;
      ctx.fillStyle = '#dce7df'; ctx.fillRect(MARGIN, footerY - 28, WIDTH - MARGIN * 2, 2);
      ctx.fillStyle = '#40534b'; ctx.font = '500 18px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Consulte a disponibilidade. Preços podem ser atualizados.', WIDTH / 2, footerY + 12);
      ctx.fillStyle = brandPrimaryColor; ctx.font = '700 18px "Plus Jakarta Sans", sans-serif'; ctx.fillText(storeName, WIDTH / 2, footerY + 44); ctx.textAlign = 'left';

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Não foi possível salvar a imagem gerada.');
      setImageBlob(blob);
      setImageUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError((err as Error).message || 'Não foi possível gerar o cardápio.');
    } finally { setGenerating(false); }
  };

  const downloadMenu = () => {
    if (!imageUrl) return;
    const link = document.createElement('a'); link.href = imageUrl; link.download = 'cardapio-marlene-interprise.png'; link.click();
  };

  const shareMenu = async () => {
    if (!imageBlob) return;
    const file = new File([imageBlob], 'cardapio-marlene-interprise.png', { type: 'image/png' });
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      downloadMenu();
      setNotice('Imagem baixada. Anexe o PNG no WhatsApp ou publique no Status.');
      return;
    }
    setSharing(true); setNotice(null);
    try { await navigator.share({ files: [file], title: settings.store_name || 'Cardápio', text: `Confira o cardápio da ${settings.store_name || 'loja'}!` }); }
    catch (err) { if ((err as DOMException).name !== 'AbortError') setError('Não foi possível abrir o menu de compartilhamento. Baixe a imagem para enviá-la.'); }
    finally { setSharing(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-800 p-5 sm:p-8 text-white shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0"><Utensils className="w-6 h-6 text-emerald-100" /></div>
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold">Seu cardápio pronto para compartilhar</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-100">Gere uma imagem vertical com os produtos disponíveis, preços e descrições. No celular, compartilhe direto pelo menu do aparelho para WhatsApp ou Status.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <button onClick={generateMenu} disabled={generating || available.length === 0} className="min-h-12 px-5 rounded-xl bg-white text-emerald-950 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
            <Utensils className="w-4 h-4" />{generating ? 'Montando imagem…' : 'Gerar imagem do cardápio'}
          </button>
          <p className="text-xs text-emerald-100">{available.length} {available.length === 1 ? 'produto com estoque' : 'produtos com estoque'}</p>
        </div>
        {available.length === 0 && <p className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-sm text-emerald-50">Não há produtos disponíveis com estoque. Registre uma entrada no Estoque para montar o cardápio.</p>}
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}

      {imageUrl && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><h3 className="text-base font-semibold text-slate-900">Prévia do cardápio</h3><p className="text-xs text-slate-500 mt-1">Imagem PNG vertical, com os {available.length} itens.</p></div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={shareMenu} disabled={sharing} className="min-h-10 px-3 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" />{sharing ? 'Abrindo…' : 'Compartilhar'}</button>
              <button onClick={downloadMenu} className="min-h-10 px-3 rounded-xl bg-slate-100 text-slate-800 text-xs font-semibold hover:bg-slate-200 inline-flex items-center justify-center gap-1.5"><Download className="w-4 h-4" />Baixar PNG</button>
            </div>
          </div>
          <div className="max-h-[75vh] overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3 flex justify-center">
            <img src={imageUrl} alt={`Cardápio completo da ${settings.store_name}`} className="block w-full max-w-[540px] h-auto rounded-lg shadow-sm" />
          </div>
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-700" />No computador, baixe a imagem e anexe no WhatsApp Web.</p>
        </section>
      )}
    </div>
  );
}

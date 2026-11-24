import type { LoyaltyProgress, LoyaltySettings } from '../types';

interface LoyaltyCardImageParams {
  config: LoyaltySettings;
  progress: LoyaltyProgress;
  customerName: string;
  storeName: string;
  logoDataUrl?: string;
}

export async function generateLoyaltyCardImage({ config, progress, customerName, storeName, logoDataUrl }: LoyaltyCardImageParams): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível montar o cartão fidelidade.');

  const color = /^#[\da-f]{6}$/i.test(config.card_color) ? config.card_color : '#047857';
  const gradient = ctx.createLinearGradient(0, 0, 960, 560);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(0, 0, 960, 560, 42);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath();
  ctx.arc(900, 20, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(20, 570, 160, 0, Math.PI * 2);
  ctx.fill();

  if (logoDataUrl) {
    try {
      const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('logo'));
        img.src = logoDataUrl;
      });
      ctx.save();
      ctx.beginPath();
      ctx.arc(82, 82, 38, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.fillRect(44, 44, 76, 76);
      ctx.drawImage(logo, 48, 48, 68, 68);
      ctx.restore();
    } catch {
      // Card remains usable when an optional logo cannot be loaded.
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,.78)';
  ctx.font = '600 22px Arial, sans-serif';
  ctx.fillText(storeName.slice(0, 40), 145, 78);
  ctx.fillStyle = '#fff';
  ctx.font = '700 42px Arial, sans-serif';
  ctx.fillText(config.card_title.slice(0, 38), 54, 158);
  ctx.font = '500 24px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.86)';
  ctx.fillText(customerName.slice(0, 48), 54, 207);

  const target = Math.max(1, progress.target);
  const dots = Math.min(target, 10);
  const filled = Math.min(dots, Math.floor((progress.progress / target) * dots));
  const dotY = 316;
  const dotGap = 62;
  const dotStart = 54;
  for (let i = 0; i < dots; i += 1) {
    const x = dotStart + i * dotGap;
    ctx.beginPath();
    ctx.arc(x + 18, dotY, 20, 0, Math.PI * 2);
    ctx.fillStyle = i < filled ? '#facc15' : 'rgba(255,255,255,.24)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (i < filled) {
      ctx.fillStyle = '#422006';
      ctx.font = '700 17px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', x + 18, dotY + 6);
      ctx.textAlign = 'left';
    }
  }

  const progressLine = progress.mode === 'product'
    ? `${progress.progress} de ${progress.target} ${progress.product_name}`
    : `${progress.progress} de ${progress.target} compras`;
  ctx.fillStyle = '#fff';
  ctx.font = '700 25px Arial, sans-serif';
  ctx.fillText(progressLine.slice(0, 55), 54, 382);
  ctx.font = '600 23px Arial, sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText(progress.mode === 'product' ? `Recompensas: ${progress.rewards * config.reward_quantity} unidade(s)` : `Créditos conquistados: ${progress.credits}`, 54, 430);

  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.font = '500 19px Arial, sans-serif';
  ctx.fillText(config.card_message.slice(0, 76), 54, 492);
  ctx.font = '500 16px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.64)';
  ctx.fillText('Apresente este cartão nas próximas compras', 54, 530);

  return canvas.toDataURL('image/png');
}

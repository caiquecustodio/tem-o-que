import QRCode from 'qrcode';
import { formatBRL } from './format';

export interface PixCardImageParams {
  storeName: string;
  brandPrimaryColor?: string;
  logoDataUrl?: string;
  clientName: string;
  amountCents: number;
  pixKey: string;
  pixPayload: string;
  summaryLines?: string[];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Renders a crisp, high-resolution branded Pix billing card image (PNG data URL + Blob)
 * containing store logo, client name, amount due, scannable EMV QR Code, and printed Pix key.
 */
export async function generatePixBillingCardImage(params: PixCardImageParams): Promise<{
  dataUrl: string;
  blob: Blob;
}> {
  const width = 900;
  const summaryCount = Math.min(4, params.summaryLines?.length ?? 0);
  const height = summaryCount > 0 ? 1160 + summaryCount * 32 : 1060;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível neste navegador.');
  }
  const brandColor = /^#[\da-f]{6}$/i.test(params.brandPrimaryColor ?? '') ? params.brandPrimaryColor! : '#065F46';

  // Outer clean canvas background
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  // Main Card Container
  const cardX = 40;
  const cardY = 40;
  const cardW = width - 80;
  const cardH = height - 80;
  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Top Brand Banner
  const headerH = 176;
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, headerH, 32);
  ctx.clip();
  ctx.fillStyle = brandColor;
  ctx.fillRect(cardX, cardY, cardW, headerH);
  ctx.restore();
  // Square bottom edge of header
  ctx.fillStyle = brandColor;
  ctx.fillRect(cardX, cardY + headerH - 32, cardW, 32);

  // Store Logo or Monogram Emblem
  const logoImg = params.logoDataUrl ? await loadImage(params.logoDataUrl) : null;
  const logoSize = 96;
  const logoX = cardX + 48;
  const logoY = cardY + (headerH - logoSize) / 2;

  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 22);
  ctx.fill();

  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, logoX + 4, logoY + 4, logoSize - 8, logoSize - 8, 18);
    ctx.clip();
    const scale = Math.min((logoSize - 12) / logoImg.width, (logoSize - 12) / logoImg.height);
    const drawW = logoImg.width * scale;
    const drawH = logoImg.height * scale;
    ctx.drawImage(
      logoImg,
      logoX + (logoSize - drawW) / 2,
      logoY + (logoSize - drawH) / 2,
      drawW,
      drawH
    );
    ctx.restore();
  } else {
    const initial = (params.storeName || 'M').trim().charAt(0).toUpperCase();
    ctx.fillStyle = brandColor;
    ctx.font = '700 44px "Outfit", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, logoX + logoSize / 2, logoY + logoSize / 2 + 2);
  }

  // Store Title & Subtitle in Header
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 34px "Outfit", system-ui, sans-serif';
  ctx.fillText(params.storeName || 'Tem o quê?', logoX + logoSize + 28, cardY + 84);

  ctx.fillStyle = '#A7F3D0';
  ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Pagamento via Pix · Acerto de conta', logoX + logoSize + 28, cardY + 122);

  // Client & Amount Section
  let cursorY = cardY + headerH + 56;
  ctx.fillStyle = '#64748B';
  ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Cliente', cardX + 48, cursorY);

  ctx.textAlign = 'right';
  ctx.fillText('Valor a pagar', cardX + cardW - 48, cursorY);

  cursorY += 44;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
  const clientNameFit = params.clientName.length > 26 ? `${params.clientName.slice(0, 25)}…` : params.clientName;
  ctx.fillText(clientNameFit, cardX + 48, cursorY);

  ctx.textAlign = 'right';
  ctx.fillStyle = brandColor;
  ctx.font = '700 42px "JetBrains Mono", monospace';
  ctx.fillText(formatBRL(params.amountCents), cardX + cardW - 48, cursorY);

  // Hairline divider
  cursorY += 32;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 48, cursorY);
  ctx.lineTo(cardX + cardW - 48, cursorY);
  ctx.stroke();

  // QR Code Box
  cursorY += 40;
  const qrBoxSize = 420;
  const qrBoxX = (width - qrBoxSize) / 2;
  const qrBoxY = cursorY;

  ctx.fillStyle = '#FFFFFF';
  drawRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 24);
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (params.pixPayload) {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, params.pixPayload, {
      width: 372,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    });
    ctx.drawImage(qrCanvas, qrBoxX + 24, qrBoxY + 24, 372, 372);
  } else {
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Configure a Chave Pix', width / 2, qrBoxY + qrBoxSize / 2);
  }

  // Printed Pix Key Highlight Box directly under QR
  cursorY = qrBoxY + qrBoxSize + 34;
  const keyBoxX = cardX + 48;
  const keyBoxW = cardW - 96;
  const keyBoxH = 112;

  ctx.fillStyle = '#F1F5F9';
  drawRoundedRect(ctx, keyBoxX, cursorY, keyBoxW, keyBoxH, 20);
  ctx.fill();
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#475569';
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Chave Pix para transferência', width / 2, cursorY + 38);

  ctx.fillStyle = '#0F172A';
  const keyText = params.pixKey || 'Chave não configurada';
  const keyFontSize = keyText.length > 34 ? 22 : 28;
  ctx.font = `700 ${keyFontSize}px "JetBrains Mono", monospace`;
  ctx.fillText(keyText, width / 2, cursorY + 80);

  cursorY += keyBoxH + 36;

  // Optional Items Summary
  if (summaryCount > 0 && params.summaryLines) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('Últimas retiradas na conta:', cardX + 48, cursorY);
    cursorY += 30;

    ctx.fillStyle = '#334155';
    ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
    for (const line of params.summaryLines.slice(0, 4)) {
      const wrapped = wrapText(ctx, line, cardW - 96);
      ctx.fillText(wrapped[0] ?? line, cardX + 48, cursorY);
      cursorY += 28;
    }
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    'Abra o aplicativo do seu banco e escolha pagar com Pix QR Code ou Copia e Cola.',
    width / 2,
    cardY + cardH - 36
  );

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Falha ao gerar arquivo PNG.'));
    }, 'image/png');
  });

  return { dataUrl, blob };
}

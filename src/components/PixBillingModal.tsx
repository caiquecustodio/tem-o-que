import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  MessageCircle,
  QrCode,
  Settings,
  Share2,
  X,
} from 'lucide-react';
import type { EmployeeStatement, StoreSettings } from '../types';
import { formatBRL, parseBRLToCents } from '../utils/format';
import { buildBillingMessage, buildPixPayload } from '../utils/pix';
import { generatePixBillingCardImage } from '../utils/pixCardImage';

interface PixBillingModalProps {
  statement: EmployeeStatement;
  settings: StoreSettings;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function PixBillingModal({
  statement,
  settings,
  onClose,
  onOpenSettings,
}: PixBillingModalProps) {
  const initialCents = Math.max(0, statement.employee.balance_cents);
  const [amountStr, setAmountStr] = useState((initialCents / 100).toFixed(2).replace('.', ','));
  const [cardImageUrl, setCardImageUrl] = useState<string>('');
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [generating, setGenerating] = useState(true);

  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedCopyPaste, setCopiedCopyPaste] = useState(false);
  const [copiedImg, setCopiedImg] = useState<'idle' | 'ok' | 'unsupported'>('idle');

  const amountCents = useMemo(() => parseBRLToCents(amountStr), [amountStr]);

  const summaryLines = useMemo(() => {
    return statement.ledger
      .filter((l) => l.kind === 'sale' && l.status === 'active')
      .slice(0, 6)
      .map((s) => {
        const itemsTxt = s.sale?.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ') ?? '';
        return `- ${itemsTxt} (${formatBRL(s.amount_cents)})`;
      });
  }, [statement]);

  const pixPayload = useMemo(() => {
    if (!settings.pix_key.trim()) return '';
    return buildPixPayload({
      pixKey: settings.pix_key,
      keyType: settings.pix_key_type,
      beneficiaryName: settings.pix_beneficiary_name || settings.store_name,
      city: settings.pix_city || 'SAO PAULO',
      amountCents: amountCents > 0 ? amountCents : undefined,
      txid: `MARLENE${statement.employee.id}`,
    });
  }, [settings, amountCents, statement.employee.id]);

  const generatedMessage = useMemo(
    () =>
      buildBillingMessage({
        settings,
        clientName: statement.employee.name,
        amountCents,
        summaryLines,
        pixCopyPaste: pixPayload,
      }),
    [settings, statement.employee.name, amountCents, summaryLines, pixPayload]
  );

  const [customMessage, setCustomMessage] = useState(generatedMessage);

  useEffect(() => {
    setCustomMessage(generatedMessage);
  }, [generatedMessage]);

  useEffect(() => {
    let active = true;
    setGenerating(true);
    generatePixBillingCardImage({
      storeName: settings.store_name || 'Tem o quê?',
      brandPrimaryColor: settings.brand_primary_color,
      logoDataUrl: settings.logo_data_url,
      clientName: statement.employee.name,
      amountCents,
      pixKey: settings.pix_key,
      pixPayload,
      summaryLines: summaryLines.map((l) => l.replace(/^- /, '')),
    })
      .then(({ dataUrl, blob }) => {
        if (active) {
          setCardImageUrl(dataUrl);
          setCardBlob(blob);
          setGenerating(false);
        }
      })
      .catch(() => {
        if (active) setGenerating(false);
      });

    return () => {
      active = false;
    };
  }, [settings, statement.employee.name, amountCents, pixPayload, summaryLines]);

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(customMessage).catch(() => {});
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  const handleCopyPixCode = async () => {
    if (!pixPayload) return;
    await navigator.clipboard.writeText(pixPayload).catch(() => {});
    setCopiedCopyPaste(true);
    setTimeout(() => setCopiedCopyPaste(false), 2500);
  };

  const handleCopyImage = async () => {
    if (!cardBlob) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': cardBlob })]);
        setCopiedImg('ok');
        setTimeout(() => setCopiedImg('idle'), 2500);
        return;
      }
    } catch {
      // fall back below
    }
    setCopiedImg('unsupported');
    setTimeout(() => setCopiedImg('idle'), 3000);
  };

  const handleNativeShare = async () => {
    if (!cardBlob || typeof navigator.share !== 'function') return;
    const file = new File([cardBlob], `cobranca-pix-${statement.employee.code}.png`, { type: 'image/png' });
    const shareData: ShareData = {
      title: `Cobrança ${settings.store_name}`,
      text: customMessage,
      files: [file],
    };
    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share(shareData);
      } else {
        await navigator.share({ title: `Cobrança ${settings.store_name}`, text: customMessage });
      }
    } catch {
      // user cancelled share
    }
  };

  const whatsappUrl = useMemo(() => {
    const digits = (statement.employee.phone || '').replace(/\D/g, '');
    const fullPhone = digits.length >= 10 && !digits.startsWith('55') ? `55${digits}` : digits;
    const encoded = encodeURIComponent(customMessage);
    return fullPhone ? `https://wa.me/${fullPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  }, [statement.employee.phone, customMessage]);

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasPixKey = Boolean(settings.pix_key.trim());

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 no-print">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <QrCode className="w-5 h-5 text-emerald-700 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                Cobrança Pix — {statement.employee.name}
              </h3>
              <p className="text-xs text-slate-500">
                Imagem com QR Code + mensagem com chave e Pix Copia e Cola
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {!hasPixKey && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-900 space-y-0.5">
                <p className="font-semibold">Nenhuma Chave Pix configurada ainda.</p>
                <p>Cadastre sua Chave Pix (CPF, telefone, e-mail ou aleatória) para gerar QR Codes reais de recebimento.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Settings className="w-3.5 h-3.5" />
                Configurar Pix agora
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Generated QR Card Image & Image Actions */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">Valor da cobrança (R$)</label>
                <input
                  type="text"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-32 px-3 py-1.5 text-sm font-mono tabular-nums font-semibold text-right border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                {generating && !cardImageUrl ? (
                  <div className="h-80 flex items-center justify-center text-xs text-slate-500">
                    Gerando imagem do QR Code...
                  </div>
                ) : (
                  <img
                    src={cardImageUrl}
                    alt={`QR Code Pix de ${statement.employee.name}`}
                    className="w-full h-auto block"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={cardImageUrl || '#'}
                  download={`cobranca-pix-${statement.employee.name.toLowerCase().replace(/\s+/g, '-')}.png`}
                  className={`py-2.5 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[40px] ${
                    !cardImageUrl ? 'pointer-events-none opacity-50' : ''
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar imagem
                </a>

                <button
                  type="button"
                  onClick={handleCopyImage}
                  disabled={!cardBlob}
                  className="py-2.5 px-3 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap min-h-[40px]"
                >
                  {copiedImg === 'ok' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedImg === 'ok'
                    ? 'Imagem copiada!'
                    : copiedImg === 'unsupported'
                    ? 'Use Baixar PNG'
                    : 'Copiar imagem'}
                </button>
              </div>

              {canNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Compartilhar imagem + mensagem
                </button>
              )}
            </div>

            {/* Right Column: Billing Message + Pix Copia e Cola */}
            <div className="lg:col-span-7 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Mensagem de cobrança (com Chave Pix e Copia e Cola)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Editar modelo
                  </button>
                </div>

                <textarea
                  rows={10}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  className="w-full p-3.5 text-sm border border-slate-200 rounded-2xl leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>

              {pixPayload && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">Código Pix Copia e Cola</span>
                    <button
                      type="button"
                      onClick={handleCopyPixCode}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCopyPaste ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedCopyPaste ? 'Código copiado!' : 'Copiar só o código'}
                    </button>
                  </div>
                  <p className="text-[11px] font-mono text-slate-600 break-all select-all leading-relaxed">
                    {pixPayload}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="flex-1 py-3 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
                >
                  {copiedMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedMsg ? 'Mensagem copiada!' : 'Copiar mensagem completa'}
                </button>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 px-4 text-xs font-semibold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 rounded-xl inline-flex items-center justify-center gap-2 whitespace-nowrap min-h-[44px]"
                >
                  <MessageCircle className="w-4 h-4" />
                  Abrir no WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Gift, ImagePlus, KeyRound, Palette, QrCode, RotateCcw, Save, Store, Trash2 } from 'lucide-react';
import type { LoyaltyProgress, LoyaltySettings, PixKeyType, Product, StoreSettings } from '../types';
import { api } from '../api/client';
import { buildBillingMessage, buildPixPayload, DEFAULT_BILLING_TEMPLATE, normalizePixKey } from '../utils/pix';
import { generatePixBillingCardImage } from '../utils/pixCardImage';
import { generateLoyaltyCardImage } from '../utils/loyaltyCardImage';

interface SettingsViewProps {
  settings: StoreSettings | null;
  loyaltySettings: LoyaltySettings | null;
  products: Product[];
  onSettingsUpdated: (updated: StoreSettings) => void;
  onLoyaltySettingsUpdated: (updated: LoyaltySettings) => void;
}

const DEFAULT_LOYALTY: LoyaltySettings = {
  id: 1, enabled: 0, mode: 'product', card_title: 'Cartão fidelidade',
  card_message: 'Junte pontos e ganhe recompensas!', card_color: '#047857',
  product_id: null, product_quantity: 5, reward_quantity: 1,
  purchase_threshold: 5, reward_credits: 5, starts_at: null, updated_at: '',
};

const KEY_TYPE_OPTIONS: Array<{ value: PixKeyType; label: string; hint: string }> = [
  { value: 'auto', label: 'Detectar automaticamente', hint: 'CPF, CNPJ, E-mail, Telefone ou Chave Aleatória' },
  { value: 'telefone', label: 'Telefone / WhatsApp', hint: 'Ex.: (11) 99999-0000' },
  { value: 'cpf_cnpj', label: 'CPF ou CNPJ', hint: 'Ex.: 123.456.789-00' },
  { value: 'email', label: 'E-mail', hint: 'Ex.: financeiro@loja.com.br' },
  { value: 'aleatoria', label: 'Chave aleatória (EVP)', hint: 'Ex.: 123e4567-e89b-12d3-a456-426614174000' },
];

const TEMPLATE_VARS: Array<{ token: string; label: string }> = [
  { token: '{cliente}', label: 'Nome do cliente' },
  { token: '{valor}', label: 'Valor devido' },
  { token: '{chave_pix}', label: 'Chave Pix' },
  { token: '{copia_e_cola}', label: 'Pix Copia e Cola' },
  { token: '{loja}', label: 'Nome da loja' },
  { token: '{resumo}', label: 'Itens retirados' },
];

async function resizeLogoFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      el.src = objectUrl;
    });

    const maxSide = 256;
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Falha ao processar imagem.');
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function SettingsView({ settings, loyaltySettings, products, onSettingsUpdated, onLoyaltySettingsUpdated }: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<'store' | 'pix' | 'loyalty' | 'billing' | 'security'>('store');
  const [storeName, setStoreName] = useState(settings?.store_name || 'Marlene Interprise');
  const [logoDataUrl, setLogoDataUrl] = useState(settings?.logo_data_url || '');
  const [pixKey, setPixKey] = useState(settings?.pix_key || '');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>(settings?.pix_key_type || 'auto');
  const [beneficiaryName, setBeneficiaryName] = useState(settings?.pix_beneficiary_name || 'MARLENE INTERPRISE');
  const [city, setCity] = useState(settings?.pix_city || 'SAO PAULO');
  const [template, setTemplate] = useState(settings?.billing_message_template || DEFAULT_BILLING_TEMPLATE);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(settings?.brand_primary_color || '#047857');
  const [brandSecondaryColor, setBrandSecondaryColor] = useState(settings?.brand_secondary_color || '#f59e0b');
  const [loyaltyDraft, setLoyaltyDraft] = useState<LoyaltySettings>(loyaltySettings ?? DEFAULT_LOYALTY);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltyFeedback, setLoyaltyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loyaltyPreviewUrl, setLoyaltyPreviewUrl] = useState('');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewCardUrl, setPreviewCardUrl] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setStoreName(settings.store_name || 'Marlene Interprise');
      setLogoDataUrl(settings.logo_data_url || '');
      setPixKey(settings.pix_key || '');
      setPixKeyType(settings.pix_key_type || 'auto');
      setBeneficiaryName(settings.pix_beneficiary_name || 'MARLENE INTERPRISE');
      setCity(settings.pix_city || 'SAO PAULO');
      setTemplate(settings.billing_message_template || DEFAULT_BILLING_TEMPLATE);
      setBrandPrimaryColor(settings.brand_primary_color || '#047857');
      setBrandSecondaryColor(settings.brand_secondary_color || '#f59e0b');
    }
  }, [settings]);

  useEffect(() => {
    if (loyaltySettings) setLoyaltyDraft(loyaltySettings);
  }, [loyaltySettings]);

  const normalizedKey = useMemo(() => normalizePixKey(pixKey, pixKeyType), [pixKey, pixKeyType]);

  const samplePayload = useMemo(() => {
    if (!normalizedKey) return '';
    return buildPixPayload({
      pixKey,
      keyType: pixKeyType,
      beneficiaryName,
      city,
      amountCents: 2450,
      txid: 'MARLENEEXEMPLO',
    });
  }, [normalizedKey, pixKey, pixKeyType, beneficiaryName, city]);

  const draftSettings: StoreSettings = useMemo(
    () => ({
      id: 1,
      store_name: storeName.trim() || 'Marlene Interprise',
      logo_data_url: logoDataUrl,
      pix_key: pixKey.trim(),
      pix_key_type: pixKeyType,
      pix_beneficiary_name: beneficiaryName.trim() || 'MARLENE INTERPRISE',
      pix_city: city.trim() || 'SAO PAULO',
      billing_message_template: template,
      brand_primary_color: brandPrimaryColor,
      brand_secondary_color: brandSecondaryColor,
      updated_at: new Date().toISOString(),
    }),
    [storeName, logoDataUrl, pixKey, pixKeyType, beneficiaryName, city, template, brandPrimaryColor, brandSecondaryColor]
  );

  const sampleMessage = useMemo(
    () =>
      buildBillingMessage({
        settings: draftSettings,
        clientName: 'Ana Paula Silva',
        amountCents: 2450,
        summaryLines: ['- 1× Suco de Maracujá (R$ 7,00)', '- 1× Vitamina de Morango (R$ 9,00)', '- 1× Trufa de Ninho com Nutella (R$ 5,50)'],
        pixCopyPaste: samplePayload,
      }),
    [draftSettings, samplePayload]
  );

  useEffect(() => {
    let active = true;
    generatePixBillingCardImage({
      storeName: draftSettings.store_name,
      brandPrimaryColor: draftSettings.brand_primary_color,
      logoDataUrl: draftSettings.logo_data_url,
      clientName: 'Ana Paula Silva',
      amountCents: 2450,
      pixKey: draftSettings.pix_key,
      pixPayload: samplePayload,
      summaryLines: ['1× Suco de Maracujá · 1× Vitamina de Morango'],
    })
      .then(({ dataUrl }) => {
        if (active) setPreviewCardUrl(dataUrl);
      })
      .catch(() => {
        if (active) setPreviewCardUrl('');
      });
    return () => {
      active = false;
    };
  }, [draftSettings, samplePayload]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback(null);
    try {
      const resized = await resizeLogoFile(file);
      setLogoDataUrl(resized);
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await api.updateSettings({
        store_name: storeName.trim() || 'Marlene Interprise',
        logo_data_url: logoDataUrl,
        pix_key: pixKey.trim(),
        pix_key_type: pixKeyType,
        pix_beneficiary_name: beneficiaryName.trim() || 'MARLENE INTERPRISE',
        pix_city: city.trim() || 'SAO PAULO',
        billing_message_template: template,
        brand_primary_color: brandPrimaryColor,
        brand_secondary_color: brandSecondaryColor,
      });
      onSettingsUpdated(updated);
      setFeedback({ type: 'success', text: 'Configurações da loja e Pix salvas com sucesso.' });
    } catch (err) {
      setFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLoyalty = async () => {
    setLoyaltySaving(true);
    setLoyaltyFeedback(null);
    try {
      const updated = await api.updateLoyaltySettings({
        enabled: loyaltyDraft.enabled,
        mode: loyaltyDraft.mode,
        card_title: loyaltyDraft.card_title,
        card_message: loyaltyDraft.card_message,
        card_color: loyaltyDraft.card_color,
        product_id: loyaltyDraft.product_id,
        product_quantity: loyaltyDraft.product_quantity,
        reward_quantity: loyaltyDraft.reward_quantity,
        purchase_threshold: loyaltyDraft.purchase_threshold,
        reward_credits: loyaltyDraft.reward_credits,
      });
      setLoyaltyDraft(updated);
      onLoyaltySettingsUpdated(updated);
      setLoyaltyFeedback({ type: 'success', text: updated.enabled ? 'Programa fidelidade salvo e atualizado.' : 'Programa fidelidade desativado.' });
    } catch (err) {
      setLoyaltyFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setLoyaltySaving(false);
    }
  };

  useEffect(() => {
    let active = true;
    const previewProgress: LoyaltyProgress = loyaltyDraft.mode === 'product'
      ? { mode: 'product', total_purchases: 2, total_product_units: 2, progress: Math.min(2, loyaltyDraft.product_quantity - 1), target: loyaltyDraft.product_quantity, rewards: 0, credits: 0, product_name: products.find((product) => product.id === loyaltyDraft.product_id)?.name ?? 'Produto' }
      : { mode: 'general', total_purchases: 2, total_product_units: 0, progress: Math.min(2, loyaltyDraft.purchase_threshold - 1), target: loyaltyDraft.purchase_threshold, rewards: 0, credits: 0, product_name: '' };
    generateLoyaltyCardImage({ config: loyaltyDraft, progress: previewProgress, customerName: 'Nome do cliente', storeName: storeName || 'Sua loja', logoDataUrl })
      .then((url) => { if (active) setLoyaltyPreviewUrl(url); })
      .catch(() => { if (active) setLoyaltyPreviewUrl(''); });
    return () => { active = false; };
  }, [loyaltyDraft, products, storeName, logoDataUrl]);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setChangingPassword(true);
    setPasswordFeedback(null);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({ type: 'success', text: 'Senha alterada. Use a nova senha no próximo login.' });
    } catch (err) {
      setPasswordFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setChangingPassword(false);
    }
  };

  const selectedTypeHint = KEY_TYPE_OPTIONS.find((o) => o.value === pixKeyType)?.hint ?? '';

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl border text-sm flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      <nav aria-label="Seções da gestão da loja" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:grid-cols-3 lg:grid-cols-5">
        {([
          { id: 'store', label: 'Loja e aparência', icon: Store },
          { id: 'pix', label: 'Pix', icon: QrCode },
          { id: 'loyalty', label: 'Fidelidade', icon: Gift },
          { id: 'billing', label: 'Cobrança', icon: CheckCircle2 },
          ...(import.meta.env.PROD ? [{ id: 'security' as const, label: 'Segurança', icon: KeyRound }] : []),
        ] as const).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveSection(id)} aria-current={activeSection === id ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${activeSection === id ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Settings Form */}
        <div className={`${activeSection === 'loyalty' || activeSection === 'pix' ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6`}>
          {/* Store Identity & Logo */}
          {activeSection === 'store' && <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <Store className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-semibold text-slate-900">Identidade e logotipo da loja</h2>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-20 h-20 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="Logo da loja" className="w-full h-full object-contain p-1.5" />
                ) : (
                  <Store className="w-8 h-8 text-emerald-700" />
                )}
              </div>

              <div className="space-y-2 flex-1">
                <p className="text-xs text-slate-600 leading-relaxed">
                  A logo aparece no cabeçalho do sistema e no topo da imagem de cobrança Pix gerada para os clientes.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    {logoDataUrl ? 'Trocar logo' : 'Enviar logo'}
                  </button>
                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoDataUrl('')}
                      className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-xl inline-flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nome da loja</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Ex.: Marlene Interprise"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Cores da loja</h3>
                <p className="mt-0.5 text-xs text-slate-500">A cor principal personaliza a interface; a secundária destaca o cabeçalho.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <span><span className="block text-xs font-semibold text-slate-700">Cor principal</span><span className="font-mono text-[11px] text-slate-500">{brandPrimaryColor}</span></span>
                  <input aria-label="Cor principal da loja" type="color" value={brandPrimaryColor} onChange={(e) => setBrandPrimaryColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <span><span className="block text-xs font-semibold text-slate-700">Cor secundária</span><span className="font-mono text-[11px] text-slate-500">{brandSecondaryColor}</span></span>
                  <input aria-label="Cor secundária da loja" type="color" value={brandSecondaryColor} onChange={(e) => setBrandSecondaryColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                </label>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <button type="button" style={{ backgroundColor: brandPrimaryColor }} className="rounded-lg px-3 py-2 text-xs font-semibold text-white">Botão da loja</button>
                <div style={{ boxShadow: `inset 0 -3px 0 ${brandSecondaryColor}` }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">Prévia do cabeçalho</div>
                <button type="button" onClick={() => { setBrandPrimaryColor('#047857'); setBrandSecondaryColor('#f59e0b'); }} className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900">Restaurar padrão</button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Salvando cores…' : 'Salvar cores'}
                </button>
                {feedback && <p role="status" className={`text-xs ${feedback.type === 'success' ? 'text-emerald-800' : 'text-red-700'}`}>{feedback.text}</p>}
              </div>
            </div>
          </section>}

          {/* Pix Configuration */}
          {activeSection === 'pix' && <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <QrCode className="w-4 h-4 text-emerald-700" />
              <h2 className="text-base font-semibold text-slate-900">Configuração da Chave Pix</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de chave Pix</label>
                <select
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  {KEY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sua Chave Pix</label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder={selectedTypeHint}
                  className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
              </div>
            </div>

            {pixKey.trim() && (
              <p className="text-xs text-slate-500">
                Chave codificada no QR Code:{' '}
                <span className="font-mono font-semibold text-slate-800">{normalizedKey}</span>
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do recebedor (até 25 caracteres)</label>
                <input
                  type="text"
                  maxLength={25}
                  value={beneficiaryName}
                  onChange={(e) => setBeneficiaryName(e.target.value)}
                  placeholder="MARLENE INTERPRISE"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cidade do recebedor</label>
                <input
                  type="text"
                  maxLength={15}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="SAO PAULO"
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>
          </section>}

          {/* Loyalty Program */}
          {activeSection === 'loyalty' && <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <Gift className="h-4 w-4 text-emerald-700" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Cartão fidelidade</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Configure a regra e a imagem que será atualizada nas compras.</p>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={Boolean(loyaltyDraft.enabled)} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, enabled: e.target.checked ? 1 : 0 }))} className="h-4 w-4 accent-emerald-700" />
                Ativar
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Tipo de fidelidade</label>
                <select value={loyaltyDraft.mode} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, mode: e.target.value as LoyaltySettings['mode'] }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                  <option value="product">Por produto</option>
                  <option value="general">Por compras gerais</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Cor principal do cartão</label>
                <div className="flex h-[42px] items-center gap-3 rounded-xl border border-slate-200 px-3">
                  <input type="color" value={loyaltyDraft.card_color} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, card_color: e.target.value }))} className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0" />
                  <span className="font-mono text-xs text-slate-600">{loyaltyDraft.card_color}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Título do cartão</label>
                <input maxLength={48} value={loyaltyDraft.card_title} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, card_title: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Ex.: Clube do Cuscuz" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Mensagem no cartão</label>
                <input maxLength={120} value={loyaltyDraft.card_message} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, card_message: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Ex.: Obrigado por comprar com a gente!" />
              </div>
            </div>

            {loyaltyDraft.mode === 'product' ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-3">
                <p className="text-xs font-semibold text-emerald-950">Exemplo: compre X unidades do produto escolhido e ganhe Y de recompensa.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Produto da promoção</label>
                    <select value={loyaltyDraft.product_id ?? ''} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, product_id: e.target.value ? Number(e.target.value) : null }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                      <option value="">Selecione um produto</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">A cada quantas unidades?</label>
                    <input type="number" min={1} max={10000} value={loyaltyDraft.product_quantity} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, product_quantity: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Quantas ganha?</label>
                    <input type="number" min={1} max={10000} value={loyaltyDraft.reward_quantity} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, reward_quantity: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-3">
                <p className="text-xs font-semibold text-emerald-950">Defina quantas compras contam para liberar créditos.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">A cada quantas compras?</label>
                    <input type="number" min={1} max={10000} value={loyaltyDraft.purchase_threshold} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, purchase_threshold: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Quantos créditos ganha?</label>
                    <input type="number" min={1} max={10000} value={loyaltyDraft.reward_credits} onChange={(e) => setLoyaltyDraft((current) => ({ ...current, reward_credits: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
            )}

            {loyaltyFeedback && <p role="status" className={`rounded-xl px-3 py-2.5 text-xs ${loyaltyFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{loyaltyFeedback.text}</p>}
            <button type="button" onClick={handleSaveLoyalty} disabled={loyaltySaving || (Boolean(loyaltyDraft.enabled) && loyaltyDraft.mode === 'product' && !loyaltyDraft.product_id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="h-4 w-4" />{loyaltySaving ? 'Salvando cartão...' : 'Salvar cartão fidelidade'}
            </button>
          </section>}

          {/* Billing Message Template */}
          {activeSection === 'billing' && <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">Mensagem padrão de cobrança</h2>
              <button
                type="button"
                onClick={() => setTemplate(DEFAULT_BILLING_TEMPLATE)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar padrão
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => setTemplate((prev) => `${prev}${prev.endsWith(' ') || prev.endsWith('\n') || !prev ? '' : ' '}${v.token}`)}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition-colors"
                >
                  + {v.label}
                </button>
              ))}
            </div>

            <textarea
              rows={8}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px]"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Salvando alterações...' : 'Salvar configurações'}
              </button>
            </div>
          </section>}

          {import.meta.env.PROD && activeSection === 'security' && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <KeyRound className="w-4 h-4 text-emerald-700" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Segurança da conta</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Altere a senha usada para entrar no sistema.</p>
                </div>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-3.5">
                <div>
                  <label htmlFor="current-password" className="block text-xs font-semibold text-slate-700 mb-1">Senha atual</label>
                  <input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1">Nova senha</label>
                    <input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">Confirme a nova senha</label>
                    <input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
                  </div>
                </div>
                {passwordFeedback && <p role="status" className={`text-xs rounded-xl px-3 py-2.5 ${passwordFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{passwordFeedback.text}</p>}
                <button type="submit" disabled={changingPassword || newPassword.length < 12 || newPassword !== confirmPassword} className="min-h-[42px] px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl cursor-pointer">
                  {changingPassword ? 'Alterando senha…' : 'Alterar senha'}
                </button>
              </form>
            </section>
          )}
        </div>

        {/* Right: Live Preview of Card Image + Message */}
        {(activeSection === 'loyalty' || activeSection === 'pix') && <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20">
          {activeSection === 'loyalty' && <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Prévia do cartão fidelidade</h3>
            {loyaltyPreviewUrl ? <img src={loyaltyPreviewUrl} alt="Prévia do cartão fidelidade" className="w-full rounded-xl border border-slate-200" /> : <div className="h-36 animate-pulse rounded-xl bg-slate-100" />}
            <p className="text-xs text-slate-500">A imagem de cada cliente acompanha o progresso das compras registradas.</p>
          </div>}
          {activeSection === 'pix' && <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Prévia da imagem de cobrança Pix</h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">Exemplo R$ 24,50</span>
            </div>

            {previewCardUrl ? (
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={previewCardUrl}
                  alt="Prévia do cartão QR Code Pix"
                  className="w-full h-auto block"
                />
              </div>
            ) : (
              <div className="h-64 rounded-2xl bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                Gerando prévia...
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">Prévia da mensagem com Pix Copia e Cola</p>
              <pre className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap break-all font-sans leading-relaxed max-h-56 overflow-y-auto">
                {sampleMessage}
              </pre>
            </div>
          </div>}
        </div>}
      </div>
    </div>
  );
}

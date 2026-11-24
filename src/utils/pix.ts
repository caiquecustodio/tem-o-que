import type { PixKeyType, StoreSettings } from '../types';
import { formatBRL } from './format';

export const DEFAULT_BILLING_TEMPLATE = [
  'Olá, {cliente}! Tudo bem?',
  '',
  'Segue o resumo da sua conta na *{loja}*:',
  'Valor em aberto: *{valor}*',
  '',
  '{resumo}',
  '',
  'Chave Pix: {chave_pix}',
  '',
  'Pix Copia e Cola (cole no app do seu banco):',
  '{copia_e_cola}',
].join('\n');

function stripAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '');
}

/**
 * Normalizes a Brazilian Pix key for EMV QR Code compliance so banking apps recognize it reliably.
 */
export function normalizePixKey(rawKey: string, keyType: PixKeyType = 'auto'): string {
  const trimmed = rawKey.trim();
  if (!trimmed) return '';

  // UUID / EVP key
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (keyType === 'aleatoria' || uuidRegex.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Email
  if (keyType === 'email' || trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, '');

  // Explicit or detected phone
  if (keyType === 'telefone') {
    if (trimmed.startsWith('+')) {
      return `+${digits}`;
    }
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      return `+${digits}`;
    }
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }
    return `+${digits}`;
  }

  // Explicit CPF / CNPJ
  if (keyType === 'cpf_cnpj') {
    return digits;
  }

  // Auto-detection for numeric keys
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (/^\(\d{2}\)/.test(trimmed)) {
    // Formatted like (11) 99999-0000 -> Phone
    return digits.startsWith('55') && digits.length >= 12 ? `+${digits}` : `+55${digits}`;
  }
  if (digits.length === 14) {
    // CNPJ
    return digits;
  }
  if (digits.length === 11) {
    // If formatted with dots/hyphen like 123.456.789-00 -> CPF
    if (trimmed.includes('.')) {
      return digits;
    }
    // 11 digits with 9 as 3rd digit (e.g. 11999998888) and no dots -> likely mobile phone unless user typed pure CPF;
    // keep raw digits if no formatting hints, or if spaces/hyphens only like 11 99999-8888 treat as phone
    if (trimmed.includes(' ') || (trimmed.includes('-') && !trimmed.includes('.'))) {
      return `+55${digits}`;
    }
    return digits;
  }
  if (digits.length === 10) {
    return `+55${digits}`;
  }

  return trimmed;
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16CCITT(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface BuildPixPayloadOptions {
  pixKey: string;
  keyType?: PixKeyType;
  beneficiaryName: string;
  city: string;
  amountCents?: number;
  txid?: string;
  description?: string;
}

/**
 * Generates a valid Banco Central do Brasil Pix EMV BR Code ("Pix Copia e Cola") string.
 */
export function buildPixPayload(options: BuildPixPayloadOptions): string {
  const normalizedKey = normalizePixKey(options.pixKey, options.keyType ?? 'auto');
  if (!normalizedKey) return '';

  const merchantName = stripAccents(options.beneficiaryName || 'MARLENE INTERPRISE')
    .toUpperCase()
    .trim()
    .slice(0, 25) || 'LOJA';

  const merchantCity = stripAccents(options.city || 'SAO PAULO')
    .toUpperCase()
    .trim()
    .slice(0, 15) || 'SAO PAULO';

  const cleanTxid =
    stripAccents(options.txid || '***')
      .replace(/[^a-zA-Z0-9*]/g, '')
      .slice(0, 25) || '***';

  // ID 26: Merchant Account Information (GUI + Key + optional short description)
  let mai = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', normalizedKey);
  if (options.description) {
    const cleanDesc = stripAccents(options.description).trim().slice(0, Math.max(0, 72 - mai.length - 4));
    if (cleanDesc) {
      mai += tlv('02', cleanDesc);
    }
  }

  let payload = '';
  payload += tlv('00', '01'); // Payload Format Indicator
  payload += tlv('26', mai); // Merchant Account Information
  payload += tlv('52', '0000'); // Merchant Category Code
  payload += tlv('53', '986'); // Currency BRL

  if (options.amountCents && options.amountCents > 0) {
    const amountStr = (options.amountCents / 100).toFixed(2);
    payload += tlv('54', amountStr);
  }

  payload += tlv('58', 'BR'); // Country Code
  payload += tlv('59', merchantName); // Merchant Name
  payload += tlv('60', merchantCity); // Merchant City
  payload += tlv('62', tlv('05', cleanTxid)); // Additional Data Field (TXID)
  payload += '6304'; // CRC16 header

  return payload + crc16CCITT(payload);
}

export function buildBillingMessage(params: {
  settings: StoreSettings;
  clientName: string;
  amountCents: number;
  summaryLines: string[];
  pixCopyPaste: string;
}): string {
  const { settings, clientName, amountCents, summaryLines, pixCopyPaste } = params;
  const template = settings.billing_message_template?.trim() || DEFAULT_BILLING_TEMPLATE;
  const summaryText =
    summaryLines.length > 0 ? summaryLines.join('\n') : '- Sem itens pendentes detalhados';
  const pixKeyText = settings.pix_key?.trim() || '(Chave Pix não configurada)';
  const copyPasteText = pixCopyPaste || '(Configure uma Chave Pix nas configurações da loja)';

  return template
    .replace(/\{cliente\}/g, clientName)
    .replace(/\{valor\}/g, formatBRL(amountCents))
    .replace(/\{loja\}/g, settings.store_name || 'Tem o quê?')
    .replace(/\{chave_pix\}/g, pixKeyText)
    .replace(/\{copia_e_cola\}/g, copyPasteText)
    .replace(/\{resumo\}/g, summaryText);
}

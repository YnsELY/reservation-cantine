/** Moroccan local mobile numbers are accepted; other countries use +country code. */
export function normalizeWhatsAppPhone(input: string): string | null {
  let value = input.trim().replace(/[\s().-]/g, '');
  if (value.startsWith('00')) value = '+' + value.slice(2);
  if (/^0[67]\d{8}$/.test(value)) value = '+212' + value.slice(1);
  return /^\+[1-9]\d{7,14}$/.test(value) ? value : null;
}

export type WhatsAppRole = 'parent' | 'provider';

export interface WalletReceipt {
  order_id: string;
  parent_name: string;
  confirmed_at: string;
  wallet_used: number;
  wallet_remaining: number;
  order_total: number;
  items: { date: string; child: { first_name?: string; last_name?: string }; meal: string; amount: number; supplements?: unknown }[];
}

const clean = (text: string, max = 150) => text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max);
const money = (value: number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('invalid_receipt_amount');
  return amount.toFixed(2).replace('.', ',') + ' DH';
};

/** The approved template labels wallet amounts as the complete order's amounts.
 * Provider meal details are filtered in SQL; sensitive annotations are excluded. */
export function walletTemplatePayload(phone: string, template: string, language: string, receipt: WalletReceipt) {
  if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^[a-z0-9_]+$/.test(template)) throw new Error('invalid_destination_or_template');
  if (!Array.isArray(receipt.items) || !receipt.items.length) throw new Error('empty_receipt');
  const lines = receipt.items.map(item => {
    const [year, month, day] = item.date.split('-');
    const extras = Array.isArray(item.supplements) ? item.supplements : [];
    const names = extras.filter(s => s && typeof s.name === 'string').map(s => clean(s.name, 35));
    return `${day}/${month}/${year} : ${clean([item.child?.first_name, item.child?.last_name].filter(Boolean).join(' '), 60)} — ${clean(item.meal || 'Repas', 70)}${names.length ? ' + ' + names.join(', ') : ''} (${money(item.amount)})`;
  });
  // Template body parameters do not support arbitrary newlines. Keep within the
  // approved template size and identify omitted meals instead of hiding them.
  const included: string[] = [];
  for (const line of lines) {
    if ([...included, line].join(' ; ').length > 360) break;
    included.push(line);
  }
  const omitted = lines.length - included.length;
  const summary = included.join(' ; ') + (omitted ? `${included.length ? ' ; et ' : ''}${omitted} ${included.length ? 'autre(s) ' : ''}repas, détails dans l’application` : '');
  const values = [clean(receipt.parent_name, 80), clean(receipt.order_id, 70), summary,
    money(receipt.order_total), money(receipt.wallet_used), money(receipt.wallet_remaining)];
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: phone.slice(1), type: 'template',
    template: { name: template, language: { code: language }, components: [{ type: 'body', parameters: values.map(text => ({ type: 'text', text })) }] },
  };
}

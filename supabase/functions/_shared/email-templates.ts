export interface OrderConfirmationItem {
  childFirstName: string;
  childLastName?: string;
  mealName: string;
  date: string;
  totalPrice: number;
  supplements?: ({ name?: string; price?: number } | string)[];
  annotations?: string | null;
}

export interface SignupConfirmationTemplateData {
  parentFirstName: string;
  appBaseUrl?: string;
}

export interface OrderConfirmationTemplateData {
  parentFirstName: string;
  orderId: string;
  totalAmount: number;
  paidAt?: string;
  paymentReference?: string | null;
  items: OrderConfirmationItem[];
  appBaseUrl?: string;
}

export interface TransactionalEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPrice(value: number): string {
  return `${Number(value || 0).toFixed(2)} MAD`;
}

function formatDate(value?: string, includeTime: boolean = false): string {
  if (!value) return 'Non precisee';

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  const options: Intl.DateTimeFormatOptions = includeTime
    ? {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Europe/Paris',
      }
    : {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Paris',
      };

  return new Intl.DateTimeFormat('fr-FR', options).format(parsedDate);
}

function formatSupplements(supplements?: ({ name?: string; price?: number } | string)[]): string {
  if (!supplements?.length) return 'Aucun supplement';

  return supplements
    .map((supplement) => {
      if (typeof supplement === 'string') {
        return supplement;
      }

      const name = supplement.name?.trim() || 'Supplement';
      if (typeof supplement.price === 'number') {
        return `${name} (${formatPrice(supplement.price)})`;
      }

      return name;
    })
    .join(', ');
}

function buildEmailShell(params: {
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote: string;
}): string {
  const ctaHtml =
    params.ctaLabel && params.ctaUrl
      ? `
        <tr>
          <td style="padding: 0 32px 32px 32px;">
            <a
              href="${escapeHtml(params.ctaUrl)}"
              style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 14px 22px; border-radius: 999px; font-weight: 700;"
            >
              ${escapeHtml(params.ctaLabel)}
            </a>
          </td>
        </tr>
      `
      : '';

  return `
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(params.title)}</title>
      </head>
      <body style="margin: 0; padding: 24px; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; color: #111827;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
          ${escapeHtml(params.preheader)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 640px; margin: 0 auto; border-collapse: collapse;">
          <tr>
            <td style="padding-bottom: 16px; text-align: center; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #6b7280;">
              ${escapeHtml(params.eyebrow)}
            </td>
          </tr>
          <tr>
            <td style="background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 12px 32px rgba(17, 24, 39, 0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                <tr>
                  <td style="padding: 32px 32px 16px 32px; background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%);">
                    <div style="display: inline-block; padding: 8px 14px; border-radius: 999px; background: #111827; color: #ffffff; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                      Child's Kitchen
                    </div>
                    <h1 style="margin: 20px 0 12px 0; font-size: 30px; line-height: 1.15; color: #111827;">
                      ${escapeHtml(params.title)}
                    </h1>
                    <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #374151;">
                      ${escapeHtml(params.intro)}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    ${params.bodyHtml}
                  </td>
                </tr>
                ${ctaHtml}
                <tr>
                  <td style="padding: 0 32px 32px 32px; font-size: 13px; line-height: 1.7; color: #6b7280;">
                    ${escapeHtml(params.footerNote)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function buildSignupConfirmationTemplate(
  data: SignupConfirmationTemplateData
): TransactionalEmailTemplate {
  const firstName = data.parentFirstName.trim() || 'Parent';
  const subject = "Bienvenue sur Child's Kitchen";

  const html = buildEmailShell({
    preheader: 'Votre compte parent est actif. Vous pouvez maintenant reserver les repas de vos enfants.',
    eyebrow: 'Confirmation d inscription',
    title: 'Votre compte parent est pret',
    intro: `Bonjour ${firstName}, votre inscription a bien ete enregistree.`,
    bodyHtml: `
      <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.8; color: #374151;">
        Vous pouvez maintenant ajouter vos enfants, consulter les menus disponibles et passer vos prochaines commandes en quelques minutes.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 18px 20px; border: 1px solid #fde68a; border-radius: 18px; background: #fffbeb; font-size: 14px; line-height: 1.7; color: #92400e;">
            Pensez a verifier vos informations dans votre profil pour recevoir correctement vos confirmations de commande.
          </td>
        </tr>
      </table>
    `,
    ctaLabel: data.appBaseUrl ? 'Ouvrir l application' : undefined,
    ctaUrl: data.appBaseUrl,
    footerNote: "Email automatique envoye par Child's Kitchen. Si vous n etes pas a l origine de cette inscription, contactez le support.",
  });

  const text = [
    `Bonjour ${firstName},`,
    '',
    "Votre inscription sur Child's Kitchen a bien ete confirmee.",
    'Vous pouvez maintenant ajouter vos enfants, consulter les menus et passer vos commandes.',
    data.appBaseUrl ? `Acceder a l application : ${data.appBaseUrl}` : '',
    '',
    "Email automatique envoye par Child's Kitchen.",
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

export function buildOrderConfirmationTemplate(
  data: OrderConfirmationTemplateData
): TransactionalEmailTemplate {
  const firstName = data.parentFirstName.trim() || 'Parent';
  const safeItems = data.items || [];
  const subject = `Confirmation de commande ${data.orderId}`;

  const rowsHtml = safeItems
    .map((item) => {
      const childName = [item.childFirstName, item.childLastName].filter(Boolean).join(' ').trim() || 'Enfant';
      const supplements = formatSupplements(item.supplements);
      const annotations = item.annotations?.trim() ? item.annotations.trim() : 'Aucune note';

      return `
        <tr>
          <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top;">
            <div style="font-size: 15px; font-weight: 700; color: #111827; margin-bottom: 4px;">
              ${escapeHtml(item.mealName || 'Repas')}
            </div>
            <div style="font-size: 14px; line-height: 1.7; color: #4b5563;">
              Enfant : ${escapeHtml(childName)}<br />
              Date : ${escapeHtml(formatDate(item.date))}<br />
              Supplements : ${escapeHtml(supplements)}<br />
              Note : ${escapeHtml(annotations)}
            </div>
          </td>
          <td style="padding: 16px 0 16px 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top; text-align: right; font-size: 15px; font-weight: 700; color: #111827; white-space: nowrap;">
            ${escapeHtml(formatPrice(item.totalPrice))}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = buildEmailShell({
    preheader: `Commande ${data.orderId} confirmee pour un total de ${formatPrice(data.totalAmount)}.`,
    eyebrow: 'Confirmation de commande',
    title: 'Votre commande a ete confirmee',
    intro: `Bonjour ${firstName}, le paiement de votre commande a bien ete valide.`,
    bodyHtml: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 24px;">
        <tr>
          <td style="padding: 20px; border-radius: 20px; background: #f9fafb; border: 1px solid #e5e7eb;">
            <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 12px;">
              Recapitulatif
            </div>
            <div style="font-size: 15px; line-height: 1.8; color: #111827;">
              <strong>Commande :</strong> ${escapeHtml(data.orderId)}<br />
              <strong>Montant total :</strong> ${escapeHtml(formatPrice(data.totalAmount))}<br />
              <strong>Date de paiement :</strong> ${escapeHtml(formatDate(data.paidAt, true))}<br />
              ${
                data.paymentReference
                  ? `<strong>Reference de paiement :</strong> ${escapeHtml(data.paymentReference)}<br />`
                  : ''
              }
            </div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        <tr>
          <td colspan="2" style="padding-bottom: 12px; font-size: 16px; font-weight: 700; color: #111827;">
            Details de la commande
          </td>
        </tr>
        ${rowsHtml}
      </table>
    `,
    ctaLabel: data.appBaseUrl ? 'Ouvrir l application' : undefined,
    ctaUrl: data.appBaseUrl,
    footerNote: "Conservez cet email comme confirmation de commande. Pour toute question, contactez l equipe Child's Kitchen.",
  });

  const itemsText = safeItems
    .map((item) => {
      const childName = [item.childFirstName, item.childLastName].filter(Boolean).join(' ').trim() || 'Enfant';
      return [
        `- ${item.mealName || 'Repas'}`,
        `  Enfant : ${childName}`,
        `  Date : ${formatDate(item.date)}`,
        `  Supplements : ${formatSupplements(item.supplements)}`,
        `  Note : ${item.annotations?.trim() || 'Aucune note'}`,
        `  Prix : ${formatPrice(item.totalPrice)}`,
      ].join('\n');
    })
    .join('\n\n');

  const text = [
    `Bonjour ${firstName},`,
    '',
    'Votre commande a bien ete confirmee.',
    `Commande : ${data.orderId}`,
    `Montant total : ${formatPrice(data.totalAmount)}`,
    `Date de paiement : ${formatDate(data.paidAt, true)}`,
    data.paymentReference ? `Reference de paiement : ${data.paymentReference}` : '',
    '',
    'Details de la commande :',
    itemsText,
    '',
    data.appBaseUrl ? `Ouvrir l application : ${data.appBaseUrl}` : '',
    'Conservez cet email comme confirmation de commande.',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as XLSX from 'xlsx';

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

export interface ExportPayload {
  fileName: string;
  sheetName?: string;
  header: string[];
  rows: (string | number)[][];
  title?: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  totals?: { label: string; value: string | number }[];
}

export const sanitizeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'export';

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const exportData = async (
  format: ExportFormat,
  payload: ExportPayload
): Promise<void> => {
  const base = sanitizeFileName(payload.fileName);
  if (format === 'xlsx') return exportXlsx(base, payload);
  if (format === 'csv') return exportCsv(base, payload);
  if (format === 'pdf') return exportPdf(base, payload);
};

const exportXlsx = async (baseName: string, payload: ExportPayload) => {
  const sheet = XLSX.utils.aoa_to_sheet([payload.header, ...payload.rows]);
  const colCount = Math.max(payload.header.length, ...payload.rows.map(r => r.length));
  sheet['!cols'] = Array.from({ length: colCount }, () => ({ wch: 22 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, payload.sheetName || 'Export');
  const fileName = `${baseName}.xlsx`;

  if (Platform.OS === 'web') {
    XLSX.writeFile(workbook, fileName);
    return;
  }

  const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exporter Excel',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }
};

const exportCsv = async (baseName: string, payload: ExportPayload) => {
  const csv = [
    payload.header.map(csvEscape).join(';'),
    ...payload.rows.map(row => row.map(csvEscape).join(';')),
  ].join('\n');
  const fileName = `${baseName}.csv`;
  const content = `﻿${csv}`;

  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  const fileUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Exporter CSV',
      UTI: 'public.comma-separated-values-text',
    });
  }
};

const buildHtml = (payload: ExportPayload): string => {
  const title = payload.title || payload.fileName;
  const subtitle = payload.subtitle ? `<p class="subtitle">${escapeHtml(payload.subtitle)}</p>` : '';
  const meta = (payload.meta || []).length
    ? `<div class="meta">${payload.meta!
        .map(m => `<div class="meta-item"><span class="meta-label">${escapeHtml(m.label)}</span><span class="meta-value">${escapeHtml(m.value)}</span></div>`)
        .join('')}</div>`
    : '';
  const totals = (payload.totals || []).length
    ? `<div class="totals">${payload.totals!
        .map(t => `<div class="total-item"><span class="total-label">${escapeHtml(t.label)}</span><span class="total-value">${escapeHtml(t.value)}</span></div>`)
        .join('')}</div>`
    : '';
  const thead = `<tr>${payload.header.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
  const tbody = payload.rows
    .map(row => `<tr>${row.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #111827; }
  .subtitle { color: #6B7280; margin: 0 0 16px; font-size: 13px; }
  .meta { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; padding: 12px; background: #F9FAFB; border-radius: 8px; }
  .meta-item { display: flex; flex-direction: column; min-width: 120px; }
  .meta-label { font-size: 11px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #111827; margin-top: 2px; }
  .totals { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .total-item { background: #EEF2FF; padding: 8px 14px; border-radius: 999px; display: flex; gap: 8px; align-items: baseline; }
  .total-label { color: #4F46E5; font-size: 12px; font-weight: 600; }
  .total-value { color: #111827; font-weight: 700; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th { background: #111827; color: #FFFFFF; text-align: left; padding: 10px 12px; font-weight: 600; }
  td { padding: 9px 12px; border-bottom: 1px solid #E5E7EB; color: #111827; }
  tr:nth-child(even) td { background: #F9FAFB; }
  .footer { margin-top: 24px; font-size: 11px; color: #9CA3AF; text-align: right; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${subtitle}
  ${meta}
  ${totals}
  <table>
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>
  <div class="footer">Généré le ${escapeHtml(new Date().toLocaleString('fr-FR'))}</div>
</body>
</html>`;
};

const exportPdf = async (baseName: string, payload: ExportPayload) => {
  const html = buildHtml(payload);
  const fileName = `${baseName}.pdf`;

  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 250);
    }
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const target = `${FileSystem.documentDirectory}${fileName}`;
  try {
    await FileSystem.moveAsync({ from: uri, to: target });
  } catch {
    // fallback: share the temp uri directly
  }
  const shareUri = (await FileSystem.getInfoAsync(target)).exists ? target : uri;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Exporter PDF',
      UTI: 'com.adobe.pdf',
    });
  }
};

export const GRADE_ORDER: string[] = [
  'Petite Section', 'Moyenne Section', 'Grande Section',
  'CP', 'CE1', 'CE2', 'CM1', 'CM2',
  '6ème', '5ème', '4ème', '3ème',
  '2nde', '1ère', 'Terminale',
];

export const NO_GRADE_LABEL = 'Sans classe';

export const sortGrades = (a: string, b: string) => {
  if (a === NO_GRADE_LABEL) return 1;
  if (b === NO_GRADE_LABEL) return -1;
  const ia = GRADE_ORDER.indexOf(a);
  const ib = GRADE_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};

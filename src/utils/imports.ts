import { CurrencyCode, ImportColumnMapping, ImportFormatOptions } from '../data/models';

export type RawImportRow = Record<string, string>;

export const computeHeaderFingerprint = (headers: string[]) =>
  headers.map((header) => header.trim().toLowerCase()).join('|');

export const normalizeCell = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();

export const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

export const toTitleCase = (value: string) =>
  collapseWhitespace(value)
    .toLowerCase()
    .replace(/(^|\s|[-/])([a-z])/g, (match, prefix, char) => `${prefix}${char.toUpperCase()}`);

export const stripPunctuation = (value: string) =>
  value.normalize('NFKD').replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();

export const parseNumber = (
  value: string,
  decimalSeparator: ImportFormatOptions['decimalSeparator'],
  thousandsSeparator: ImportFormatOptions['thousandsSeparator']
) => {
  if (!value) return null;
  let normalized = value.trim();
  if (!normalized) return null;
  const negative = /^\(.*\)$/.test(normalized);
  normalized = normalized.replace(/[()]/g, '');
  const thousandsPattern = new RegExp(`\\${thousandsSeparator}`, 'g');
  normalized = normalized.replace(thousandsPattern, '');
  if (decimalSeparator !== '.') {
    const decimalPattern = new RegExp(`\\${decimalSeparator}`, 'g');
    normalized = normalized.replace(decimalPattern, '.');
  }
  const numeric = Number.parseFloat(normalized);
  if (Number.isNaN(numeric)) return null;
  return negative ? -numeric : numeric;
};

const buildDateFromParts = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const parseDateValue = (value: string, format: ImportFormatOptions['dateFormat']): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (format === 'YYYY-MM-DD' || format === 'YYYY/MM/DD') {
    const normalized = trimmed.replace(/\//g, '-');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const separators = /[\/\-\.]/;
  const parts = trimmed.split(separators).map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  switch (format) {
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
      return buildDateFromParts(parts[2], parts[1], parts[0]);
    case 'MM/DD/YYYY':
      return buildDateFromParts(parts[2], parts[0], parts[1]);
    case 'DD.MM.YYYY':
      return buildDateFromParts(parts[2], parts[1], parts[0]);
    default:
      return null;
  }
};

export const buildDuplicateFingerprint = (
  dateIso: string | null,
  amount: number | null,
  description: string,
  accountId: string
) => {
  if (!dateIso || amount === null) return `invalid-${accountId}`;
  const normalizedDescription = stripPunctuation(description).toLowerCase();
  const absoluteAmount = Math.abs(amount).toFixed(2);
  return `${accountId}|${dateIso.slice(0, 10)}|${absoluteAmount}|${collapseWhitespace(normalizedDescription)}`;
};

export const inferPayeeFromDescription = (description: string) => {
  if (!description) return null;
  const normalized = collapseWhitespace(description);
  const splitTokens = normalized.split(/\*|#|Ref|REF|ref/);
  const candidate = splitTokens[0] ?? normalized;
  const tokens = candidate.split(' ').filter((token) => token && !/^\d{4,}$/.test(token));
  if (tokens.length === 0) return null;
  return tokens.slice(0, 3).join(' ');
};

export const concatDescription = (row: RawImportRow, columns: string[] | undefined) => {
  if (!columns || columns.length === 0) return '';
  const values = columns
    .map((column) => normalizeCell(row[column] ?? ''))
    .filter((value) => value.length > 0);
  return values.join(' — ');
};

export const resolveCurrency = (
  row: RawImportRow,
  mapping: ImportColumnMapping,
  fallback: CurrencyCode
): CurrencyCode => {
  const source = mapping.currency?.[0];
  if (!source) return fallback;
  const value = normalizeCell(row[source]);
  return value ? value.toUpperCase() : fallback;
};

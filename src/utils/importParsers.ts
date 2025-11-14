import type {
  CurrencyCode,
  ImportColumnMapping,
  ImportFileType,
  ImportFormatOptions
} from '../data/models';
import { collapseWhitespace, normalizeCell } from './imports';
import type { RawImportRow } from './imports';

export type ImportAccountHint = {
  accountId?: string;
  accountName?: string | null;
  accountNumber?: string | null;
  currency?: CurrencyCode | null;
  provider?: string | null;
};

export type ParsedImportFile = {
  fileType: ImportFileType;
  rows: RawImportRow[];
  headers: string[];
  providerHint: string | null;
  accountHints: ImportAccountHint[];
  suggestedMapping?: ImportColumnMapping;
  suggestedFormat?: Partial<ImportFormatOptions>;
};

const BASE_HEADER_ORDER = [
  'Date',
  'Amount',
  'Debit',
  'Credit',
  'Description',
  'Payee',
  'Counterparty',
  'Currency',
  'External ID',
  'Memo',
  'Transaction Type',
  'Reference',
  'Check Number',
  'Balance',
  'Raw Metadata'
];

const buildHeadersFromRows = (rows: RawImportRow[]): string[] => {
  const present = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key) {
        present.add(key);
      }
    });
  });
  const ordered = BASE_HEADER_ORDER.filter((header) => present.has(header));
  const extras = Array.from(present)
    .filter((key) => !BASE_HEADER_ORDER.includes(key))
    .sort((a, b) => a.localeCompare(b));
  return [...ordered, ...extras];
};

const deriveSuggestedMapping = (headers: string[]): ImportColumnMapping => {
  const mapping: ImportColumnMapping = {};
  const assign = (field: keyof ImportColumnMapping, header: string) => {
    if (headers.includes(header)) {
      mapping[field] = [header];
    }
  };
  assign('date', 'Date');
  assign('amount', 'Amount');
  assign('description', 'Description');
  assign('payee', 'Payee');
  assign('counterparty', 'Counterparty');
  assign('currency', 'Currency');
  assign('externalId', 'External ID');
  assign('notes', 'Memo');
  assign('balance', 'Balance');
  return mapping;
};

const sanitizeFilename = (name: string): string => name.trim();

export const stripImportFileExtension = (name: string): string => {
  const trimmed = sanitizeFilename(name);
  if (!trimmed) return '';
  return trimmed.replace(/\.(csv|ofx|qfx|qif|mt940|sta|stc|txt|xml)$/i, '');
};

const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else if (char === '"') {
      inQuotes = true;
    } else {
      current += char;
    }
  }

  if (inQuotes) {
    throw new Error('Unterminated quoted field in CSV input.');
  }

  values.push(current);
  return values;
};

export const parseCsvDocument = (text: string): { headers: string[]; rows: RawImportRow[] } => {
  const lines = text.split(/\r?\n/);
  let headers: string[] | null = null;
  const rows: RawImportRow[] = [];

  lines.forEach((line) => {
    if (!line.trim()) {
      return;
    }

    const values = splitCsvLine(line);
    if (!headers) {
      headers = values.map((value) => normalizeCell(value ?? ''));
      return;
    }

    if (values.every((value) => normalizeCell(value).length === 0)) {
      return;
    }

    const row: RawImportRow = {};
    headers.forEach((header, index) => {
      const key = header ?? '';
      row[key] = normalizeCell(values[index] ?? '');
    });
    rows.push(row);
  });

  return { headers: headers ?? [], rows };
};

const parseIsoDate = (year: number, month: number, day: number): string => {
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = year.toString().padStart(4, '0');
  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseOfxDate = (value: string): string => {
  const digits = (value ?? '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return '';
  const year = Number.parseInt(digits.slice(0, 4), 10);
  const month = Number.parseInt(digits.slice(4, 6), 10);
  const day = Number.parseInt(digits.slice(6, 8), 10);
  return parseIsoDate(year, month, day);
};

const parseMt940Date = (value: string): string => {
  if (!/^\d{6}$/.test(value)) return '';
  const yearShort = Number.parseInt(value.slice(0, 2), 10);
  const month = Number.parseInt(value.slice(2, 4), 10);
  const day = Number.parseInt(value.slice(4, 6), 10);
  const year = yearShort >= 70 ? 1900 + yearShort : 2000 + yearShort;
  return parseIsoDate(year, month, day);
};

const getTagValue = (content: string, tag: string): string => {
  const pattern = new RegExp(`<${tag}>([^<\r\n]*)`, 'i');
  const match = pattern.exec(content);
  return match ? match[1].trim() : '';
};

const extractSection = (content: string, tag: string): string => {
  const pattern = new RegExp(`<${tag}>([\s\S]*?)(?:<BANKTRANLIST|<CCSTMTRS|<LEDGERBAL|<AVAILBAL|$)`, 'i');
  const match = pattern.exec(content);
  if (match && match[1]) {
    return match[1];
  }
  return '';
};

const parseOfxContent = (text: string): ParsedImportFile => {
  const sanitized = text.replace(/\r\n/g, '\n');
  const provider = getTagValue(sanitized, 'ORG') || getTagValue(sanitized, 'FID') || null;
  const currency = getTagValue(sanitized, 'CURDEF') || null;
  const accountHints: ImportAccountHint[] = [];

  ['BANKACCTFROM', 'CCACCTFROM'].forEach((tag) => {
    const section = extractSection(sanitized, tag);
    if (!section) return;
    const accountId = getTagValue(section, 'ACCTID');
    if (!accountId) return;
    const accountType = getTagValue(section, 'ACCTTYPE');
    const bankId = getTagValue(section, 'BANKID');
    accountHints.push({
      accountNumber: accountId,
      accountName: accountType ? collapseWhitespace(accountType) : bankId || null,
      currency: currency,
      provider: provider
    });
  });

  const rawTransactions = sanitized.split(/<STMTTRN>/i).slice(1);
  const rows: RawImportRow[] = rawTransactions.map((entry) => {
    const block = entry.split(/<\/STMTTRN>/i)[0] ?? entry;
    const amount = getTagValue(block, 'TRNAMT');
    const postedRaw = getTagValue(block, 'DTPOSTED');
    const parsedDate = parseOfxDate(postedRaw);
    const memo = collapseWhitespace(getTagValue(block, 'MEMO'));
    const name = collapseWhitespace(getTagValue(block, 'NAME'));
    const description = collapseWhitespace([name, memo].filter(Boolean).join(' — '));
    const rowCurrency = getTagValue(block, 'CURRENCY') || currency || '';
    const fitId = getTagValue(block, 'FITID');
    const checkNum = getTagValue(block, 'CHECKNUM');
    const refNum = getTagValue(block, 'REFNUM');
    const type = getTagValue(block, 'TRNTYPE');
    const metadata = {
      trnType: type || null,
      postedRaw: postedRaw || null,
      currency: rowCurrency || null,
      fitId: fitId || null,
      checkNumber: checkNum || null,
      reference: refNum || null,
      memo: memo || null,
      name: name || null,
      sic: getTagValue(block, 'SIC') || null,
      payeeId: getTagValue(block, 'PAYEEID') || null
    };
    const row: RawImportRow = {
      Date: parsedDate || postedRaw || '',
      Amount: amount || '',
      Description: description || name || memo || '',
      Payee: name || '',
      Memo: memo || '',
      Currency: rowCurrency,
      'External ID': fitId || '',
      'Transaction Type': type || '',
      Reference: refNum || '',
      'Check Number': checkNum || '',
      'Raw Metadata': JSON.stringify(metadata, null, 2)
    };
    return row;
  });

  if (rows.length === 0) {
    throw new Error('No transactions found in the OFX file.');
  }

  const headers = buildHeadersFromRows(rows);

  return {
    fileType: 'ofx',
    rows,
    headers,
    providerHint: provider,
    accountHints,
    suggestedMapping: deriveSuggestedMapping(headers),
    suggestedFormat: {
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      signConvention: 'positive-credit'
    }
  };
};

const parseQifDate = (value: string): string => {
  const normalized = value.replace(/[\'\,]/g, '/').replace(/\s+/g, '');
  const parts = normalized.split(/[\/]/).filter(Boolean);
  if (parts.length < 3) return '';
  let [part1, part2, part3] = parts;
  let month = Number.parseInt(part1, 10);
  let day = Number.parseInt(part2, 10);
  if (month > 12 && day <= 12) {
    [month, day] = [day, month];
  }
  let year = Number.parseInt(part3, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return '';
  }
  if (year < 100) {
    year += year >= 70 ? 1900 : 2000;
  }
  return parseIsoDate(year, month, day);
};

const parseQifContent = (text: string): ParsedImportFile => {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const rows: RawImportRow[] = [];
  const accountHints: ImportAccountHint[] = [];
  let providerHint: string | null = null;
  let baseCurrency: string | null = null;
  let inAccount = false;
  let currentAccount: ImportAccountHint = {};
  let currentTxn: {
    date?: string;
    amount?: string;
    payee?: string;
    memo?: string;
    checkNumber?: string;
    category?: string;
    reference?: string;
    cleared?: string;
    addressLines?: string[];
    splits: { category?: string; memo?: string; amount?: string }[];
  } | null = null;

  const flushAccount = () => {
    if (!currentAccount.accountName && !currentAccount.accountNumber) {
      currentAccount = {};
      return;
    }
    accountHints.push({
      accountName: currentAccount.accountName ?? null,
      accountNumber: currentAccount.accountNumber ?? null,
      currency: baseCurrency,
      provider: currentAccount.provider ?? null
    });
    if (!providerHint && currentAccount.provider) {
      providerHint = currentAccount.provider;
    }
    currentAccount = {};
  };

  const flushTransaction = () => {
    if (!currentTxn) return;
    if (!currentTxn.amount && currentTxn.splits.length === 0) {
      currentTxn = null;
      return;
    }
    const date = currentTxn.date ? parseQifDate(currentTxn.date) : '';
    const amount = currentTxn.amount ?? '';
    const description = collapseWhitespace(
      [currentTxn.memo, currentTxn.payee].filter(Boolean).join(' — ')
    );
    const metadata = {
      category: currentTxn.category ?? null,
      cleared: currentTxn.cleared ?? null,
      address: currentTxn.addressLines && currentTxn.addressLines.length > 0 ? currentTxn.addressLines : null,
      splits: currentTxn.splits.length > 0 ? currentTxn.splits : null
    };
    rows.push({
      Date: date || currentTxn.date || '',
      Amount: amount,
      Description: description || currentTxn.payee || currentTxn.memo || '',
      Payee: currentTxn.payee ?? '',
      Memo: currentTxn.memo ?? '',
      Currency: baseCurrency ?? '',
      'External ID': currentTxn.reference ?? '',
      Reference: currentTxn.reference ?? '',
      'Check Number': currentTxn.checkNumber ?? '',
      'Raw Metadata': JSON.stringify(metadata, null, 2)
    });
    currentTxn = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('!Option:Currency:')) {
      baseCurrency = line.split(':')[2]?.trim() ?? null;
      return;
    }
    if (line.startsWith('!Account')) {
      flushTransaction();
      if (inAccount) {
        flushAccount();
      }
      inAccount = true;
      currentAccount = {};
      return;
    }
    if (line.startsWith('!Type:')) {
      flushTransaction();
      if (inAccount) {
        flushAccount();
      }
      inAccount = false;
      return;
    }
    if (line === '^') {
      if (inAccount) {
        flushAccount();
      } else {
        flushTransaction();
      }
      return;
    }

    if (inAccount) {
      const prefix = line[0];
      const value = line.slice(1).trim();
      switch (prefix) {
        case 'N':
          currentAccount.accountName = value;
          break;
        case 'D':
          currentAccount.provider = value;
          break;
        case 'B':
          currentAccount.accountNumber = value;
          break;
        default:
          break;
      }
      return;
    }

    if (!currentTxn) {
      currentTxn = { splits: [] };
    }

    const prefix = line[0];
    const value = line.slice(1).trim();
    switch (prefix) {
      case 'D':
        currentTxn.date = value;
        break;
      case 'T':
      case 'U':
        currentTxn.amount = value;
        break;
      case 'P':
        currentTxn.payee = value;
        break;
      case 'M':
        currentTxn.memo = value;
        break;
      case 'N':
        currentTxn.checkNumber = value;
        break;
      case 'L':
        currentTxn.category = value;
        break;
      case 'C':
        currentTxn.cleared = value;
        break;
      case 'A':
        currentTxn.addressLines = [...(currentTxn.addressLines ?? []), value];
        break;
      case 'R':
        currentTxn.reference = value;
        break;
      case 'S':
        currentTxn.splits.push({ category: value });
        break;
      case 'E':
        if (currentTxn.splits.length > 0) {
          currentTxn.splits[currentTxn.splits.length - 1].memo = value;
        }
        break;
      case '$':
        if (currentTxn.splits.length > 0) {
          currentTxn.splits[currentTxn.splits.length - 1].amount = value;
        }
        break;
      default:
        break;
    }
  });

  flushTransaction();
  if (inAccount) {
    flushAccount();
  }

  if (rows.length === 0) {
    throw new Error('No transactions found in the QIF file.');
  }

  const headers = buildHeadersFromRows(rows);

  return {
    fileType: 'qif',
    rows,
    headers,
    providerHint,
    accountHints,
    suggestedMapping: deriveSuggestedMapping(headers),
    suggestedFormat: {
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      signConvention: 'positive-credit'
    }
  };
};

type Mt940Transaction = {
  date: string;
  amountText: string;
  transactionType: string;
  reference: string;
  supplementary: string;
  narrative: string[];
  raw: string;
};

const parseMt940TransactionLine = (line: string): Mt940Transaction => {
  const content = line.trim();
  let pointer = 0;
  const valueDateRaw = content.slice(pointer, pointer + 6);
  pointer += 6;
  if (/^\d{4}/.test(content.slice(pointer, pointer + 4))) {
    pointer += 4; // entry date ignored
  }
  let indicator = content[pointer];
  pointer += 1;
  if (content[pointer] === 'R') {
    indicator += 'R';
    pointer += 1;
  }
  const rest = content.slice(pointer);
  const nIndex = rest.indexOf('N');
  const amountPart = (nIndex >= 0 ? rest.slice(0, nIndex) : rest).trim();
  const afterAmount = nIndex >= 0 ? rest.slice(nIndex + 1) : '';
  const type = afterAmount.slice(0, 3);
  const referencePart = afterAmount.slice(3).trim();
  const amountNormalized = amountPart.replace(',', '.');
  const amountText = `${indicator.includes('D') ? '-' : ''}${amountNormalized}`;
  const [reference, supplementary] = referencePart.split('//');
  return {
    date: parseMt940Date(valueDateRaw) || '',
    amountText,
    transactionType: type.trim(),
    reference: (reference ?? '').trim(),
    supplementary: (supplementary ?? '').trim(),
    narrative: [],
    raw: line
  };
};

const parseMt940Content = (text: string): ParsedImportFile => {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const rows: RawImportRow[] = [];
  const accountHints: ImportAccountHint[] = [];
  let providerHint: string | null = null;
  let currency: string | null = null;
  let accountNumber: string | null = null;
  let currentTxn: Mt940Transaction | null = null;

  const pushTransaction = () => {
    if (!currentTxn) return;
    const descriptionParts = [currentTxn.reference, currentTxn.supplementary, currentTxn.narrative.join(' ')].filter(Boolean);
    const payee = currentTxn.narrative.length > 0 ? collapseWhitespace(currentTxn.narrative[0]) : '';
    const metadata = {
      raw61: currentTxn.raw,
      narrative: currentTxn.narrative,
      reference: currentTxn.reference || null,
      supplementary: currentTxn.supplementary || null
    };
    rows.push({
      Date: currentTxn.date,
      Amount: currentTxn.amountText,
      Description: collapseWhitespace(descriptionParts.join(' — ')),
      Payee: payee,
      Memo: currentTxn.narrative.join('\n'),
      Currency: currency ?? '',
      'Transaction Type': currentTxn.transactionType,
      Reference: currentTxn.reference,
      'External ID': currentTxn.supplementary || currentTxn.reference,
      'Raw Metadata': JSON.stringify(metadata, null, 2)
    });
    currentTxn = null;
  };

  lines.forEach((line) => {
    if (line.startsWith(':20:')) {
      providerHint = providerHint ?? ((line.slice(4).trim()) || null);
      return;
    }
    if (line.startsWith(':25:')) {
      accountNumber = line.slice(4).trim() || null;
      return;
    }
    if (line.startsWith(':60') && line.length >= 10) {
      const candidate = line.slice(7, 10);
      if (candidate.trim()) {
        currency = candidate.trim();
      }
      return;
    }
    if (line.startsWith(':61:')) {
      pushTransaction();
      currentTxn = parseMt940TransactionLine(line.slice(4));
      return;
    }
    if (line.startsWith(':86:')) {
      const narrative = line.slice(4).trim();
      if (currentTxn && narrative) {
        currentTxn.narrative.push(narrative);
      }
      return;
    }
  });

  pushTransaction();

  if (accountNumber || currency) {
    accountHints.push({
      accountNumber,
      currency,
      provider: providerHint ?? null
    });
  }

  if (rows.length === 0) {
    throw new Error('No transactions found in the MT940 file.');
  }

  const headers = buildHeadersFromRows(rows);

  return {
    fileType: 'mt940',
    rows,
    headers,
    providerHint,
    accountHints,
    suggestedMapping: deriveSuggestedMapping(headers),
    suggestedFormat: {
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      signConvention: 'positive-credit'
    }
  };
};

export const detectImportFileType = (fileName: string, content: string): ImportFileType => {
  const name = fileName.toLowerCase();
  if (name.endsWith('.ofx') || name.endsWith('.qfx')) return 'ofx';
  if (name.endsWith('.qif')) return 'qif';
  if (name.endsWith('.mt940') || name.endsWith('.sta') || name.endsWith('.stc')) return 'mt940';
  if (name.endsWith('.csv')) return 'csv';

  const trimmed = content.trim();
  if (/<OFX>/i.test(trimmed) || /<STMTTRN>/i.test(trimmed)) return 'ofx';
  if (/^!Type:/im.test(trimmed)) return 'qif';
  if (/:61:/i.test(trimmed) && /:20:/i.test(trimmed)) return 'mt940';
  return 'csv';
};

export const parseImportContent = (fileName: string, text: string): ParsedImportFile => {
  const fileType = detectImportFileType(fileName, text);
  switch (fileType) {
    case 'csv': {
      const parsed = parseCsvDocument(text);
      return {
        fileType,
        rows: parsed.rows,
        headers: parsed.headers,
        providerHint: null,
        accountHints: [],
        suggestedMapping: deriveSuggestedMapping(parsed.headers)
      };
    }
    case 'ofx':
      return parseOfxContent(text);
    case 'qif':
      return parseQifContent(text);
    case 'mt940':
      return parseMt940Content(text);
    default:
      throw new Error('Unsupported file type.');
  }
};

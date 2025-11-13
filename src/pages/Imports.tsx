import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import {
  Account,
  Category,
  HistoryEntry,
  ImportBatch,
  ImportBatchSummary,
  ImportColumnMapping,
  ImportFormatOptions,
  ImportProfile,
  ImportField,
  SubCategory
} from '../data/models';
import {
  RawImportRow,
  buildDuplicateFingerprint,
  collapseWhitespace,
  concatDescription,
  computeHeaderFingerprint,
  inferPayeeFromDescription,
  normalizeCell,
  parseDateValue,
  parseNumber,
  resolveCurrency,
  toTitleCase
} from '../utils/imports';
import { formatCurrency, formatDate } from '../utils/format';
import { generateId } from '../utils/id';

import '../styles/imports.css';

import type { CurrencyCode } from '../data/models';

type WizardStep = 'upload' | 'mapping' | 'preview' | 'conflicts' | 'import' | 'summary';

type PreviewRowStatus = 'valid' | 'duplicate' | 'invalid' | 'needs-fx' | 'warning';

type FxMode = 'single-rate' | 'rate-column' | 'skip';

type FxOptionsState = {
  mode: FxMode;
  rateValue: string;
  rateColumn?: string;
};

type RowOverride = {
  payeeId?: string | null;
  payeeName?: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
};

type PreviewRow = {
  id: string;
  index: number;
  accountId: string | null;
  accountName?: string;
  accountCurrency: string;
  date: string | null;
  dateDisplay: string;
  amount: number | null;
  accountAmountRaw: number | null;
  nativeAmount: number | null;
  nativeCurrency: string;
  fxRate?: number;
  needsFx: boolean;
  description: string;
  rawDescription: string;
  payeeId: string | null;
  payeeName: string;
  payeeMatchName?: string;
  suggestedPayee?: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  categoryPath?: string | null;
  notes?: string;
  externalId?: string;
  counterparty?: string;
  balance?: number | null;
  duplicate: boolean;
  fingerprint: string | null;
  baseWarnings: string[];
  warnings: string[];
  errors: string[];
  issues: string[];
  status: PreviewRowStatus;
  metadata: {
    raw: RawImportRow;
    transferHint?: boolean;
  };
  isDemo?: boolean;
};

type DemoImportDefinition = {
  id: string;
  label: string;
  file: string;
  profileName: string;
  mapping: ImportColumnMapping;
  format: ImportFormatOptions;
  fx?: FxOptionsState;
};

const steps: { id: WizardStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'mapping', label: 'Mapping' },
  { id: 'preview', label: 'Preview' },
  { id: 'conflicts', label: 'Conflicts & Duplicates' },
  { id: 'import', label: 'Import' },
  { id: 'summary', label: 'Summary' }
];

const dateFormatOptions: { value: ImportFormatOptions['dateFormat']; label: string }[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-04-30)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (30/04/2024)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (04/30/2024)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (30-04-2024)' }
];

const decimalSeparatorOptions: { value: ImportFormatOptions['decimalSeparator']; label: string }[] = [
  { value: '.', label: 'Dot (1,234.56)' },
  { value: ',', label: 'Comma (1.234,56)' }
];

const thousandSeparatorOptions: { value: ImportFormatOptions['thousandsSeparator']; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: '.', label: 'Dot' },
  { value: ' ', label: 'Space' }
];

const signConventionOptions: { value: ImportFormatOptions['signConvention']; label: string }[] = [
  { value: 'positive-credit', label: 'Single signed amount (positive = credit)' },
  { value: 'explicit-columns', label: 'Separate debit and credit columns' }
];

const fxModeOptions: { value: FxMode; label: string }[] = [
  { value: 'single-rate', label: 'Use a single FX rate for all rows' },
  { value: 'rate-column', label: 'Use a rate column in the file' },
  { value: 'skip', label: 'Skip conversion and flag rows that need FX' }
];

const HELP_HREF = '#/help#imports';

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

const parseCsvText = (text: string) => {
  const lines = text.split(/\r?\n/);
  let header: string[] | null = null;
  const rows: string[][] = [];

  lines.forEach((line) => {
    if (!line.trim()) {
      return;
    }

    const values = splitCsvLine(line);
    if (!header) {
      header = values.map((value) => value ?? '').map((value) => value.trim());
      return;
    }

    if (values.every((value) => value.trim().length === 0)) {
      return;
    }

    rows.push(values);
  });

  if (!header) {
    return { fields: [] as string[], rows: [] as string[][] };
  }

  return { fields: header, rows };
};

const buildRowsFromCsv = (fields: string[], values: string[][]) =>
  values.map((row) => {
    const normalized: RawImportRow = {};
    fields.forEach((field, index) => {
      const key = field ?? '';
      normalized[key] = normalizeCell(row[index] ?? '');
    });
    return normalized;
  });

const DEMO_IMPORTS: DemoImportDefinition[] = [
  {
    id: 'uk-current',
    label: 'UK current account (GBP)',
    file: '/demo/uk-current-account.csv',
    profileName: 'UK Current Account',
    mapping: {
      date: ['Date'],
      description: ['Description'],
      amount: ['Amount'],
      payee: ['Payee'],
      notes: ['Notes'],
      categoryPath: ['Category Path']
    },
    format: {
      dateFormat: 'DD/MM/YYYY',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      signConvention: 'positive-credit'
    },
    fx: { mode: 'single-rate', rateValue: '1.00' }
  },
  {
    id: 'savings',
    label: 'Savings account interest (GBP)',
    file: '/demo/savings-account.csv',
    profileName: 'Savings Interest',
    mapping: {
      date: ['Date'],
      description: ['Description'],
      amount: ['Amount'],
      notes: ['Notes']
    },
    format: {
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      signConvention: 'positive-credit'
    },
    fx: { mode: 'single-rate', rateValue: '1.00' }
  },
  {
    id: 'card-statement',
    label: 'Card statement (GBP, debit/credit columns)',
    file: '/demo/card-statement.csv',
    profileName: 'Card Statement',
    mapping: {
      date: ['Posted'],
      description: ['Merchant', 'Reference'],
      debit: ['Debit'],
      credit: ['Credit'],
      currency: ['Currency'],
      externalId: ['Statement ID']
    },
    format: {
      dateFormat: 'DD/MM/YYYY',
      decimalSeparator: '.',
      thousandsSeparator: ',',
      signConvention: 'explicit-columns'
    },
    fx: { mode: 'single-rate', rateValue: '1.00' }
  }
];


type AccountLookup = {
  byId: Map<string, Account>;
  byName: Map<string, Account>;
  byNumber: Map<string, Account>;
};

const buildAccountLookup = (accounts: Account[]): AccountLookup => {
  const byId = new Map<string, Account>();
  const byName = new Map<string, Account>();
  const byNumber = new Map<string, Account>();
  accounts.forEach((account) => {
    byId.set(account.id, account);
    byName.set(account.name.toLowerCase(), account);
    if (account.accountNumber) {
      byNumber.set(account.accountNumber.toLowerCase(), account);
    }
  });
  return { byId, byName, byNumber };
};

const deriveStatus = (row: PreviewRow): PreviewRowStatus => {
  if (row.errors.length > 0 || !row.accountId || !row.date || row.amount === null) {
    return 'invalid';
  }
  if (row.needsFx) {
    return 'needs-fx';
  }
  if (row.duplicate) {
    return 'duplicate';
  }
  if (row.warnings.length > 0) {
    return 'warning';
  }
  return 'valid';
};

const computeWarnings = (row: PreviewRow) => {
  const warnings = new Set<string>(row.baseWarnings);
  if (!row.payeeName) warnings.add('Payee missing');
  if (!row.categoryId) warnings.add('Category unmapped');
  if (row.needsFx) warnings.add('Awaiting FX conversion');
  return Array.from(warnings);
};

const resolveCategoryPath = (
  raw: string,
  categories: Category[],
  subCategories: SubCategory[],
  masters: Category['masterCategoryId'][]
) => {
  const tokens = raw
    .split(/>|\//)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  const [masterToken, categoryToken, subToken] = tokens.map((token) => token.toLowerCase());

  let categoryMatch: Category | undefined;
  if (categoryToken) {
    categoryMatch = categories.find((category) => category.name.toLowerCase() === categoryToken);
  }
  if (!categoryMatch && masterToken) {
    categoryMatch = categories.find((category) => category.masterCategoryId.toLowerCase() === masterToken);
  }
  if (!categoryMatch) {
    categoryMatch = categories.find((category) => category.name.toLowerCase() === tokens[0].toLowerCase());
  }
  if (!categoryMatch) return null;

  let subCategoryMatch: SubCategory | undefined;
  if (subToken) {
    subCategoryMatch = subCategories.find(
      (subCategory) => subCategory.categoryId === categoryMatch?.id && subCategory.name.toLowerCase() === subToken
    );
  }

  return {
    categoryId: categoryMatch.id,
    subCategoryId: subCategoryMatch?.id ?? null
  };
};

const Imports = () => {
  const {
    state,
    saveImportProfile,
    createImportBatch,
    addTransaction,
    deleteImportProfile,
    clearDemoTransactionsForAccount,
    undoLastImport
  } = useData();

  const accounts = useMemo(() => state.accounts.filter((account) => !account.archived), [state.accounts]);
  const accountLookup = useMemo(() => buildAccountLookup(accounts), [accounts]);
  const payees = useMemo(() => state.payees.filter((payee) => !payee.archived), [state.payees]);
  const payeeByName = useMemo(() => {
    const map = new Map<string, string>();
    payees.forEach((payee) => {
      map.set(payee.name.toLowerCase(), payee.id);
    });
    return map;
  }, [payees]);
  const payeeById = useMemo(() => {
    const map = new Map<string, typeof payees[number]>();
    payees.forEach((payee) => {
      map.set(payee.id, payee);
    });
    return map;
  }, [payees]);
  const categories = useMemo(() => state.categories.filter((category) => !category.archived), [state.categories]);
  const subCategories = useMemo(
    () => state.subCategories.filter((subCategory) => !subCategory.archived),
    [state.subCategories]
  );
  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);
  const subCategoryById = useMemo(() => {
    const map = new Map<string, SubCategory>();
    subCategories.forEach((subCategory) => map.set(subCategory.id, subCategory));
    return map;
  }, [subCategories]);
  const subCategoriesByCategory = useMemo(() => {
    const map = new Map<string, SubCategory[]>();
    subCategories.forEach((subCategory) => {
      const list = map.get(subCategory.categoryId) ?? [];
      list.push(subCategory);
      map.set(subCategory.categoryId, list);
    });
    return map;
  }, [subCategories]);

  const transfersCategory = useMemo(
    () => categories.find((category) => category.name.toLowerCase() === 'transfers'),
    [categories]
  );
  const transfersSubCategory = useMemo(() => {
    if (!transfersCategory) return null;
    return subCategories.find(
      (subCategory) =>
        subCategory.categoryId === transfersCategory.id && subCategory.name.toLowerCase() === 'internal transfer'
    );
  }, [subCategories, transfersCategory]);

  const [step, setStep] = useState<WizardStep>('upload');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountColumn, setAccountColumn] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [headerFingerprint, setHeaderFingerprint] = useState('');
  const [matchedProfile, setMatchedProfile] = useState<ImportProfile | null>(null);
  const [rememberProfile, setRememberProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [formatOptions, setFormatOptions] = useState<ImportFormatOptions>(state.settings.importDefaults);
  const [fxOptions, setFxOptions] = useState<FxOptionsState>({ mode: 'single-rate', rateValue: '1.00' });
  const [rawRows, setRawRows] = useState<RawImportRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [autoMarkTransfers, setAutoMarkTransfers] = useState(false);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>('');
  const [defaultSubCategoryId, setDefaultSubCategoryId] = useState<string>('');
  const [summary, setSummary] = useState<ImportBatchSummary | null>(null);
  const [createdBatch, setCreatedBatch] = useState<ImportBatch | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(false);
  const [isDemoImport, setIsDemoImport] = useState(false);
  const [demoSelection, setDemoSelection] = useState(DEMO_IMPORTS[0].id);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const existingFingerprints = useMemo(() => {
    const fingerprints = new Set<string>();
    state.transactions.forEach((transaction) => {
      const description = transaction.description ?? transaction.memo ?? '';
      fingerprints.add(
        buildDuplicateFingerprint(transaction.date, transaction.amount, description, transaction.accountId)
      );
    });
    return fingerprints;
  }, [state.transactions]);

  const profileOptions = state.settings.importProfiles;
  const resetWizard = useCallback(() => {
    setStep('upload');
    setSelectedAccountId('');
    setAccountColumn(null);
    setFileName('');
    setHeaderFingerprint('');
    setMatchedProfile(null);
    setRememberProfile(false);
    setProfileName('');
    setMapping({});
    setFormatOptions(state.settings.importDefaults);
    setFxOptions({ mode: 'single-rate', rateValue: '1.00' });
    setRawRows([]);
    setHeaders([]);
    setRowOverrides({});
    setIncludeDuplicates(false);
    setAutoMarkTransfers(false);
    setDefaultCategoryId('');
    setDefaultSubCategoryId('');
    setSummary(null);
    setCreatedBatch(null);
    setPreviewRows([]);
    setUploadError(null);
    setImportError(null);
    setProfileBannerDismissed(false);
    setIsDemoImport(false);
  }, [state.settings.importDefaults]);

  useEffect(() => {
    resetWizard();
  }, [resetWizard, state.settings.baseCurrency]);

  const applyProfile = useCallback(
    (profile: ImportProfile) => {
      setMapping(profile.fieldMapping);
      setFormatOptions(profile.format);
      setMatchedProfile(profile);
      setProfileName(profile.name);
      setProfileBannerDismissed(false);
    },
    []
  );

  const handleFileParse = useCallback(
    (rows: RawImportRow[], fields: string[], name: string) => {
      setRawRows(rows);
      setHeaders(fields);
      setFileName(name);
      setRowOverrides({});
      setIncludeDuplicates(false);
      setAutoMarkTransfers(false);
      setIsDemoImport(false);
      const fingerprint = computeHeaderFingerprint(fields);
      setHeaderFingerprint(fingerprint);
      const candidate = profileOptions.find((profile) => profile.headerFingerprint === fingerprint);
      if (candidate) {
        applyProfile(candidate);
      } else {
        setMapping({});
        setFormatOptions(state.settings.importDefaults);
        setProfileName(name.replace(/\.csv$/i, ''));
        setMatchedProfile(null);
      }
      const accountCandidate = fields.find((field) => /account\s*(name|number)/i.test(field));
      setAccountColumn(accountCandidate ?? null);
      setStep('mapping');
    },
    [applyProfile, profileOptions, state.settings.importDefaults]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const [file] = Array.from(files);
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setUploadError('Only CSV files are supported in this stage.');
        return;
      }
      setUploadError(null);
      setLoading(true);
      file
        .text()
        .then((text) => {
          try {
            const parsed = parseCsvText(text);
            if (parsed.fields.length === 0) {
              throw new Error('Missing header row.');
            }
            const rows = buildRowsFromCsv(parsed.fields, parsed.rows);
            setLoading(false);
            handleFileParse(rows, parsed.fields, file.name);
          } catch (error) {
            setLoading(false);
            setUploadError('Unable to parse the CSV file. Check delimiter settings and try again.');
          }
        })
        .catch(() => {
          setLoading(false);
          setUploadError('Failed to read the file. Please try again.');
        });
    },
    [handleFileParse]
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
  };
  const resolveAccountForRow = useCallback(
    (row: RawImportRow) => {
      if (accountColumn) {
        const value = normalizeCell(row[accountColumn]);
        if (value) {
          const candidate =
            accountLookup.byName.get(value.toLowerCase()) || accountLookup.byNumber.get(value.toLowerCase());
          if (candidate) return candidate;
        }
      }
      if (selectedAccountId) {
        return accountLookup.byId.get(selectedAccountId) ?? null;
      }
      return null;
    },
    [accountColumn, accountLookup, selectedAccountId]
  );

  const buildPreviewRows = useCallback((): PreviewRow[] => {
    if (rawRows.length === 0) return [];
    const rows: PreviewRow[] = [];
    const duplicateTracker = new Set(existingFingerprints);

    rawRows.forEach((rawRow, index) => {
      const account = resolveAccountForRow(rawRow);
      const errors: string[] = [];
      const baseWarnings: string[] = [];

      const dateColumn = mapping.date?.[0];
      const rawDate = dateColumn ? normalizeCell(rawRow[dateColumn]) : '';
      const parsedDate = dateColumn ? parseDateValue(rawDate, formatOptions.dateFormat) : null;
      if (!parsedDate) {
        errors.push('Invalid or missing date');
      }

      let accountAmountRaw: number | null = null;
      if (formatOptions.signConvention === 'explicit-columns') {
        const debitColumn = mapping.debit?.[0];
        const creditColumn = mapping.credit?.[0];
        const debit = debitColumn
          ? parseNumber(normalizeCell(rawRow[debitColumn]), formatOptions.decimalSeparator, formatOptions.thousandsSeparator)
          : null;
        const credit = creditColumn
          ? parseNumber(normalizeCell(rawRow[creditColumn]), formatOptions.decimalSeparator, formatOptions.thousandsSeparator)
          : null;
        if (debit === null && credit === null) {
          errors.push('Debit/Credit columns empty');
        } else {
          accountAmountRaw = (credit ?? 0) - (debit ?? 0);
        }
      } else {
        const amountColumn = mapping.amount?.[0];
        const parsedAmount = amountColumn
          ? parseNumber(normalizeCell(rawRow[amountColumn]), formatOptions.decimalSeparator, formatOptions.thousandsSeparator)
          : null;
        if (parsedAmount === null) {
          errors.push('Amount column empty');
        } else {
          accountAmountRaw = parsedAmount;
        }
      }

      const resolvedAccount = account ?? null;
      if (!resolvedAccount) {
        errors.push('Account not resolved');
      }

      const accountCurrency = resolvedAccount?.currency ?? state.settings.baseCurrency;
      const sourceCurrency = resolveCurrency(rawRow, mapping, accountCurrency);
      let nativeAmount: number | null = accountAmountRaw;
      let nativeCurrency = sourceCurrency;
      let amount: number | null = accountAmountRaw !== null ? Number.parseFloat(accountAmountRaw.toFixed(2)) : null;
      let fxRate: number | undefined;
      let needsFx = false;

      if (resolvedAccount && sourceCurrency !== resolvedAccount.currency) {
        if (fxOptions.mode === 'single-rate') {
          const parsedRate = Number.parseFloat((fxOptions.rateValue || '').replace(',', '.'));
          if (Number.isFinite(parsedRate) && parsedRate > 0 && accountAmountRaw !== null) {
            nativeAmount = accountAmountRaw;
            nativeCurrency = sourceCurrency;
            accountAmountRaw = accountAmountRaw * parsedRate;
            amount = Number.parseFloat(accountAmountRaw.toFixed(2));
            fxRate = parsedRate;
          } else {
            needsFx = true;
            baseWarnings.push('FX rate required');
          }
        } else if (fxOptions.mode === 'rate-column') {
          const rateColumn = fxOptions.rateColumn;
          const rateValue = rateColumn
            ? parseNumber(normalizeCell(rawRow[rateColumn]), '.', ',')
            : null;
          if (rateValue && accountAmountRaw !== null) {
            nativeAmount = accountAmountRaw;
            nativeCurrency = sourceCurrency;
            accountAmountRaw = accountAmountRaw * rateValue;
            amount = Number.parseFloat(accountAmountRaw.toFixed(2));
            fxRate = rateValue;
          } else {
            needsFx = true;
            baseWarnings.push('FX rate missing');
          }
        } else {
          needsFx = true;
        }
      }

      const description = toTitleCase(concatDescription(rawRow, mapping.description) || normalizeCell(rawRow[mapping.description?.[0] ?? '']));
      const rawDescription = concatDescription(rawRow, mapping.description) || normalizeCell(rawRow[mapping.description?.[0] ?? '']);

      let payeeId: string | null = null;
      let payeeName = '';
      let payeeMatchName: string | undefined;
      let suggestedPayee: string | null | undefined;

      if (mapping.payee?.[0]) {
        const rawPayee = collapseWhitespace(rawRow[mapping.payee[0]] ?? '');
        if (rawPayee) {
          const matchId = payeeByName.get(rawPayee.toLowerCase());
          if (matchId) {
            payeeId = matchId;
            const match = payees.find((payee) => payee.id === matchId);
            payeeName = match?.name ?? rawPayee;
            payeeMatchName = match?.name ?? rawPayee;
          } else {
            payeeName = rawPayee;
          }
        }
      } else {
        suggestedPayee = inferPayeeFromDescription(rawDescription || description);
        payeeName = suggestedPayee ?? '';
      }

      let categoryId: string | null = null;
      let subCategoryId: string | null = null;
      if (mapping.categoryPath?.[0]) {
        const pathValue = normalizeCell(rawRow[mapping.categoryPath[0]]);
        if (pathValue) {
          const resolved = resolveCategoryPath(pathValue, categories, subCategories, categories.map((category) => category.masterCategoryId));
          if (resolved) {
            categoryId = resolved.categoryId;
            subCategoryId = resolved.subCategoryId;
          } else {
            baseWarnings.push('Category path not recognised');
          }
        }
      }

      if (autoMarkTransfers && resolvedAccount) {
        const otherAccountNames = accounts
          .filter((candidate) => candidate.id !== resolvedAccount.id)
          .map((candidate) => candidate.name.toLowerCase());
        const narrative = `${description} ${rawDescription}`.toLowerCase();
        if (otherAccountNames.some((name) => narrative.includes(name)) || /transfer|payment to card/.test(narrative)) {
          if (transfersCategory) {
            categoryId = transfersCategory.id;
            subCategoryId = transfersSubCategory?.id ?? null;
          }
        }
      }

      const fingerprint =
        resolvedAccount && parsedDate && amount !== null
          ? buildDuplicateFingerprint(parsedDate, amount, description || rawDescription, resolvedAccount.id)
          : null;
      const duplicate = fingerprint ? duplicateTracker.has(fingerprint) : false;
      if (fingerprint) duplicateTracker.add(fingerprint);

      const notes = mapping.notes?.[0] ? normalizeCell(rawRow[mapping.notes[0]]) : undefined;
      const externalId = mapping.externalId?.[0] ? normalizeCell(rawRow[mapping.externalId[0]]) : undefined;
      const counterparty = mapping.counterparty?.[0] ? normalizeCell(rawRow[mapping.counterparty[0]]) : undefined;
      const balanceValue = mapping.balance?.[0]
        ? parseNumber(normalizeCell(rawRow[mapping.balance[0]]), formatOptions.decimalSeparator, formatOptions.thousandsSeparator)
        : null;

      const row: PreviewRow = {
        id: `${index}`,
        index,
        accountId: resolvedAccount?.id ?? null,
        accountName: resolvedAccount?.name,
        accountCurrency,
        date: parsedDate,
        dateDisplay: parsedDate ? formatDate(parsedDate) : rawDate || '—',
        amount,
        accountAmountRaw,
        nativeAmount,
        nativeCurrency,
        fxRate,
        needsFx,
        description: description || rawDescription,
        rawDescription,
        payeeId,
        payeeName,
        payeeMatchName,
        suggestedPayee,
        categoryId,
        subCategoryId,
        categoryPath: mapping.categoryPath?.[0] ? normalizeCell(rawRow[mapping.categoryPath[0]]) : undefined,
        notes,
        externalId,
        counterparty,
        balance: balanceValue,
        duplicate,
        fingerprint,
        baseWarnings,
        warnings: [],
        errors,
        issues: [],
        status: 'valid',
        metadata: {
          raw: rawRow
        },
        isDemo: isDemoImport
      };

      row.warnings = computeWarnings(row);
      row.issues = [...row.errors, ...row.warnings];
      row.status = deriveStatus(row);

      rows.push(row);
    });

    return rows;
  }, [
    accounts,
    accountLookup,
    autoMarkTransfers,
    categories,
    existingFingerprints,
    formatOptions.dateFormat,
    formatOptions.decimalSeparator,
    formatOptions.signConvention,
    formatOptions.thousandsSeparator,
    fxOptions.mode,
    fxOptions.rateColumn,
    fxOptions.rateValue,
    isDemoImport,
    mapping.balance,
    mapping.categoryPath,
    mapping.counterparty,
    mapping.credit,
    mapping.date,
    mapping.debit,
    mapping.description,
    mapping.externalId,
    mapping.notes,
    mapping.payee,
    mapping.amount,
    payeeByName,
    payees,
    rawRows,
    resolveAccountForRow,
    subCategories,
    transfersCategory,
    transfersSubCategory,
    state.settings.baseCurrency
  ]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  useEffect(() => {
    const rows = buildPreviewRows();
    if (rows.length === 0) {
      setPreviewRows([]);
      return;
    }

    const updated = rows.map((row) => {
      const override = rowOverrides[row.id];
      let payeeId = row.payeeId;
      let payeeName = row.payeeName;
      let categoryId = row.categoryId;
      let subCategoryId = row.subCategoryId;

      if (!categoryId && defaultCategoryId) {
        categoryId = defaultCategoryId;
        if (defaultSubCategoryId) {
          const subMatch = subCategoryById.get(defaultSubCategoryId);
          if (subMatch && subMatch.categoryId === defaultCategoryId) {
            subCategoryId = defaultSubCategoryId;
          }
        }
      }

      if (override) {
        if (override.payeeId !== undefined) {
          payeeId = override.payeeId;
          if (override.payeeId) {
            payeeName = payeeById.get(override.payeeId)?.name ?? payeeName;
          } else if (override.payeeName !== undefined) {
            payeeName = override.payeeName ?? '';
          } else {
            payeeName = '';
          }
        }
        if (override.payeeName !== undefined && override.payeeId === undefined) {
          payeeId = override.payeeId ?? null;
          payeeName = override.payeeName ?? '';
        }
        if (override.categoryId !== undefined) {
          const candidate = override.categoryId ? categoryById.get(override.categoryId) : undefined;
          categoryId = candidate ? candidate.id : null;
          if (!candidate) {
            subCategoryId = null;
          }
        }
        if (override.subCategoryId !== undefined) {
          const candidate = override.subCategoryId ? subCategoryById.get(override.subCategoryId) : undefined;
          if (candidate && (override.categoryId ? candidate.categoryId === override.categoryId : categoryId === candidate.categoryId)) {
            subCategoryId = candidate.id;
          } else if (override.subCategoryId === null) {
            subCategoryId = null;
          }
        }
      }

      if (categoryId && !categoryById.has(categoryId)) {
        categoryId = null;
      }
      if (subCategoryId && !subCategoryById.has(subCategoryId)) {
        subCategoryId = null;
      }

      const next: PreviewRow = {
        ...row,
        payeeId,
        payeeName,
        categoryId,
        subCategoryId
      };

      next.warnings = computeWarnings(next);
      next.issues = [...next.errors, ...next.warnings];
      next.status = deriveStatus(next);
      return next;
    });

    setPreviewRows(updated);
  }, [
    buildPreviewRows,
    categoryById,
    defaultCategoryId,
    defaultSubCategoryId,
    payeeById,
    rowOverrides,
    subCategoryById
  ]);

  const hasPreview = previewRows.length > 0;

  const statusCounts = useMemo(
    () =>
      previewRows.reduce(
        (acc, row) => {
          acc[row.status] = (acc[row.status] ?? 0) + 1;
          if (row.duplicate) {
            acc.duplicateTotal += 1;
          }
          return acc;
        },
        (() => {
          const totals: Record<PreviewRowStatus | 'duplicateTotal', number> = {
            valid: 0,
            warning: 0,
            duplicate: 0,
            invalid: 0,
            'needs-fx': 0,
            duplicateTotal: 0
          };
          return totals;
        })()
      ),
    [previewRows]
  );

  const warningCount = useMemo(
    () => previewRows.filter((row) => row.warnings.length > 0 && row.status !== 'invalid').length,
    [previewRows]
  );

  const needsFxCount = useMemo(
    () => previewRows.filter((row) => row.status === 'needs-fx').length,
    [previewRows]
  );

  const importableRows = useMemo(
    () =>
      previewRows.filter((row) => {
        if (row.status === 'invalid') return false;
        if (row.status === 'needs-fx') return false;
        if (row.duplicate && !includeDuplicates) return false;
        return true;
      }),
    [includeDuplicates, previewRows]
  );

  const totalsByCurrency = useMemo(() => {
    const totals: ImportBatchSummary['totalsByCurrency'] = {};
    importableRows.forEach((row) => {
      if (row.amount === null) return;
      const bucket = (totals[row.accountCurrency] ||= { debit: 0, credit: 0 });
      if (row.amount < 0) {
        bucket.debit += Math.abs(row.amount);
      } else {
        bucket.credit += row.amount;
      }
    });
    Object.keys(totals).forEach((key) => {
      totals[key].debit = Number.parseFloat(totals[key].debit.toFixed(2));
      totals[key].credit = Number.parseFloat(totals[key].credit.toFixed(2));
    });
    return totals;
  }, [importableRows]);

  const importDateRange = useMemo(() => {
    const dates = importableRows
      .map((row) => row.date)
      .filter((value): value is string => Boolean(value))
      .sort();
    if (dates.length === 0) {
      return { earliest: null, latest: null };
    }
    return { earliest: dates[0], latest: dates[dates.length - 1] };
  }, [importableRows]);

  const fxAppliedCount = useMemo(
    () => importableRows.filter((row) => row.fxRate && !row.needsFx).length,
    [importableRows]
  );

  const hasConflicts = useMemo(
    () => previewRows.some((row) => row.status === 'invalid' || row.status === 'duplicate' || row.status === 'needs-fx'),
    [previewRows]
  );

  const detectedProfile = useMemo(
    () => (!profileBannerDismissed ? matchedProfile : null),
    [matchedProfile, profileBannerDismissed]
  );

  const sanitizeOverride = useCallback((override: RowOverride): RowOverride | null => {
    const next: RowOverride = {};
    if (Object.prototype.hasOwnProperty.call(override, 'payeeId')) {
      next.payeeId = override.payeeId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(override, 'payeeName')) {
      next.payeeName = override.payeeName ?? '';
    }
    if (Object.prototype.hasOwnProperty.call(override, 'categoryId')) {
      next.categoryId = override.categoryId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(override, 'subCategoryId')) {
      next.subCategoryId = override.subCategoryId ?? null;
    }
    return Object.keys(next).length > 0 ? next : null;
  }, []);

  const mergeRowOverride = useCallback(
    (rowId: string, changes: RowOverride) => {
      setRowOverrides((prev) => {
        const merged: RowOverride = { ...(prev[rowId] ?? {}), ...changes };
        const sanitized = sanitizeOverride(merged);
        if (!sanitized) {
          if (prev[rowId]) {
            const { [rowId]: _removed, ...rest } = prev;
            return rest;
          }
          return prev;
        }
        return { ...prev, [rowId]: sanitized };
      });
    },
    [sanitizeOverride]
  );

  const handlePayeeSelect = useCallback(
    (rowId: string, payeeId: string | null) => {
      const payee = payeeId ? payeeById.get(payeeId) : null;
      mergeRowOverride(rowId, {
        payeeId,
        payeeName: payee?.name ?? ''
      });
    },
    [mergeRowOverride, payeeById]
  );

  const handlePayeeNameChange = useCallback(
    (rowId: string, name: string) => {
      mergeRowOverride(rowId, {
        payeeId: null,
        payeeName: name
      });
    },
    [mergeRowOverride]
  );

  const handleCategorySelect = useCallback(
    (rowId: string, categoryId: string | null) => {
      const valid = categoryId ? categoryById.get(categoryId) : null;
      mergeRowOverride(rowId, {
        categoryId: valid ? valid.id : null,
        subCategoryId: null
      });
    },
    [categoryById, mergeRowOverride]
  );

  const handleSubCategorySelect = useCallback(
    (rowId: string, subCategoryId: string | null) => {
      const valid = subCategoryId ? subCategoryById.get(subCategoryId) : null;
      mergeRowOverride(rowId, {
        subCategoryId: valid ? valid.id : null
      });
    },
    [mergeRowOverride, subCategoryById]
  );

  const handleFillDown = useCallback(
    (rowId: string, field: 'payee' | 'category') => {
      const source = previewRows.find((row) => row.id === rowId);
      if (!source) return;
      setRowOverrides((prev) => {
        const next = { ...prev };
        previewRows
          .filter((row) => row.index >= source.index)
          .forEach((row) => {
            const existing = next[row.id] ?? {};
            const draft: RowOverride = { ...existing };
            if (field === 'payee') {
              draft.payeeId = source.payeeId ?? null;
              draft.payeeName = source.payeeName ?? '';
            } else {
              draft.categoryId = source.categoryId ?? null;
              draft.subCategoryId = source.subCategoryId ?? null;
            }
            const sanitized = sanitizeOverride(draft);
            if (sanitized) {
              next[row.id] = sanitized;
            } else {
              delete next[row.id];
            }
          });
        return next;
      });
    },
    [previewRows, sanitizeOverride]
  );

  const updateMappingField = useCallback((field: ImportField, values: string[]) => {
    setMapping((current) => {
      const next = { ...current } as ImportColumnMapping;
      if (values.length === 0) {
        delete next[field];
      } else {
        next[field] = values;
      }
      return next;
    });
  }, []);

  const handleMappingSingleChange = useCallback(
    (field: ImportField, value: string) => {
      updateMappingField(field, value ? [value] : []);
    },
    [updateMappingField]
  );

  const handleMappingMultiChange = useCallback(
    (field: ImportField, values: string[]) => {
      updateMappingField(field, values);
    },
    [updateMappingField]
  );

  const handleFxModeChange = useCallback(
    (mode: FxMode) => {
      setFxOptions((prev) => ({ ...prev, mode }));
    },
    []
  );

  const handleFxRateChange = useCallback(
    (rate: string) => {
      setFxOptions((prev) => ({ ...prev, rateValue: rate }));
    },
    []
  );

  const handleFxRateColumnChange = useCallback(
    (column: string) => {
      setFxOptions((prev) => ({ ...prev, rateColumn: column || undefined }));
    },
    []
  );

  const handleIncludeDuplicatesToggle = useCallback((value: boolean) => {
    setIncludeDuplicates(value);
  }, []);

  const handleAutoMarkTransfersToggle = useCallback((value: boolean) => {
    setAutoMarkTransfers(value);
  }, []);

  const handleDefaultCategoryChange = useCallback(
    (categoryId: string) => {
      setDefaultCategoryId(categoryId);
      if (!categoryId) {
        setDefaultSubCategoryId('');
        return;
      }
      const list = subCategoriesByCategory.get(categoryId) ?? [];
      if (!list.some((item) => item.id === defaultSubCategoryId)) {
        setDefaultSubCategoryId('');
      }
    },
    [defaultSubCategoryId, subCategoriesByCategory]
  );

  const handleDefaultSubCategoryChange = useCallback((subId: string) => {
    setDefaultSubCategoryId(subId);
  }, []);

  const handleApplyDefaultCategoryToAll = useCallback(() => {
    if (!defaultCategoryId) return;
    const categoryId = defaultCategoryId;
    const subId = defaultSubCategoryId || null;
    setRowOverrides((prev) => {
      const next = { ...prev };
      previewRows.forEach((row) => {
        if (!row.categoryId) {
          const draft: RowOverride = { ...(next[row.id] ?? {}), categoryId, subCategoryId: subId };
          const sanitized = sanitizeOverride(draft);
          if (sanitized) {
            next[row.id] = sanitized;
          }
        }
      });
      return next;
    });
  }, [defaultCategoryId, defaultSubCategoryId, previewRows, sanitizeOverride]);

  const handleRememberProfileToggle = useCallback((value: boolean) => {
    setRememberProfile(value);
  }, []);

  const handleProfileSelect = useCallback(
    (profileId: string) => {
      if (!profileId) return;
      const profile = profileOptions.find((item) => item.id === profileId);
      if (profile) {
        applyProfile(profile);
      }
    },
    [applyProfile, profileOptions]
  );

  const handleDeleteProfileClick = useCallback(() => {
    if (matchedProfile) {
      deleteImportProfile(matchedProfile.id);
      setMatchedProfile(null);
      setProfileBannerDismissed(true);
    }
  }, [deleteImportProfile, matchedProfile]);

  const handleDismissProfileBanner = useCallback(() => {
    setProfileBannerDismissed(true);
  }, []);

  const accountResolutionSatisfied = Boolean(selectedAccountId || accountColumn);

  const requiredMappingComplete = useMemo(() => {
    const hasDate = Boolean(mapping.date && mapping.date.length > 0);
    const hasDescription = Boolean(mapping.description && mapping.description.length > 0);
    let hasAmount = false;
    if (formatOptions.signConvention === 'positive-credit') {
      hasAmount = Boolean(mapping.amount && mapping.amount.length > 0);
    } else {
      hasAmount = Boolean((mapping.debit && mapping.debit.length > 0) || (mapping.credit && mapping.credit.length > 0));
    }
    return hasDate && hasDescription && hasAmount && accountResolutionSatisfied;
  }, [accountResolutionSatisfied, formatOptions.signConvention, mapping.amount, mapping.credit, mapping.date, mapping.debit, mapping.description]);

  const duplicateRows = useMemo(() => previewRows.filter((row) => row.duplicate), [previewRows]);
  const invalidRows = useMemo(() => previewRows.filter((row) => row.status === 'invalid'), [previewRows]);
  const needsFxRows = useMemo(() => previewRows.filter((row) => row.status === 'needs-fx'), [previewRows]);

  const summaryStats = useMemo(
    () => ({
      imported: importableRows.length,
      duplicates: duplicateRows.length,
      invalid: invalidRows.length,
      needsFx: needsFxRows.length,
      warnings: warningCount
    }),
    [duplicateRows, importableRows, invalidRows, needsFxRows, warningCount]
  );

  const defaultSubCategoryOptions = useMemo(
    () => (defaultCategoryId ? subCategoriesByCategory.get(defaultCategoryId) ?? [] : []),
    [defaultCategoryId, subCategoriesByCategory]
  );

  const savedProfileOptions = useMemo(
    () =>
      [...profileOptions]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((profile) => ({ value: profile.id, label: profile.name })),
    [profileOptions]
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: `${account.name} (${account.currency})`
      })),
    [accounts]
  );

  const accountColumnOptions = useMemo(() => headers.filter((header) => header), [headers]);

  const previewSample = useMemo(() => previewRows.slice(0, 1000), [previewRows]);

  const currentStepIndex = useMemo(() => steps.findIndex((item) => item.id === step), [step]);

  const duplicatesDetectedCount = duplicateRows.length;

  const handleLoadDemo = useCallback(async () => {
    const selection = DEMO_IMPORTS.find((item) => item.id === demoSelection);
    if (!selection) return;
    setImportError(null);
    setUploadError(null);
    setLoading(true);
    try {
      const response = await fetch(selection.file);
      if (!response.ok) {
        throw new Error('Unable to load demo file');
      }
      const text = await response.text();
      try {
        const parsed = parseCsvText(text);
        if (parsed.fields.length === 0) {
          throw new Error('Missing header row.');
        }
        const rows = buildRowsFromCsv(parsed.fields, parsed.rows);
        setLoading(false);
        handleFileParse(rows, parsed.fields, `${selection.profileName} Demo`);
        setMapping(selection.mapping);
        setFormatOptions(selection.format);
        setFxOptions(selection.fx ?? { mode: 'single-rate', rateValue: '1.00' });
        setProfileName(selection.profileName);
        setRememberProfile(false);
        setMatchedProfile(null);
        setIsDemoImport(true);
        setAccountColumn(null);
        setStep('mapping');
      } catch (parseError) {
        setLoading(false);
        setUploadError('Failed to load demo file.');
      }
    } catch (error) {
      setLoading(false);
      setUploadError('Unable to load the demo CSV.');
    }
  }, [demoSelection, handleFileParse, setFormatOptions, setMapping]);

  const handleClearDemoTransactions = useCallback(() => {
    if (!selectedAccountId) {
      setUploadError('Select an account before clearing demo transactions.');
      return;
    }
    clearDemoTransactionsForAccount(selectedAccountId);
  }, [clearDemoTransactionsForAccount, selectedAccountId]);

  const handleExecuteImport = useCallback(async () => {
    if (importing) return;
    if (importableRows.length === 0) {
      setImportError('No rows ready for import. Resolve errors or enable duplicates.');
      return;
    }
    setImportError(null);
    setImporting(true);
    try {
      const batchId = generateId('imp');
      const now = new Date().toISOString();
      let profileForBatch = matchedProfile;
      if (rememberProfile) {
        const saved = saveImportProfile({
          id: matchedProfile?.id,
          name: profileName.trim() || matchedProfile?.name || fileName.replace(/\.csv$/i, ''),
          headerFingerprint,
          fieldMapping: mapping,
          format: formatOptions,
          transforms: matchedProfile?.transforms ?? {}
        });
        profileForBatch = saved;
        setMatchedProfile(saved);
      }

      const transactions = importableRows
        .filter((row) => row.accountId && row.date && row.amount !== null)
        .map((row) => {
          let categoryId = row.categoryId;
          let subCategoryId = row.subCategoryId;
          if ((!categoryId || !subCategoryId) && row.payeeId) {
            const payee = payeeById.get(row.payeeId);
            if (payee) {
              categoryId = categoryId ?? payee.defaultCategoryId ?? null;
              subCategoryId = subCategoryId ?? payee.defaultSubCategoryId ?? null;
            }
          }
          const transaction = addTransaction({
            accountId: row.accountId!,
            payeeId: row.payeeId ?? null,
            date: row.date!,
            amount: row.amount!,
            currency: row.accountCurrency,
            nativeAmount: row.nativeAmount ?? row.amount!,
            nativeCurrency: row.nativeCurrency,
            fxRate: row.fxRate ?? null,
            needsFx: row.needsFx,
            description: row.description,
            rawDescription: row.rawDescription,
            memo: row.notes,
            categoryId: categoryId ?? null,
            subCategoryId: subCategoryId ?? null,
            tags: [],
            importBatchId: batchId,
            metadata: {
              source: 'csv-import',
              raw: row.metadata.raw,
              issues: row.issues,
              suggestedPayee: row.suggestedPayee
            },
            isDemo: row.isDemo ?? false
          });
          return transaction;
        });

      const transactionIds = transactions.map((txn) => txn.id);

      const fxRateValue = fxOptions.mode === 'single-rate'
        ? Number.parseFloat((fxOptions.rateValue || '').replace(',', '.'))
        : undefined;

      const batchSummary: ImportBatchSummary = {
        importedCount: transactions.length,
        duplicateCount: includeDuplicates ? 0 : duplicateRows.length,
        invalidCount: invalidRows.length,
        fxAppliedCount,
        needsFxCount,
        earliestDate: importDateRange.earliest,
        latestDate: importDateRange.latest,
        totalsByCurrency
      };

      const batch = createImportBatch({
        id: batchId,
        accountId: selectedAccount?.id ?? importableRows[0]?.accountId ?? '',
        profileId: profileForBatch?.id ?? null,
        profileName: profileForBatch?.name ?? null,
        createdAt: now,
        sourceFileName: fileName || 'Uploaded CSV',
        headerFingerprint,
        options: {
          ...formatOptions,
          rememberProfile,
          fxMode: fxOptions.mode,
          fxRate: fxOptions.mode === 'single-rate' && Number.isFinite(fxRateValue) ? fxRateValue : undefined,
          fxRateColumn: fxOptions.mode === 'rate-column' ? fxOptions.rateColumn : undefined,
          includeDuplicates,
          autoMarkTransfers,
          defaultCategoryId: defaultCategoryId || null,
          defaultSubCategoryId: defaultSubCategoryId || null
        },
        summary: batchSummary,
        transactionIds,
        log: [
          {
            timestamp: now,
            message: `Imported ${importableRows.length} rows (${transactions.length} persisted).`
          },
          {
            timestamp: now,
            message: `Duplicates skipped: ${duplicateRows.length}, invalid skipped: ${invalidRows.length}, needs FX: ${needsFxCount}.`
          }
        ],
        isDemo: isDemoImport
      });

      setSummary(batchSummary);
      setCreatedBatch(batch);
      setStep('summary');
    } catch (error) {
      setImportError('Import failed. Please review the configuration and try again.');
    } finally {
      setImporting(false);
    }
  }, [
    addTransaction,
    autoMarkTransfers,
    createImportBatch,
    defaultCategoryId,
    defaultSubCategoryId,
    duplicateRows,
    formatOptions,
    fxAppliedCount,
    fxOptions.mode,
    fxOptions.rateColumn,
    fxOptions.rateValue,
    importDateRange,
    importableRows,
    importing,
    invalidRows,
    isDemoImport,
    matchedProfile,
    rememberProfile,
    saveImportProfile,
    selectedAccount,
    totalsByCurrency,
    fileName,
    headerFingerprint,
    mapping,
    payeeById,
    profileName,
    needsFxCount,
    includeDuplicates
  ]);

  const handleUndoLastImport = useCallback(() => {
    undoLastImport();
    setSummary(null);
    setCreatedBatch(null);
  }, [undoLastImport]);

  const handleProceedToPreview = useCallback(() => {
    const rows = buildPreviewRows();
    setPreviewRows(rows);
    setStep('preview');
  }, [buildPreviewRows]);

  const handleProceedToConflicts = useCallback(() => {
    setStep('conflicts');
  }, []);

  const handleProceedToImportStep = useCallback(() => {
    setStep('import');
  }, []);

  const handleRestart = useCallback(() => {
    resetWizard();
  }, [resetWizard]);

  const handleStepClick = useCallback(
    (target: WizardStep) => {
      const targetIndex = steps.findIndex((entry) => entry.id === target);
      const currentIndex = steps.findIndex((entry) => entry.id === step);
      if (targetIndex <= currentIndex) {
        setStep(target);
      }
    },
    [step]
  );

  const renderUploadStep = () => (
    <div className="content-stack">
      <div className="form-card">
        <div className="card-header">
          <div>
            <h3>Upload source CSV</h3>
            <p className="muted-text">Accepts comma-separated (.csv) files with header rows.</p>
          </div>
          <a className="help-link" href={HELP_HREF} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
        <div className="field">
          <label htmlFor="import-account">
            Account
            <Tooltip label="Transactions will be imported into this account unless the CSV includes an account column." />
          </label>
          <select
            id="import-account"
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
          >
            <option value="">Select an account…</option>
            {accountOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {selectedAccount && (
            <p className="muted-text small">Account currency: {selectedAccount.currency}</p>
          )}
        </div>
        <div className="field">
          <label htmlFor="account-column">
            Account column (optional)
            <Tooltip label="If your CSV contains account name or number, choose the column to map rows automatically." />
          </label>
          <select
            id="account-column"
            value={accountColumn ?? ''}
            onChange={(event) => setAccountColumn(event.target.value || null)}
          >
            <option value="">None</option>
            {accountColumnOptions.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
        </div>
        <div className={`dropzone${loading ? ' loading' : ''}`} onDragOver={handleDragOver} onDrop={handleDrop}>
          <p>{loading ? 'Parsing file…' : 'Drag & drop a CSV file or choose one from your computer.'}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose file
          </button>
          <input
            ref={fileInputRef}
            id="import-file-input"
            type="file"
            accept=".csv"
            onChange={handleFileInputChange}
          />
          {fileName && <p className="muted-text small">Selected file: {fileName}</p>}
        </div>
        {uploadError && <div className="alert error">{uploadError}</div>}
      </div>
      <div className="form-card">
        <div className="card-header">
          <div>
            <h3>Demo CSVs</h3>
            <p className="muted-text">Use demo data to test the wizard and multi-step flow quickly.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="demo-selection">Choose demo file</label>
          <select
            id="demo-selection"
            value={demoSelection}
            onChange={(event) => setDemoSelection(event.target.value)}
          >
            {DEMO_IMPORTS.map((demo) => (
              <option key={demo.id} value={demo.id}>
                {demo.label}
              </option>
            ))}
          </select>
        </div>
        <div className="demo-actions">
          <button type="button" className="secondary-button" onClick={handleLoadDemo} disabled={loading}>
            Load demo CSV to selected account
          </button>
          <button type="button" className="secondary-button" onClick={handleClearDemoTransactions}>
            Clear demo transactions from selected account
          </button>
        </div>
        <div className="demo-links">
          {DEMO_IMPORTS.map((demo) => (
            <a key={demo.id} href={demo.file} download>
              Download {demo.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMappingStep = () => {
    const renderFieldRow = (field: ImportField, label: string, required = false, allowMultiple = false) => {
      if (allowMultiple) {
        const value = mapping[field] ?? [];
        return (
          <tr key={field}>
            <th scope="row">
              {label}
              {required ? <span className="required-pill">Required</span> : <span className="optional-pill">Optional</span>}
            </th>
            <td>
              <select
                multiple
                value={value}
                onChange={(event) =>
                  handleMappingMultiChange(
                    field,
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
              >
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        );
      }
      const value = mapping[field]?.[0] ?? '';
      return (
        <tr key={field}>
          <th scope="row">
            {label}
            {required ? <span className="required-pill">Required</span> : <span className="optional-pill">Optional</span>}
          </th>
          <td>
            <select value={value} onChange={(event) => handleMappingSingleChange(field, event.target.value)}>
              <option value="">— No column —</option>
              {headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </td>
        </tr>
      );
    };

    const requiredRows: JSX.Element[] = [
      renderFieldRow('date', 'Date', true),
      renderFieldRow('description', 'Description', true, true)
    ];
    if (formatOptions.signConvention === 'positive-credit') {
      requiredRows.push(renderFieldRow('amount', 'Amount', true));
    } else {
      requiredRows.push(renderFieldRow('debit', 'Debit', true));
      requiredRows.push(renderFieldRow('credit', 'Credit', true));
    }

    const optionalRows: JSX.Element[] = [
      renderFieldRow('payee', 'Payee'),
      renderFieldRow('counterparty', 'Counterparty'),
      renderFieldRow('currency', 'Currency'),
      renderFieldRow('balance', 'Balance'),
      renderFieldRow('externalId', 'External ID / Reference'),
      renderFieldRow('categoryPath', 'Category path'),
      renderFieldRow('notes', 'Notes')
    ];

    return (
      <div className="content-stack">
        <div className="form-card">
          <div className="card-header">
            <div>
              <h3>Column mapping</h3>
              <p className="muted-text">Match CSV headers to the fields required for import.</p>
            </div>
            <a className="help-link" href={HELP_HREF} target="_blank" rel="noreferrer">
              Help
            </a>
          </div>
          {detectedProfile && (
            <div className="banner success">
              <div>
                Detected profile: <strong>{detectedProfile.name}</strong>
              </div>
              <div className="banner-actions">
                <button type="button" className="secondary-button" onClick={() => applyProfile(detectedProfile)}>
                  Re-apply profile
                </button>
                <button type="button" className="link-button" onClick={handleDismissProfileBanner}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="profile-select">Load saved profile</label>
            <select
              id="profile-select"
              value=""
              onChange={(event) => handleProfileSelect(event.target.value)}
            >
              <option value="">Select a profile…</option>
              {savedProfileOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {matchedProfile && (
              <button type="button" className="link-button" onClick={handleDeleteProfileClick}>
                Delete profile
              </button>
            )}
          </div>
          <table className="mapping-table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">CSV column</th>
              </tr>
            </thead>
            <tbody>
              {requiredRows}
              <tr className="section-divider">
                <th colSpan={2}>Optional columns</th>
              </tr>
              {optionalRows}
            </tbody>
          </table>
        </div>
        <div className="form-card">
          <h3>Format options</h3>
          <div className="form-grid two-column">
            <div className="field">
              <label htmlFor="date-format">
                Date format
                <Tooltip label="Select the pattern that matches the date column." />
              </label>
              <select
                id="date-format"
                value={formatOptions.dateFormat}
                onChange={(event) =>
                  setFormatOptions((prev) => ({ ...prev, dateFormat: event.target.value }))
                }
              >
                {dateFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="decimal-separator">
                Decimal separator
                <Tooltip label="How decimals are represented in amount columns." />
              </label>
              <select
                id="decimal-separator"
                value={formatOptions.decimalSeparator}
                onChange={(event) =>
                  setFormatOptions((prev) => ({ ...prev, decimalSeparator: event.target.value as '.' | ',' }))
                }
              >
                {decimalSeparatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="thousands-separator">
                Thousands separator
                <Tooltip label="Characters used to group thousands in amount columns." />
              </label>
              <select
                id="thousands-separator"
                value={formatOptions.thousandsSeparator}
                onChange={(event) =>
                  setFormatOptions((prev) => ({
                    ...prev,
                    thousandsSeparator: event.target.value as ',' | '.' | ' '
                  }))
                }
              >
                {thousandSeparatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sign-convention">
                Sign convention
                <Tooltip label="Choose whether your file uses signed amounts or separate debit/credit columns." />
              </label>
              <select
                id="sign-convention"
                value={formatOptions.signConvention}
                onChange={(event) =>
                  setFormatOptions((prev) => ({
                    ...prev,
                    signConvention: event.target.value as ImportFormatOptions['signConvention']
                  }))
                }
              >
                {signConventionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="form-card">
          <h3>FX handling</h3>
          <div className="field-group">
            {fxModeOptions.map((option) => (
              <label key={option.value} className="radio-option">
                <input
                  type="radio"
                  name="fx-mode"
                  value={option.value}
                  checked={fxOptions.mode === option.value}
                  onChange={() => handleFxModeChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          {fxOptions.mode === 'single-rate' && (
            <div className="field">
              <label htmlFor="fx-rate">
                FX rate
                <Tooltip label="Apply a single conversion rate to every row." />
              </label>
              <input
                id="fx-rate"
                type="text"
                value={fxOptions.rateValue}
                onChange={(event) => handleFxRateChange(event.target.value)}
                placeholder="1.00"
              />
            </div>
          )}
          {fxOptions.mode === 'rate-column' && (
            <div className="field">
              <label htmlFor="fx-rate-column">
                Rate column name
                <Tooltip label="Choose the column that provides a rate per row." />
              </label>
              <select
                id="fx-rate-column"
                value={fxOptions.rateColumn ?? ''}
                onChange={(event) => handleFxRateColumnChange(event.target.value)}
              >
                <option value="">— No column —</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          )}
          {fxOptions.mode === 'skip' && (
            <p className="muted-text small">
              Rows with mismatched currency will be flagged as needing FX before they can be imported.
            </p>
          )}
        </div>
        <div className="form-card">
          <h3>Mapping profile</h3>
          <div className="field checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={rememberProfile}
                onChange={(event) => handleRememberProfileToggle(event.target.checked)}
              />
              Remember this mapping as a profile
            </label>
          </div>
          <div className="field">
            <label htmlFor="profile-name">Profile name</label>
            <input
              id="profile-name"
              type="text"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="e.g. Bank statement"
              disabled={!rememberProfile}
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setStep('upload')}>
            Back
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleProceedToPreview}
            disabled={!requiredMappingComplete || rawRows.length === 0}
          >
            Build preview
          </button>
        </div>
        {!accountResolutionSatisfied && (
          <div className="alert warning">Select an account or account column before continuing.</div>
        )}
      </div>
    );
  };

  const renderPreviewStep = () => (
    <div className="content-stack">
      <div className="form-card">
        <div className="card-header">
          <div>
            <h3>Preview normalised rows</h3>
            <p className="muted-text">Review transformations, resolve payees, and assign categories.</p>
          </div>
          <a className="help-link" href={HELP_HREF} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
        <div className="status-summary">
          <div className="status-pill status-valid">Valid: {statusCounts.valid}</div>
          <div className="status-pill status-warning">Warnings: {warningCount}</div>
          <div className="status-pill status-duplicate">Duplicates: {duplicatesDetectedCount}</div>
          <div className="status-pill status-needs-fx">Needs FX: {needsFxCount}</div>
          <div className="status-pill status-invalid">Invalid: {statusCounts.invalid}</div>
        </div>
        <div className="preview-controls">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={includeDuplicates}
              onChange={(event) => handleIncludeDuplicatesToggle(event.target.checked)}
            />
            Include duplicates if present
            <Tooltip label="Duplicates are detected by date, amount, description, and account. They remain greyed out unless you opt in." />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={autoMarkTransfers}
              onChange={(event) => handleAutoMarkTransfersToggle(event.target.checked)}
            />
            Auto-mark internal transfers
            <Tooltip label="Flag rows mentioning your own account names or transfer keywords as transfers." />
          </label>
          <div className="field inline-field">
            <label htmlFor="default-category">Default category</label>
            <select
              id="default-category"
              value={defaultCategoryId}
              onChange={(event) => handleDefaultCategoryChange(event.target.value)}
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {defaultCategoryId && (
              <select
                value={defaultSubCategoryId}
                onChange={(event) => handleDefaultSubCategoryChange(event.target.value)}
              >
                <option value="">No sub-category</option>
                {defaultSubCategoryOptions.map((subCategory) => (
                  <option key={subCategory.id} value={subCategory.id}>
                    {subCategory.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={handleApplyDefaultCategoryToAll}
              disabled={!defaultCategoryId}
            >
              Fix all unmapped categories
            </button>
          </div>
        </div>
      </div>
      <div className="content-card">
        <div className="table-header">
          <h3>
            Preview table <span className="muted-text">(showing first {previewSample.length.toLocaleString()} rows)</span>
          </h3>
          <div className="table-actions">
            <button type="button" className="secondary-button" onClick={() => setStep('mapping')}>
              Back to mapping
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleProceedToConflicts}
              disabled={!hasPreview}
            >
              Review conflicts
            </button>
          </div>
        </div>
        {hasPreview ? (
          <div className="preview-table-wrapper">
            <table className="preview-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Account</th>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Payee</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {previewSample.map((row) => {
                  const subOptions = subCategoriesByCategory.get(row.categoryId ?? '') ?? [];
                  return (
                    <tr key={row.id} className={`status-${row.status}`}>
                      <td>{row.index + 1}</td>
                      <td>
                        <div>{row.accountName ?? '—'}</div>
                        <div className="muted-text small">{row.accountCurrency}</div>
                      </td>
                      <td>{row.dateDisplay}</td>
                      <td>
                        <div>{row.description || row.rawDescription || '—'}</div>
                        {row.rawDescription && row.rawDescription !== row.description && (
                          <div className="muted-text small">Raw: {row.rawDescription}</div>
                        )}
                      </td>
                      <td>
                        {row.amount !== null ? (
                          <div>
                            {formatCurrency(row.amount, row.accountCurrency)}
                            {row.nativeCurrency && row.nativeCurrency !== row.accountCurrency && row.nativeAmount !== null && (
                              <div className="muted-text small">
                                Native {formatCurrency(row.nativeAmount, row.nativeCurrency)}{' '}
                                {row.fxRate ? `(rate ${row.fxRate.toFixed(4)})` : null}
                              </div>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <div className="field">
                          <select
                            value={row.payeeId ?? ''}
                            onChange={(event) => handlePayeeSelect(row.id, event.target.value || null)}
                          >
                            <option value="">Unassigned</option>
                            {payees.map((payee) => (
                              <option key={payee.id} value={payee.id}>
                                {payee.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <input
                            type="text"
                            value={row.payeeName ?? ''}
                            onChange={(event) => handlePayeeNameChange(row.id, event.target.value)}
                            placeholder="Custom payee"
                          />
                        </div>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleFillDown(row.id, 'payee')}
                        >
                          Fill down
                        </button>
                        {row.payeeMatchName && (
                          <span className="badge success">Payee match: {row.payeeMatchName}</span>
                        )}
                        {!row.payeeId && row.suggestedPayee && (
                          <span className="badge info">Suggested: {row.suggestedPayee}</span>
                        )}
                      </td>
                      <td>
                        <div className="field">
                          <select
                            value={row.categoryId ?? ''}
                            onChange={(event) => handleCategorySelect(row.id, event.target.value || null)}
                          >
                            <option value="">Uncategorised</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <select
                            value={row.subCategoryId ?? ''}
                            onChange={(event) => handleSubCategorySelect(row.id, event.target.value || null)}
                          >
                            <option value="">No sub-category</option>
                            {subOptions.map((subCategory) => (
                              <option key={subCategory.id} value={subCategory.id}>
                                {subCategory.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleFillDown(row.id, 'category')}
                        >
                          Fill down
                        </button>
                        {row.categoryPath && (
                          <span className="badge info">Source: {row.categoryPath}</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-chip status-${row.status}`}>{row.status.replace('-', ' ')}</span>
                        {row.duplicate && !includeDuplicates && (
                          <span className="badge warning">Duplicate excluded</span>
                        )}
                        {row.needsFx && <span className="badge warning">Needs FX</span>}
                      </td>
                      <td>
                        {row.issues.length > 0 ? (
                          <ul className="issue-list">
                            {row.issues.map((issue, idx) => (
                              <li key={`${row.id}-issue-${idx}`}>{issue}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="muted-text">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted-text">Upload a CSV file to see the preview.</p>
        )}
      </div>
    </div>
  );

  const renderConflictsStep = () => (
    <div className="content-stack">
      <div className="form-card">
        <div className="card-header">
          <div>
            <h3>Conflicts &amp; duplicates</h3>
            <p className="muted-text">Resolve duplicates, FX gaps, and validation errors before import.</p>
          </div>
          <a className="help-link" href={HELP_HREF} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
        <div className="conflict-summary-grid">
          <div className="conflict-card">
            <h4>Duplicates</h4>
            <p>
              {duplicatesDetectedCount.toLocaleString()} detected.{' '}
              {includeDuplicates ? 'They will be imported intentionally.' : 'They are excluded by default.'}
            </p>
            <p className="muted-text small">
              Toggle “Include duplicates” in the previous step if you are re-importing corrected rows.
            </p>
            <ul className="conflict-list">
              {duplicateRows.slice(0, 5).map((row) => (
                <li key={`dup-${row.id}`}>
                  <strong>{row.date ? formatDate(row.date) : row.dateDisplay}</strong> — {row.description}
                  <span className="muted-text small"> {formatCurrency(row.amount ?? 0, row.accountCurrency)}</span>
                </li>
              ))}
              {duplicateRows.length === 0 && <li className="muted-text">No duplicates detected.</li>}
            </ul>
          </div>
          <div className="conflict-card">
            <h4>Needs FX</h4>
            <p>{needsFxCount.toLocaleString()} rows waiting for conversion.</p>
            <p className="muted-text small">
              Provide a single rate, choose a rate column, or skip conversion to flag these rows for later.
            </p>
            <ul className="conflict-list">
              {needsFxRows.slice(0, 5).map((row) => (
                <li key={`fx-${row.id}`}>
                  <strong>{row.dateDisplay}</strong> — {row.description}
                  <span className="muted-text small"> {row.nativeCurrency}</span>
                </li>
              ))}
              {needsFxRows.length === 0 && <li className="muted-text">All rows have FX handled.</li>}
            </ul>
          </div>
          <div className="conflict-card">
            <h4>Invalid rows</h4>
            <p>{invalidRows.length.toLocaleString()} will be skipped.</p>
            <p className="muted-text small">Fix directly in the preview grid and rebuild the conflicts view.</p>
            <ul className="conflict-list">
              {invalidRows.slice(0, 5).map((row) => (
                <li key={`invalid-${row.id}`}>
                  <strong>{row.dateDisplay}</strong> — {row.description}
                  <span className="muted-text small"> {row.errors.join(', ')}</span>
                </li>
              ))}
              {invalidRows.length === 0 && <li className="muted-text">No invalid rows.</li>}
            </ul>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setStep('preview')}>
            Back to preview
          </button>
          <button type="button" className="primary-button" onClick={handleProceedToImportStep}>
            Continue to import
          </button>
        </div>
      </div>
    </div>
  );

  const renderImportStep = () => (
    <div className="content-stack">
      <div className="form-card">
        <div className="card-header">
          <div>
            <h3>Ready to import</h3>
            <p className="muted-text">Confirm totals and FX handling before creating transactions.</p>
          </div>
          <a className="help-link" href={HELP_HREF} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
        <div className="import-summary-grid">
          <div className="summary-box">
            <h4>Rows to import</h4>
            <p className="summary-value">{summaryStats.imported.toLocaleString()}</p>
          </div>
          <div className="summary-box">
            <h4>Duplicates skipped</h4>
            <p className="summary-value">
              {(includeDuplicates ? 0 : duplicatesDetectedCount).toLocaleString()}
            </p>
          </div>
          <div className="summary-box">
            <h4>Invalid skipped</h4>
            <p className="summary-value">{summaryStats.invalid.toLocaleString()}</p>
          </div>
          <div className="summary-box">
            <h4>FX applied</h4>
            <p className="summary-value">{fxAppliedCount.toLocaleString()}</p>
          </div>
          <div className="summary-box">
            <h4>Needs FX flagged</h4>
            <p className="summary-value">{needsFxCount.toLocaleString()}</p>
          </div>
          <div className="summary-box">
            <h4>Date range</h4>
            <p className="summary-value">
              {importDateRange.earliest ? formatDate(importDateRange.earliest) : '—'} →{' '}
              {importDateRange.latest ? formatDate(importDateRange.latest) : '—'}
            </p>
          </div>
        </div>
        <div className="totals-card">
          <h4>Totals by account currency</h4>
          {Object.keys(totalsByCurrency).length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">Currency</th>
                  <th scope="col">Debits</th>
                  <th scope="col">Credits</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(totalsByCurrency).map(([currency, totals]) => (
                  <tr key={currency}>
                    <td>{currency}</td>
                    <td>{formatCurrency(totals.debit, currency)}</td>
                    <td>{formatCurrency(totals.credit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted-text">No totals available yet.</p>
          )}
        </div>
        {importError && <div className="alert error">{importError}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={() => setStep('conflicts')} disabled={importing}>
            Back
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleExecuteImport}
            disabled={importing || importableRows.length === 0}
          >
            {importing ? 'Importing…' : 'Import transactions'}
          </button>
        </div>
        <p className="muted-text small">
          Rules will run in Stage 4. Reports convert to the base currency using your manual exchange rate table
          (Settings → Exchange rates). Live FX is not available in v1.
        </p>
      </div>
    </div>
  );

  const renderSummaryStep = () => (
    <div className="content-stack">
      <div className="form-card">
        <div className="card-header">
          <div>
            <h3>Import summary</h3>
            <p className="muted-text">Review the batch log and totals. Undo is available for the latest batch.</p>
          </div>
          <a className="help-link" href={HELP_HREF} target="_blank" rel="noreferrer">
            Help
          </a>
        </div>
        {summary ? (
          <div className="import-summary-grid">
            <div className="summary-box">
              <h4>Imported</h4>
              <p className="summary-value">{summary.importedCount.toLocaleString()}</p>
            </div>
            <div className="summary-box">
              <h4>Duplicates skipped</h4>
              <p className="summary-value">{summary.duplicateCount.toLocaleString()}</p>
            </div>
            <div className="summary-box">
              <h4>Invalid skipped</h4>
              <p className="summary-value">{summary.invalidCount.toLocaleString()}</p>
            </div>
            <div className="summary-box">
              <h4>FX applied</h4>
              <p className="summary-value">{summary.fxAppliedCount.toLocaleString()}</p>
            </div>
            <div className="summary-box">
              <h4>Needs FX flagged</h4>
              <p className="summary-value">{summary.needsFxCount.toLocaleString()}</p>
            </div>
            <div className="summary-box">
              <h4>Date range</h4>
              <p className="summary-value">
                {summary.earliestDate ? formatDate(summary.earliestDate) : '—'} →{' '}
                {summary.latestDate ? formatDate(summary.latestDate) : '—'}
              </p>
            </div>
          </div>
        ) : (
          <p className="muted-text">No import has been executed yet.</p>
        )}
        {summary && (
          <div className="totals-card">
            <h4>Totals by currency</h4>
            {Object.keys(summary.totalsByCurrency).length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Currency</th>
                    <th scope="col">Debits</th>
                    <th scope="col">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.totalsByCurrency).map(([currency, totals]) => (
                    <tr key={`${currency}-summary`}>
                      <td>{currency}</td>
                      <td>{formatCurrency(totals.debit, currency)}</td>
                      <td>{formatCurrency(totals.credit, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted-text">No totals were calculated.</p>
            )}
          </div>
        )}
        {createdBatch && (
          <div className="batch-card">
            <h4>Batch details</h4>
            <dl>
              <div>
                <dt>Batch ID</dt>
                <dd>{createdBatch.id}</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>{createdBatch.profileName ?? '—'}</dd>
              </div>
              <div>
                <dt>Source file</dt>
                <dd>{createdBatch.sourceFileName}</dd>
              </div>
              <div>
                <dt>Saved at</dt>
                <dd>{new Date(createdBatch.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={handleUndoLastImport}>
            Undo last import
          </button>
          <button type="button" className="primary-button" onClick={handleRestart}>
            Start a new import
          </button>
        </div>
        <p className="muted-text small">
          Rules will run in Stage 4. You can revisit conflicts by selecting a new CSV or loading a saved profile.
        </p>
      </div>
    </div>
  );

  let stepContent: JSX.Element;
  switch (step) {
    case 'upload':
      stepContent = renderUploadStep();
      break;
    case 'mapping':
      stepContent = renderMappingStep();
      break;
    case 'preview':
      stepContent = renderPreviewStep();
      break;
    case 'conflicts':
      stepContent = renderConflictsStep();
      break;
    case 'import':
      stepContent = renderImportStep();
      break;
    case 'summary':
      stepContent = renderSummaryStep();
      break;
    default:
      stepContent = renderUploadStep();
  }

  return (
    <div className="content-stack imports-page">
      <PageHeader
        title="Imports"
        description="Stage 3 import wizard with mapping profiles, FX handling, duplicate detection, and demo data."
      />
      <div className="imports-stepper">
        {steps.map((entry, index) => {
          const isActive = entry.id === step;
          const isComplete = index < currentStepIndex;
          return (
            <button
              key={entry.id}
              type="button"
              className={`step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''}`}
              onClick={() => handleStepClick(entry.id)}
              disabled={!isActive && !isComplete}
            >
              <span className="step-index">{index + 1}</span>
              <span className="step-label">{entry.label}</span>
            </button>
          );
        })}
      </div>
      {stepContent}
    </div>
  );
}

export default Imports;

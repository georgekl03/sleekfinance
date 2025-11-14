import {
  Account,
  Category,
  MasterCategory,
  SettingsState,
  SubCategory,
  Transaction,
  RuleFlowType
} from '../data/models';
import { getFlowTypeForMaster } from './categories';

type YearMode = 'calendar' | 'uk-tax';

type DatePreset = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'custom';

export type ReportFilters = {
  startDate: string;
  endDate: string;
  preset: DatePreset;
  yearMode: YearMode;
  accountIds: string[];
  providerNames: string[];
  collectionIds: string[];
  masterCategoryIds: string[];
  flowTypes: RuleFlowType[];
};

export type CurrencyConverter = {
  toBase: (amount: number, currency: string | undefined | null) => number;
};

type RateEntry = { currency: string; rateToBase: number };

const toDateUtc = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
};

const startOfMonth = (value: Date): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
};

const endOfMonth = (value: Date): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
};

const clampDate = (date: Date, min: Date, max: Date): Date => {
  if (date.getTime() < min.getTime()) return min;
  if (date.getTime() > max.getTime()) return max;
  return date;
};

export const formatIsoDate = (value: Date): string => {
  return value.toISOString().slice(0, 10);
};

const addMonths = (value: Date, count: number): Date => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + count, value.getUTCDate()));
};

export const buildCurrencyConverter = (settings: SettingsState): CurrencyConverter => {
  const rateMap = new Map<string, number>();
  const baseCurrency = settings.baseCurrency.toUpperCase();
  const pushRate = (entry: RateEntry) => {
    const key = entry.currency.toUpperCase();
    if (!rateMap.has(key)) {
      rateMap.set(key, entry.rateToBase);
    }
  };

  settings.exchangeRates.forEach((entry) => pushRate(entry));
  if (!rateMap.has(baseCurrency)) {
    rateMap.set(baseCurrency, 1);
  }

  return {
    toBase: (amount: number, currency: string | undefined | null) => {
      if (!currency) return amount;
      const rate = rateMap.get(currency.toUpperCase()) ?? 1;
      return amount * rate;
    }
  };
};

export const initialiseReportFilters = (
  today: Date,
  defaultCurrencyMode: YearMode = 'calendar'
): ReportFilters => {
  const { start, end } = getPresetRange('this-month', defaultCurrencyMode, today);
  return {
    startDate: formatIsoDate(start),
    endDate: formatIsoDate(end),
    preset: 'this-month',
    yearMode: defaultCurrencyMode,
    accountIds: [],
    providerNames: [],
    collectionIds: [],
    masterCategoryIds: [],
    flowTypes: ['in', 'out', 'interest', 'fees']
  };
};

export const getPresetRange = (
  preset: DatePreset,
  mode: YearMode,
  baseDate: Date
): { start: Date; end: Date } => {
  const today = new Date(baseDate);
  switch (preset) {
    case 'this-month': {
      const start = startOfMonth(today);
      const end = clampDate(endOfMonth(today), start, today);
      return { start, end };
    }
    case 'last-month': {
      const prev = addMonths(startOfMonth(today), -1);
      return { start: prev, end: endOfMonth(prev) };
    }
    case 'this-year': {
      if (mode === 'uk-tax') {
        const { start, end } = getTaxYearRange(today);
        return { start, end };
      }
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      const end = clampDate(new Date(Date.UTC(today.getUTCFullYear(), 11, 31)), start, today);
      return { start, end };
    }
    case 'last-year': {
      if (mode === 'uk-tax') {
        const { start, end } = getTaxYearRange(addMonths(today, -12));
        return { start, end };
      }
      const start = new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
      const end = new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31));
      return { start, end };
    }
    default: {
      const start = startOfMonth(today);
      const end = clampDate(endOfMonth(today), start, today);
      return { start, end };
    }
  }
};

const getTaxYearRange = (reference: Date): { start: Date; end: Date } => {
  const year = reference.getUTCFullYear();
  const taxYearStart = new Date(Date.UTC(year, 3, 6));
  if (reference.getUTCMonth() < 3 || (reference.getUTCMonth() === 3 && reference.getUTCDate() < 6)) {
    const start = new Date(Date.UTC(year - 1, 3, 6));
    const end = new Date(Date.UTC(year, 3, 5));
    return { start, end };
  }
  const start = taxYearStart;
  const end = new Date(Date.UTC(year + 1, 3, 5));
  return { start, end };
};

export type MonthlyPeriod = {
  key: string;
  label: string;
  start: string;
  end: string;
};

const formatMonthLabel = (value: Date): string => {
  return value.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
};

export const buildMonthlyPeriods = (start: string, end: string): MonthlyPeriod[] => {
  const startDate = startOfMonth(toDateUtc(start));
  const endDate = endOfMonth(toDateUtc(end));
  const periods: MonthlyPeriod[] = [];
  let cursor = startDate;
  while (cursor.getTime() <= endDate.getTime()) {
    const periodEnd = endOfMonth(cursor);
    periods.push({
      key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
      label: formatMonthLabel(cursor),
      start: formatIsoDate(cursor),
      end: formatIsoDate(periodEnd)
    });
    cursor = addMonths(cursor, 1);
  }
  return periods;
};

type FilterSets = {
  accounts: Map<string, Account>;
  accountFilter: Set<string> | null;
  providerFilter: Set<string> | null;
  collectionFilter: Set<string> | null;
  masterFilter: Set<string> | null;
  flowFilter: Set<RuleFlowType> | null;
  categories: Map<string, Category>;
  masterByCategory: Map<string, string>;
};

export const buildFilterSets = (
  accounts: Account[],
  categories: Category[],
  filters: ReportFilters
): FilterSets => {
  const activeAccounts = accounts.filter((account) => !account.archived && account.includeInTotals);
  const accountFilter = filters.accountIds.length ? new Set(filters.accountIds) : null;
  const providerFilter = filters.providerNames.length
    ? new Set(filters.providerNames.map((entry) => entry.toLowerCase()))
    : null;
  const collectionFilter = filters.collectionIds.length ? new Set(filters.collectionIds) : null;
  const masterFilter = filters.masterCategoryIds.length ? new Set(filters.masterCategoryIds) : null;
  const flowFilter = filters.flowTypes.length ? new Set(filters.flowTypes) : null;
  const accountMap = new Map(activeAccounts.map((account) => [account.id, account]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const masterByCategory = new Map<string, string>();
  categories.forEach((category) => masterByCategory.set(category.id, category.masterCategoryId));
  return {
    accounts: accountMap,
    accountFilter,
    providerFilter,
    collectionFilter,
    masterFilter,
    flowFilter,
    categories: categoryMap,
    masterByCategory
  };
};

export const buildMasterFlowLookup = (
  masterCategories: MasterCategory[]
): Map<string, RuleFlowType> => {
  const lookup = new Map<string, RuleFlowType>();
  masterCategories.forEach((master) => {
    const flow = getFlowTypeForMaster(master);
    switch (flow) {
      case 'interest':
        lookup.set(master.id, 'interest');
        break;
      case 'transfers':
        lookup.set(master.id, 'transfer');
        break;
      case 'in':
        lookup.set(master.id, 'in');
        break;
      default:
        lookup.set(master.id, 'out');
        break;
    }
  });
  return lookup;
};

export type TransactionView = {
  transaction: Transaction;
  account: Account | undefined;
  category: Category | undefined;
  masterCategoryId: string | null;
  flow: RuleFlowType;
  date: string;
};

export const resolveTransactionFlow = (
  transaction: Transaction,
  category: Category | undefined,
  masterFlowLookup: Map<string, RuleFlowType>
): RuleFlowType => {
  if (transaction.flowOverride) {
    return transaction.flowOverride;
  }
  if (category) {
    const flow = masterFlowLookup.get(category.masterCategoryId);
    if (flow) {
      return flow;
    }
  }
  return transaction.amount >= 0 ? 'in' : 'out';
};

export const filterTransactionsForReports = (
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  masterCategories: MasterCategory[],
  filters: ReportFilters
): TransactionView[] => {
  const filterSets = buildFilterSets(accounts, categories, filters);
  const masterFlowLookup = buildMasterFlowLookup(masterCategories);
  const start = filters.startDate;
  const end = filters.endDate;
  const accountList = Array.from(filterSets.accounts.values()).filter((account) => {
    if (filterSets.accountFilter && !filterSets.accountFilter.has(account.id)) {
      return false;
    }
    if (filterSets.providerFilter && !filterSets.providerFilter.has(account.provider.toLowerCase())) {
      return false;
    }
    if (filterSets.collectionFilter && filterSets.collectionFilter.size > 0) {
      const hasMatch = account.collectionIds.some((id) => filterSets.collectionFilter?.has(id));
      if (!hasMatch) return false;
    }
    return true;
  });
  const allowedAccounts = new Set(accountList.map((account) => account.id));

  return transactions
    .filter((transaction) => {
      const date = transaction.date.slice(0, 10);
      if (date < start || date > end) return false;
      if (!allowedAccounts.has(transaction.accountId)) return false;
      return true;
    })
    .map((transaction) => {
      const account = filterSets.accounts.get(transaction.accountId);
      const category = transaction.categoryId
        ? filterSets.categories.get(transaction.categoryId)
        : undefined;
      const masterCategoryId = category ? filterSets.masterByCategory.get(category.id) ?? null : null;
      const flow = resolveTransactionFlow(transaction, category, masterFlowLookup);
      return {
        transaction,
        account,
        category,
        masterCategoryId,
        flow,
        date: transaction.date.slice(0, 10)
      };
    })
    .filter((view) => {
      if (!view.account) return false;
      if (filterSets.providerFilter && !filterSets.providerFilter.has(view.account.provider.toLowerCase())) {
        return false;
      }
      if (filterSets.collectionFilter && filterSets.collectionFilter.size > 0) {
        const hasMatch = view.account.collectionIds.some((id) => filterSets.collectionFilter?.has(id));
        if (!hasMatch) return false;
      }
      if (filterSets.masterFilter && view.masterCategoryId) {
        if (!filterSets.masterFilter.has(view.masterCategoryId)) {
          return false;
        }
      }
      if (filterSets.flowFilter && !filterSets.flowFilter.has(view.flow)) {
        return false;
      }
      if (filterSets.masterFilter && !view.masterCategoryId) {
        return false;
      }
      return true;
    });
};

export const summariseNativeAmounts = (
  entries: { currency: string; amount: number }[]
): Record<string, number> => {
  return entries.reduce<Record<string, number>>((accumulator, entry) => {
    const key = entry.currency.toUpperCase();
    const current = accumulator[key] ?? 0;
    return { ...accumulator, [key]: current + entry.amount };
  }, {});
};

export const periodKeyFromDate = (date: string): string => {
  return `${date.slice(0, 7)}`;
};

export const describeDateRange = (start: string, end: string): string => {
  return `${start} → ${end}`;
};

export type CategorySelection = {
  categories: Category[];
  subCategories: SubCategory[];
};

export const pickTopCategories = (
  views: TransactionView[],
  categories: Category[],
  converter: CurrencyConverter,
  limit = 3
): CategorySelection => {
  const baseByCategory = new Map<string, number>();
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  views.forEach((view) => {
    if (!view.transaction.categoryId) return;
    const categoryId = view.transaction.categoryId;
    const key = categoryId;
    const amount = converter.toBase(
      view.transaction.amount,
      view.transaction.currency ?? view.account?.currency ?? null
    );
    const total = baseByCategory.get(key) ?? 0;
    baseByCategory.set(key, total + amount);
  });
  const sorted = Array.from(baseByCategory.entries())
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit)
    .map(([id]) => categoryLookup.get(id))
    .filter((category): category is Category => Boolean(category));
  return { categories: sorted, subCategories: [] };
};

export const computeShare = (value: number, total: number): number => {
  if (total === 0) return 0;
  return (value / total) * 100;
};


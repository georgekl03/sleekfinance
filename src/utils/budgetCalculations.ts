import {
  Account,
  Budget,
  BudgetLine,
  BudgetLineSubLine,
  Category,
  MasterCategory,
  SettingsState,
  SubCategory,
  Transaction
} from '../data/models';
import { getBudgetPeriodInfo, getBudgetPeriodIndex } from './budgetPeriods';
import { getFlowTypeForMaster } from './categories';

type NormalisedFlow = 'in' | 'interest' | 'out' | 'transfer';

type BudgetTransactionView = {
  date: Date;
  categoryId: string | null;
  subCategoryId: string | null;
  flow: NormalisedFlow;
  baseAmount: number;
};

export type BudgetLineStatus = 'none' | 'under' | 'near' | 'over';

export type BudgetSubLineMetric = {
  subLine: BudgetLineSubLine;
  subCategory: SubCategory | undefined;
  storedPlan: number;
  rolloverIn: number;
  effectivePlan: number;
  actual: number;
  difference: number;
  percentUsed: number;
  status: BudgetLineStatus;
};

export type BudgetLineMetric = {
  line: BudgetLine;
  category: Category | undefined;
  master: MasterCategory | undefined;
  flow: NormalisedFlow;
  storedPlan: number;
  rolloverIn: number;
  effectivePlan: number;
  actual: number;
  difference: number;
  percentUsed: number;
  status: BudgetLineStatus;
  subLines: BudgetSubLineMetric[];
};

export type BudgetSummaryEntry = {
  master: MasterCategory;
  flow: 'in' | 'out';
  planned: number;
  actual: number;
  difference: number;
  percentUsed: number;
  status: BudgetLineStatus;
};

export type BudgetPeriodComputation = {
  period: ReturnType<typeof getBudgetPeriodInfo>;
  periodKey: string;
  lines: BudgetLineMetric[];
  summary: {
    income: BudgetSummaryEntry[];
    expenses: BudgetSummaryEntry[];
    totals: {
      incomePlanned: number;
      incomeActual: number;
      expensePlanned: number;
      expenseActual: number;
    };
  };
};

const normaliseLineFlow = (master: MasterCategory | undefined): NormalisedFlow => {
  if (!master) return 'out';
  const flowType = getFlowTypeForMaster(master);
  switch (flowType) {
    case 'in':
      return 'in';
    case 'interest':
      return 'interest';
    case 'transfers':
      return 'transfer';
    case 'out':
    default:
      return 'out';
  }
};

const normaliseTransactionFlow = (
  transaction: Transaction,
  category: Category | undefined,
  master: MasterCategory | undefined
): NormalisedFlow => {
  if (transaction.flowOverride) {
    switch (transaction.flowOverride) {
      case 'transfer':
        return 'transfer';
      case 'interest':
        return 'interest';
      case 'in':
        return 'in';
      case 'fees':
      case 'out':
      default:
        return 'out';
    }
  }
  const resolved = normaliseLineFlow(master);
  if (transaction.categoryId && category) {
    return resolved;
  }
  return transaction.amount >= 0 ? 'in' : 'out';
};

const normaliseStatus = (planned: number, actual: number): BudgetLineStatus => {
  const safePlanned = Math.max(planned, 0);
  const safeActual = Math.max(actual, 0);
  if (safePlanned === 0) {
    if (safeActual === 0) return 'none';
    return 'over';
  }
  const ratio = safeActual / safePlanned;
  if (ratio < 0.9) return 'under';
  if (ratio <= 1) return 'near';
  return 'over';
};

const formatPeriodKey = (date: Date) => date.toISOString().slice(0, 10);

export type BudgetCalculationInput = {
  budget: Budget;
  lines: BudgetLine[];
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  subCategories: SubCategory[];
  masterCategories: MasterCategory[];
  settings: SettingsState;
  referenceDate?: Date;
  periodOffset?: number;
};

export const calculateBudgetPeriod = ({
  budget,
  lines,
  accounts,
  transactions,
  categories,
  subCategories,
  masterCategories,
  settings,
  referenceDate = new Date(),
  periodOffset = 0
}: BudgetCalculationInput): BudgetPeriodComputation => {
  const activeAccounts = accounts.filter((account) => {
    if (account.archived) return false;
    if (!account.includeInTotals) return false;
    if (budget.includeMode === 'collections') {
      return budget.collectionIds.some((collectionId) =>
        account.collectionIds.includes(collectionId)
      );
    }
    return true;
  });
  const accountSet = new Set(activeAccounts.map((account) => account.id));

  const rateMap = new Map<string, number>();
  settings.exchangeRates.forEach((entry) => {
    rateMap.set(entry.currency.toUpperCase(), entry.rateToBase);
  });
  const baseCurrency = settings.baseCurrency.toUpperCase();
  if (!rateMap.has(baseCurrency)) {
    rateMap.set(baseCurrency, 1);
  }
  const convertToBase = (amount: number, currency: string | undefined | null) => {
    if (!currency) return amount;
    const rate = rateMap.get(currency.toUpperCase()) ?? 1;
    return amount * rate;
  };

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const subCategoryById = new Map(subCategories.map((sub) => [sub.id, sub]));
  const masterById = new Map(masterCategories.map((master) => [master.id, master]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const transactionViews: BudgetTransactionView[] = transactions
    .filter((transaction) => accountSet.has(transaction.accountId))
    .map((transaction) => {
      const account = accountById.get(transaction.accountId);
      const category = transaction.categoryId
        ? categoryById.get(transaction.categoryId)
        : undefined;
      const master = category ? masterById.get(category.masterCategoryId) : undefined;
      const flow = normaliseTransactionFlow(transaction, category, master);
      const currency = transaction.currency ?? account?.currency ?? settings.baseCurrency;
      const date = new Date(transaction.date);
      return {
        date,
        categoryId: transaction.categoryId,
        subCategoryId: transaction.subCategoryId,
        flow,
        baseAmount: convertToBase(transaction.amount, currency)
      };
    })
    .filter((view) => !Number.isNaN(view.date.getTime()));

  const period = getBudgetPeriodInfo(budget, periodOffset, referenceDate);
  const periodKey = formatPeriodKey(period.start);
  const periodMetaCache = new Map<number, { key: string; index: number; start: Date; end: Date }>();

  const getMeta = (offset: number) => {
    if (!periodMetaCache.has(offset)) {
      const info = getBudgetPeriodInfo(budget, offset, referenceDate);
      periodMetaCache.set(offset, {
        key: formatPeriodKey(info.start),
        index: getBudgetPeriodIndex(budget, info.start),
        start: info.start,
        end: info.end
      });
    }
    return periodMetaCache.get(offset)!;
  };

  const anchorIndex = getBudgetPeriodIndex(budget, new Date(budget.anchorDate));

  const actualCache = new Map<string, number>();

  const sumTransactions = (
    offset: number,
    cacheKey: string,
    predicate: (txn: BudgetTransactionView) => boolean
  ) => {
    const meta = getMeta(offset);
    const key = `${offset}|${cacheKey}`;
    if (actualCache.has(key)) {
      return actualCache.get(key)!;
    }
    const total = transactionViews.reduce((sum, txn) => {
      if (txn.date < meta.start || txn.date > meta.end) {
        return sum;
      }
      if (!predicate(txn)) {
        return sum;
      }
      return sum + Math.abs(txn.baseAmount);
    }, 0);
    actualCache.set(key, total);
    return total;
  };

  type LineData = {
    storedPlan: number;
    rolloverIn: number;
    effectivePlan: number;
    actual: number;
    difference: number;
    percentUsed: number;
    status: BudgetLineStatus;
  };

  const lineDataCache = new Map<string, Map<number, LineData>>();
  const subLineCache = new Map<string, Map<number, BudgetSubLineMetric>>();

  const getLineData = (
    line: BudgetLine,
    flow: NormalisedFlow,
    offset: number
  ): {
    storedPlan: number;
    rolloverIn: number;
    effectivePlan: number;
    actual: number;
    difference: number;
    percentUsed: number;
    status: BudgetLineStatus;
  } => {
    let lineCache = lineDataCache.get(line.id);
    if (!lineCache) {
      lineCache = new Map();
      lineDataCache.set(line.id, lineCache);
    }
    if (lineCache.has(offset)) {
      return lineCache.get(offset)!;
    }
    const meta = getMeta(offset);
    const storedPlan = line.plannedAmounts[meta.key] ?? 0;
    const actual = sumTransactions(
      offset,
      `line:${line.id}`,
      (txn) => txn.flow === flow && txn.categoryId === line.categoryId
    );
    let rolloverIn = 0;
    if (budget.rolloverEnabled && meta.index > anchorIndex) {
      const previous = getLineData(line, flow, offset - 1);
      rolloverIn = previous.effectivePlan - previous.actual;
    }
    const effectivePlan = storedPlan + rolloverIn;
    const basePlan = Math.max(effectivePlan, 0);
    const difference = effectivePlan - actual;
    const percentUsed = basePlan === 0 ? (actual > 0 ? 1 : 0) : actual / basePlan;
    const status = normaliseStatus(effectivePlan, actual);
    const data = {
      storedPlan: Math.max(storedPlan, 0),
      rolloverIn,
      effectivePlan,
      actual,
      difference,
      percentUsed,
      status
    };
    lineCache.set(offset, data);
    return data;
  };

  const getSubLineData = (
    line: BudgetLine,
    subLine: BudgetLineSubLine,
    flow: NormalisedFlow,
    offset: number
  ): BudgetSubLineMetric => {
    let cache = subLineCache.get(subLine.id);
    if (!cache) {
      cache = new Map();
      subLineCache.set(subLine.id, cache);
    }
    if (cache.has(offset)) {
      return cache.get(offset)!;
    }
    const meta = getMeta(offset);
    const storedPlan = subLine.plannedAmounts[meta.key] ?? 0;
    const actual = sumTransactions(
      offset,
      `sub:${subLine.id}`,
      (txn) =>
        txn.flow === flow &&
        txn.categoryId === line.categoryId &&
        txn.subCategoryId === subLine.subCategoryId
    );
    let rolloverIn = 0;
    if (budget.rolloverEnabled && meta.index > anchorIndex) {
      const previous = getSubLineData(line, subLine, flow, offset - 1);
      rolloverIn = previous.effectivePlan - previous.actual;
    }
    const effectivePlan = storedPlan + rolloverIn;
    const basePlan = Math.max(effectivePlan, 0);
    const difference = effectivePlan - actual;
    const percentUsed = basePlan === 0 ? (actual > 0 ? 1 : 0) : actual / basePlan;
    const status = normaliseStatus(effectivePlan, actual);
    const metric: BudgetSubLineMetric = {
      subLine,
      subCategory: subCategoryById.get(subLine.subCategoryId),
      storedPlan: Math.max(storedPlan, 0),
      rolloverIn,
      effectivePlan,
      actual,
      difference,
      percentUsed,
      status
    };
    cache.set(offset, metric);
    return metric;
  };

  const lineEntries = lines
    .map((line) => {
      const category = categoryById.get(line.categoryId);
      const master = category ? masterById.get(category.masterCategoryId) : undefined;
      const flow = normaliseLineFlow(master);
      return { line, category, master, flow };
    })
    .filter((entry) => entry.category)
    .sort((a, b) => a.line.order - b.line.order || a.line.createdAt.localeCompare(b.line.createdAt));

  const lineMetrics: BudgetLineMetric[] = lineEntries.map((entry) => {
    const data = getLineData(entry.line, entry.flow, periodOffset);
    const subLines = entry.line.subLines.map((subLine) =>
      getSubLineData(entry.line, subLine, entry.flow, periodOffset)
    );
    return {
      line: entry.line,
      category: entry.category,
      master: entry.master,
      flow: entry.flow,
      storedPlan: data.storedPlan,
      rolloverIn: data.rolloverIn,
      effectivePlan: data.effectivePlan,
      actual: data.actual,
      difference: data.difference,
      percentUsed: data.percentUsed,
      status: data.status,
      subLines
    };
  });

  const summaryMap = new Map<string, { master: MasterCategory; flow: 'in' | 'out'; planned: number; actual: number }>();
  lineMetrics.forEach((metric) => {
    if (!metric.master) return;
    if (metric.flow === 'transfer') return;
    const key = metric.master.id;
    const existing = summaryMap.get(key) ?? {
      master: metric.master,
      flow: metric.flow === 'out' ? 'out' : 'in',
      planned: 0,
      actual: 0
    };
    existing.planned += metric.effectivePlan;
    existing.actual += metric.actual;
    summaryMap.set(key, existing);
  });

  const income: BudgetSummaryEntry[] = [];
  const expenses: BudgetSummaryEntry[] = [];
  let incomePlanned = 0;
  let incomeActual = 0;
  let expensePlanned = 0;
  let expenseActual = 0;

  summaryMap.forEach((entry) => {
    const difference = entry.planned - entry.actual;
    const percentUsed = entry.planned === 0 ? (entry.actual > 0 ? 1 : 0) : entry.actual / entry.planned;
    const status = normaliseStatus(entry.planned, entry.actual);
    const summaryEntry: BudgetSummaryEntry = {
      master: entry.master,
      flow: entry.flow,
      planned: entry.planned,
      actual: entry.actual,
      difference,
      percentUsed,
      status
    };
    if (entry.flow === 'in') {
      income.push(summaryEntry);
      incomePlanned += entry.planned;
      incomeActual += entry.actual;
    } else {
      expenses.push(summaryEntry);
      expensePlanned += entry.planned;
      expenseActual += entry.actual;
    }
  });

  const compareByVariance = (a: BudgetSummaryEntry, b: BudgetSummaryEntry) =>
    Math.abs(b.difference) - Math.abs(a.difference);

  income.sort(compareByVariance);
  expenses.sort(compareByVariance);

  return {
    period,
    periodKey,
    lines: lineMetrics,
    summary: {
      income,
      expenses,
      totals: {
        incomePlanned,
        incomeActual,
        expensePlanned,
        expenseActual
      }
    }
  };
};

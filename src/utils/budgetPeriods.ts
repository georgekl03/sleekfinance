import { Budget, BudgetPeriodType } from '../data/models';

export type BudgetPeriodDraft = {
  periodType: BudgetPeriodType;
  startMonth?: number;
  startYear?: number;
  startDayOfWeek?: number;
  anchorDate?: string;
};

export type BudgetPeriodInfo = {
  start: Date;
  end: Date;
  label: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toUtcIso = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day, 0, 0, 0, 0)).toISOString();

const startOfDayUtc = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const normaliseMonth = (value: number | undefined, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  const rounded = Math.trunc(value);
  const wrapped = ((rounded % 12) + 12) % 12;
  return wrapped;
};

const normaliseYear = (value: number | undefined, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.trunc(value);
};

const normaliseDayOfWeek = (value: number | undefined, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  const rounded = Math.trunc(value);
  const wrapped = ((rounded % 7) + 7) % 7;
  return wrapped;
};

const alignToDayOfWeek = (date: Date, startDay: number) => {
  const safe = startOfDayUtc(date);
  const difference = (safe.getUTCDay() - startDay + 7) % 7;
  return new Date(safe.getTime() - difference * MS_PER_DAY);
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * MS_PER_DAY);

const addMonths = (date: Date, months: number) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));

const addYears = (date: Date, years: number) =>
  new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));

const safeDate = (value: unknown, fallback: Date) => {
  if (typeof value === 'string' || value instanceof Date) {
    const candidate = new Date(value);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate;
    }
  }
  return fallback;
};

export const BUDGET_PERIOD_TYPE_LABELS: Record<BudgetPeriodType, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
  'uk-fiscal': 'UK fiscal year'
};

export const buildBudgetPeriodState = (
  draft: BudgetPeriodDraft,
  now: Date = new Date()
): Pick<
  Budget,
  'periodType' | 'startMonth' | 'startYear' | 'startDayOfWeek' | 'anchorDate'
> => {
  const reference = startOfDayUtc(startOfDayUtc(now));
  const resolvedType: BudgetPeriodType = draft.periodType ?? 'monthly';
  switch (resolvedType) {
    case 'weekly': {
      const startDay = normaliseDayOfWeek(draft.startDayOfWeek, 1);
      const anchorSource = safeDate(draft.anchorDate, reference);
      const anchor = alignToDayOfWeek(anchorSource, startDay);
      return {
        periodType: 'weekly',
        startMonth: undefined,
        startYear: undefined,
        startDayOfWeek: startDay,
        anchorDate: toUtcIso(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
      };
    }
    case 'annual': {
      const anchorSource = safeDate(draft.anchorDate, reference);
      const baseYear = anchorSource.getUTCFullYear();
      const year = normaliseYear(draft.startYear, baseYear);
      return {
        periodType: 'annual',
        startMonth: undefined,
        startYear: year,
        startDayOfWeek: undefined,
        anchorDate: toUtcIso(year, 0, 1)
      };
    }
    case 'uk-fiscal': {
      const anchorSource = safeDate(draft.anchorDate, reference);
      const currentYear = anchorSource.getUTCFullYear();
      const fiscalStartThisYear = Date.UTC(currentYear, 3, 6);
      const defaultYear = anchorSource.getTime() >= fiscalStartThisYear
        ? currentYear
        : currentYear - 1;
      const year = normaliseYear(draft.startYear, defaultYear);
      return {
        periodType: 'uk-fiscal',
        startMonth: undefined,
        startYear: year,
        startDayOfWeek: undefined,
        anchorDate: toUtcIso(year, 3, 6)
      };
    }
    case 'monthly':
    default: {
      const anchorSource = safeDate(draft.anchorDate, reference);
      const baseMonth = anchorSource.getUTCMonth();
      const baseYear = anchorSource.getUTCFullYear();
      const month = normaliseMonth(draft.startMonth, baseMonth);
      const year = normaliseYear(draft.startYear, baseYear);
      return {
        periodType: 'monthly',
        startMonth: month,
        startYear: year,
        startDayOfWeek: undefined,
        anchorDate: toUtcIso(year, month, 1)
      };
    }
  }
};

export const applyBudgetPeriodDraft = (
  budget: Budget,
  draft: Partial<BudgetPeriodDraft>,
  now: Date = new Date()
): Budget => {
  const mergedDraft: BudgetPeriodDraft = {
    periodType: draft.periodType ?? budget.periodType,
    startMonth: draft.startMonth ?? budget.startMonth,
    startYear: draft.startYear ?? budget.startYear,
    startDayOfWeek: draft.startDayOfWeek ?? budget.startDayOfWeek,
    anchorDate: draft.anchorDate ?? budget.anchorDate
  };
  const periodState = buildBudgetPeriodState(mergedDraft, now);
  return {
    ...budget,
    ...periodState
  };
};

const getIndexForDate = (budget: Budget, referenceDate: Date): number => {
  const anchor = startOfDayUtc(safeDate(budget.anchorDate, referenceDate));
  const reference = startOfDayUtc(referenceDate);
  switch (budget.periodType) {
    case 'weekly': {
      const diffDays = Math.floor((reference.getTime() - anchor.getTime()) / MS_PER_DAY);
      let weeks = Math.floor(diffDays / 7);
      let start = addDays(anchor, weeks * 7);
      while (reference < start) {
        weeks -= 1;
        start = addDays(anchor, weeks * 7);
      }
      while (reference >= addDays(start, 7)) {
        weeks += 1;
        start = addDays(anchor, weeks * 7);
      }
      return weeks;
    }
    case 'annual':
    case 'uk-fiscal': {
      let years = reference.getUTCFullYear() - anchor.getUTCFullYear();
      let start = addYears(anchor, years);
      while (reference < start) {
        years -= 1;
        start = addYears(anchor, years);
      }
      while (reference >= addYears(start, 1)) {
        years += 1;
        start = addYears(anchor, years);
      }
      return years;
    }
    case 'monthly':
    default: {
      let months =
        (reference.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        (reference.getUTCMonth() - anchor.getUTCMonth());
      let start = addMonths(anchor, months);
      while (reference < start) {
        months -= 1;
        start = addMonths(anchor, months);
      }
      while (reference >= addMonths(start, 1)) {
        months += 1;
        start = addMonths(anchor, months);
      }
      return months;
    }
  }
};

const getPeriodStartForIndex = (budget: Budget, index: number): Date => {
  const anchor = startOfDayUtc(new Date(budget.anchorDate));
  switch (budget.periodType) {
    case 'weekly':
      return addDays(anchor, index * 7);
    case 'annual':
    case 'uk-fiscal':
      return addYears(anchor, index);
    case 'monthly':
    default:
      return addMonths(anchor, index);
  }
};

const formatShortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export const getBudgetPeriodInfo = (
  budget: Budget,
  offset = 0,
  referenceDate: Date = new Date()
): BudgetPeriodInfo => {
  const normalised = applyBudgetPeriodDraft(budget, {}, referenceDate);
  const currentIndex = getIndexForDate(normalised, referenceDate);
  const index = currentIndex + offset;
  const start = startOfDayUtc(getPeriodStartForIndex(normalised, index));
  let end: Date;
  switch (normalised.periodType) {
    case 'weekly':
      end = addDays(start, 6);
      break;
    case 'annual':
    case 'uk-fiscal': {
      const nextStart = addYears(start, 1);
      end = addDays(nextStart, -1);
      break;
    }
    case 'monthly':
    default: {
      const nextStart = addMonths(start, 1);
      end = addDays(nextStart, -1);
      break;
    }
  }

  let label: string;
  switch (normalised.periodType) {
    case 'weekly': {
      label = `Week of ${formatShortDate(start)} – ${formatShortDate(end)}`;
      break;
    }
    case 'annual': {
      label = `${start.getUTCFullYear()}`;
      break;
    }
    case 'uk-fiscal': {
      const endYear = addYears(start, 1).getUTCFullYear();
      label = `${start.getUTCFullYear()}–${endYear} Tax Year`;
      break;
    }
    case 'monthly':
    default: {
      label = start.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long'
      });
      break;
    }
  }

  return { start, end, label };
};

export const formatBudgetPeriodRange = (info: BudgetPeriodInfo) =>
  `${formatShortDate(info.start)} – ${formatShortDate(info.end)}`;

export const getBudgetPeriodIndex = (budget: Budget, date: Date) => {
  const normalised = applyBudgetPeriodDraft(budget, {}, date);
  return getIndexForDate(normalised, date);
};

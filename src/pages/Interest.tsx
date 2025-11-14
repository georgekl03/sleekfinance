import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, Transaction } from '../data/models';
import { formatCurrency, formatDate, formatPercentage } from '../utils/format';
import { getFlowTypeForMaster } from '../utils/categories';
import { formatAllocationNativeSummary } from '../utils/allocations';
import '../styles/interest.css';

type RangeMode = 'custom' | 'calendar' | 'uk-tax';
type MonthlyGrouping = 'total' | 'account' | 'provider';

type InterestFiltersPayload = {
  start?: string;
  end?: string;
  accountIds?: string[];
  collectionIds?: string[];
  source?: {
    budgetId?: string;
    lineId?: string;
    label?: string;
    periodLabel?: string;
  };
};

type InterestNavigationState = {
  interestFilters?: InterestFiltersPayload;
};

type InterestEvent = {
  id: string;
  account: Account;
  provider: string;
  date: Date;
  baseAmount: number;
  nativeAmount: number;
  nativeCurrency: string;
  collections: string[];
};

const TAX_YEAR_MONTH = 3; // April (0-indexed)
const TAX_YEAR_START_DAY = 6;
const TAX_YEAR_END_DAY = 5;

const palette = ['#2563eb', '#0ea5e9', '#059669', '#7c3aed', '#f97316', '#ec4899'];

const buildUkTaxYearRange = (year: number) => {
  const start = new Date(Date.UTC(year, TAX_YEAR_MONTH, TAX_YEAR_START_DAY));
  const end = new Date(Date.UTC(year + 1, TAX_YEAR_MONTH, TAX_YEAR_END_DAY, 23, 59, 59, 999));
  return { start, end };
};

const getCurrentUkTaxYearStart = (today: Date) => {
  const currentYear = today.getUTCFullYear();
  const start = new Date(Date.UTC(currentYear, TAX_YEAR_MONTH, TAX_YEAR_START_DAY));
  if (today.getTime() < start.getTime()) {
    return currentYear - 1;
  }
  return currentYear;
};

const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });

const toIso = (date: Date) => date.toISOString().slice(0, 10);

const Interest = () => {
  const { state } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentTaxYear = useMemo(() => getCurrentUkTaxYearStart(today), [today]);

  const accounts = useMemo(() => state.accounts.filter((account) => !account.archived), [state.accounts]);
  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const collections = state.accountCollections;
  const providers = useMemo(
    () => Array.from(new Set(accounts.map((account) => account.provider))).sort(),
    [accounts]
  );
  const categoriesById = useMemo(() => new Map(state.categories.map((category) => [category.id, category])), [state.categories]);
  const masterById = useMemo(() => new Map(state.masterCategories.map((master) => [master.id, master])), [state.masterCategories]);

  const [rangeMode, setRangeMode] = useState<RangeMode>('custom');
  const [calendarYear, setCalendarYear] = useState(currentYear);
  const [taxYear, setTaxYear] = useState(currentTaxYear);
  const [customStart, setCustomStart] = useState(() => {
    const start = new Date(today);
    start.setMonth(start.getMonth() - 6);
    return toIso(start);
  });
  const [customEnd, setCustomEnd] = useState(() => toIso(today));
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [monthlyGrouping, setMonthlyGrouping] = useState<MonthlyGrouping>('total');
  const [sourceContext, setSourceContext] = useState<InterestFiltersPayload['source'] | null>(null);

  useEffect(() => {
    const payload = (location.state as InterestNavigationState | null)?.interestFilters;
    if (!payload) return;
    if (payload.start) {
      setRangeMode('custom');
      setCustomStart(payload.start);
    }
    if (payload.end) {
      setRangeMode('custom');
      setCustomEnd(payload.end);
    }
    if (payload.accountIds) {
      setSelectedAccountIds(payload.accountIds);
    }
    if (payload.collectionIds) {
      setSelectedCollectionIds(payload.collectionIds);
    }
    setSourceContext(payload.source ?? null);
    navigate('.', { replace: true, state: null });
  }, [location.state, navigate]);

  const { exchangeRates, baseCurrency } = state.settings;
  const exchangeRateMap = useMemo(() => {
    const map = new Map<string, number>();
    exchangeRates.forEach((entry) => {
      map.set(entry.currency.toUpperCase(), entry.rateToBase);
    });
    if (!map.has(baseCurrency.toUpperCase())) {
      map.set(baseCurrency.toUpperCase(), 1);
    }
    return map;
  }, [baseCurrency, exchangeRates]);

  const convertToBase = useCallback(
    (amount: number, currency: string | null | undefined) => {
      if (!Number.isFinite(amount)) return 0;
      if (!currency) return amount;
      const rate = exchangeRateMap.get(currency.toUpperCase()) ?? 1;
      return amount * rate;
    },
    [exchangeRateMap]
  );

  const isInterestTransaction = useCallback(
    (transaction: Transaction) => {
      if (transaction.flowOverride === 'interest') return true;
      if (transaction.flowOverride) return false;
      if (!transaction.categoryId) return false;
      const category = categoriesById.get(transaction.categoryId);
      if (!category) return false;
      const master = masterById.get(category.masterCategoryId);
      if (!master) return false;
      return getFlowTypeForMaster(master) === 'interest';
    },
    [categoriesById, masterById]
  );

  const allInterestEvents = useMemo<InterestEvent[]>(() => {
    return state.transactions
      .filter((transaction) => isInterestTransaction(transaction))
      .map((transaction) => {
        const account = accountsById.get(transaction.accountId);
        if (!account) return null;
        const date = new Date(transaction.date);
        if (Number.isNaN(date.getTime())) return null;
        const nativeCurrency = (transaction.nativeCurrency ?? transaction.currency ?? account.currency).toUpperCase();
        const nativeAmount = transaction.nativeAmount ?? transaction.amount;
        const baseAmount = convertToBase(nativeAmount, nativeCurrency);
        return {
          id: transaction.id,
          account,
          provider: account.provider,
          date,
          baseAmount,
          nativeAmount,
          nativeCurrency,
          collections: account.collectionIds
        } satisfies InterestEvent;
      })
      .filter((event): event is InterestEvent => Boolean(event));
  }, [accountsById, convertToBase, isInterestTransaction, state.transactions]);

  const appliedRange = useMemo(() => {
    switch (rangeMode) {
      case 'calendar':
        return { start: `${calendarYear}-01-01`, end: `${calendarYear}-12-31` };
      case 'uk-tax': {
        const { start, end } = buildUkTaxYearRange(taxYear);
        return { start: toIso(start), end: toIso(end) };
      }
      default:
        return { start: customStart, end: customEnd };
    }
  }, [calendarYear, customEnd, customStart, rangeMode, taxYear]);

  const startDate = appliedRange.start ? new Date(appliedRange.start) : null;
  const endDate = appliedRange.end ? new Date(appliedRange.end) : null;

  const accountFilter = useMemo(() => new Set(selectedAccountIds), [selectedAccountIds]);
  const providerFilter = useMemo(() => new Set(selectedProviders), [selectedProviders]);
  const collectionFilter = useMemo(() => new Set(selectedCollectionIds), [selectedCollectionIds]);

  const filteredByEntity = useMemo(() => {
    return allInterestEvents.filter((event) => {
      if (accountFilter.size > 0 && !accountFilter.has(event.account.id)) return false;
      if (providerFilter.size > 0 && !providerFilter.has(event.provider)) return false;
      if (collectionFilter.size > 0) {
        const match = event.collections.some((collectionId) => collectionFilter.has(collectionId));
        if (!match) return false;
      }
      return true;
    });
  }, [accountFilter, allInterestEvents, collectionFilter, providerFilter]);

  const filteredEvents = useMemo(() => {
    return filteredByEntity.filter((event) => {
      if (startDate && event.date < startDate) return false;
      if (endDate && event.date > endDate) return false;
      return true;
    });
  }, [endDate, filteredByEntity, startDate]);

  const totalInterestBase = useMemo(
    () => filteredEvents.reduce((sum, event) => sum + event.baseAmount, 0),
    [filteredEvents]
  );

  const accountBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        account: Account;
        baseTotal: number;
        nativeTotals: Map<string, number>;
      }
    >();
    filteredEvents.forEach((event) => {
      const entry = map.get(event.account.id) ?? {
        account: event.account,
        baseTotal: 0,
        nativeTotals: new Map<string, number>()
      };
      entry.baseTotal += event.baseAmount;
      entry.nativeTotals.set(
        event.nativeCurrency,
        (entry.nativeTotals.get(event.nativeCurrency) ?? 0) + event.nativeAmount
      );
      map.set(event.account.id, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.baseTotal - a.baseTotal);
  }, [filteredEvents]);

  const providerBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        provider: string;
        baseTotal: number;
        nativeTotals: Map<string, number>;
      }
    >();
    filteredEvents.forEach((event) => {
      const entry = map.get(event.provider) ?? {
        provider: event.provider,
        baseTotal: 0,
        nativeTotals: new Map<string, number>()
      };
      entry.baseTotal += event.baseAmount;
      entry.nativeTotals.set(
        event.nativeCurrency,
        (entry.nativeTotals.get(event.nativeCurrency) ?? 0) + event.nativeAmount
      );
      map.set(event.provider, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.baseTotal - a.baseTotal);
  }, [filteredEvents]);

  const collectionBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    filteredEvents.forEach((event) => {
      event.collections.forEach((collectionId) => {
        totals.set(collectionId, (totals.get(collectionId) ?? 0) + event.baseAmount);
      });
    });
    return Array.from(totals.entries())
      .map(([collectionId, baseTotal]) => ({ collectionId, baseTotal }))
      .sort((a, b) => b.baseTotal - a.baseTotal);
  }, [filteredEvents]);

  const monthsInRange = useMemo(() => {
    if (!filteredEvents.length) return [] as { key: string; label: string }[];
    const end = endDate ?? filteredEvents[filteredEvents.length - 1].date;
    const start = startDate ?? filteredEvents[0].date;
    const months: { key: string; label: string }[] = [];
    const cursor = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    const startKey = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
    while (months.length < 12 && cursor.getTime() >= startKey) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: monthFormatter.format(cursor) });
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    }
    return months.reverse();
  }, [endDate, filteredEvents, startDate]);

  const timeline = useMemo(() => {
    const totalsByMonth = new Map<
      string,
      {
        total: number;
        perAccount: Map<string, number>;
        perProvider: Map<string, number>;
      }
    >();
    monthsInRange.forEach((month) => {
      totalsByMonth.set(month.key, {
        total: 0,
        perAccount: new Map<string, number>(),
        perProvider: new Map<string, number>()
      });
    });
    filteredEvents.forEach((event) => {
      const key = `${event.date.getUTCFullYear()}-${String(event.date.getUTCMonth() + 1).padStart(2, '0')}`;
      const entry = totalsByMonth.get(key);
      if (!entry) return;
      entry.total += event.baseAmount;
      entry.perAccount.set(
        event.account.id,
        (entry.perAccount.get(event.account.id) ?? 0) + event.baseAmount
      );
      entry.perProvider.set(
        event.provider,
        (entry.perProvider.get(event.provider) ?? 0) + event.baseAmount
      );
    });
    const accountTotals = new Map<string, number>();
    const providerTotals = new Map<string, number>();
    filteredEvents.forEach((event) => {
      accountTotals.set(
        event.account.id,
        (accountTotals.get(event.account.id) ?? 0) + event.baseAmount
      );
      providerTotals.set(event.provider, (providerTotals.get(event.provider) ?? 0) + event.baseAmount);
    });
    const topAccounts = Array.from(accountTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([accountId]) => accountId);
    const topProviders = Array.from(providerTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([provider]) => provider);
    const rows = monthsInRange.map((month) => {
      const entry = totalsByMonth.get(month.key) ?? {
        total: 0,
        perAccount: new Map<string, number>(),
        perProvider: new Map<string, number>()
      };
      const segments = () => {
        if (monthlyGrouping === 'account') {
          const values = topAccounts.map((accountId, index) => ({
            key: accountId,
            label: accountsById.get(accountId)?.name ?? 'Account',
            value: entry.perAccount.get(accountId) ?? 0,
            color: palette[index % palette.length]
          }));
          const accounted = values.reduce((sum, segment) => sum + segment.value, 0);
          const remaining = entry.total - accounted;
          if (remaining > 0.01) {
            values.push({ key: 'other', label: 'Other accounts', value: remaining, color: '#94a3b8' });
          }
          return values;
        }
        if (monthlyGrouping === 'provider') {
          const values = topProviders.map((provider, index) => ({
            key: provider,
            label: provider,
            value: entry.perProvider.get(provider) ?? 0,
            color: palette[index % palette.length]
          }));
          const accounted = values.reduce((sum, segment) => sum + segment.value, 0);
          const remaining = entry.total - accounted;
          if (remaining > 0.01) {
            values.push({ key: 'other', label: 'Other providers', value: remaining, color: '#94a3b8' });
          }
          return values;
        }
        return [
          {
            key: 'total',
            label: 'Total',
            value: entry.total,
            color: '#2563eb'
          }
        ];
      };
      return {
        key: month.key,
        label: month.label,
        total: entry.total,
        segments: segments()
      };
    });
    const maxValue = rows.reduce((max, row) => Math.max(max, row.total), 0) || 1;
    return { rows, maxValue };
  }, [accountsById, filteredEvents, monthlyGrouping, monthsInRange]);

  const transactionsByAccountBase = useMemo(() => {
    const map = new Map<string, { date: Date; baseAmount: number }[]>();
    state.transactions.forEach((transaction) => {
      const account = accountsById.get(transaction.accountId);
      if (!account) return;
      const date = new Date(transaction.date);
      if (Number.isNaN(date.getTime())) return;
      const nativeCurrency = (transaction.nativeCurrency ?? transaction.currency ?? account.currency).toUpperCase();
      const nativeAmount = transaction.nativeAmount ?? transaction.amount;
      const baseAmount = convertToBase(nativeAmount, nativeCurrency);
      const list = map.get(account.id) ?? [];
      list.push({ date, baseAmount });
      map.set(account.id, list);
    });
    map.forEach((list, key) => {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
      map.set(key, list);
    });
    return map;
  }, [accountsById, convertToBase, state.transactions]);

  const computeBaseBalance = useCallback(
    (account: Account, boundary: Date, inclusive: boolean) => {
      const openingDate = new Date(account.openingBalanceDate);
      const baseOpening = openingDate.getTime() <= boundary.getTime()
        ? convertToBase(account.openingBalance, account.currency)
        : 0;
      const list = transactionsByAccountBase.get(account.id) ?? [];
      const total = list.reduce((sum, entry) => {
        const compare = entry.date.getTime() - boundary.getTime();
        if (inclusive ? compare <= 0 : compare < 0) {
          return sum + entry.baseAmount;
        }
        return sum;
      }, 0);
      return baseOpening + total;
    },
    [convertToBase, transactionsByAccountBase]
  );

  const averageBalanceMeta = useMemo(() => {
    if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) {
      return { totalAverage: 0, days: 0 };
    }
    const consideredAccounts = accountFilter.size ? selectedAccountIds : accounts.map((account) => account.id);
    let totalAverage = 0;
    consideredAccounts.forEach((accountId) => {
      const account = accountsById.get(accountId);
      if (!account) return;
      const startBalance = computeBaseBalance(account, startDate, false);
      const endBalance = computeBaseBalance(account, endDate, true);
      totalAverage += (startBalance + endBalance) / 2;
    });
    const days = Math.max(Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1, 1);
    return { totalAverage, days };
  }, [
    accountFilter,
    accounts,
    accountsById,
    computeBaseBalance,
    endDate,
    selectedAccountIds,
    startDate
  ]);

  const blendedApr = useMemo(() => {
    if (averageBalanceMeta.totalAverage <= 0 || averageBalanceMeta.days <= 0) return 0;
    const annualised = (totalInterestBase / averageBalanceMeta.totalAverage) * (365 / averageBalanceMeta.days);
    return Number.isFinite(annualised) ? annualised : 0;
  }, [averageBalanceMeta.days, averageBalanceMeta.totalAverage, totalInterestBase]);

  const projectionNextYear = blendedApr > 0 ? averageBalanceMeta.totalAverage * blendedApr : 0;

  const taxYearOptions = useMemo(() => Array.from({ length: 6 }, (_, index) => currentTaxYear - index), [currentTaxYear]);
  const taxYearRange = useMemo(() => buildUkTaxYearRange(taxYear), [taxYear]);
  const taxYearEvents = useMemo(
    () =>
      filteredByEntity.filter(
        (event) => event.date >= taxYearRange.start && event.date <= taxYearRange.end
      ),
    [filteredByEntity, taxYearRange.end, taxYearRange.start]
  );
  const taxYearTotalBase = useMemo(
    () => taxYearEvents.reduce((sum, event) => sum + event.baseAmount, 0),
    [taxYearEvents]
  );
  const taxYearAccountTotals = useMemo(() => {
    const map = new Map<string, { account: Account; baseTotal: number }>();
    taxYearEvents.forEach((event) => {
      const entry = map.get(event.account.id) ?? { account: event.account, baseTotal: 0 };
      entry.baseTotal += event.baseAmount;
      map.set(event.account.id, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.baseTotal - a.baseTotal);
  }, [taxYearEvents]);
  const taxYearProviderTotals = useMemo(() => {
    const map = new Map<string, number>();
    taxYearEvents.forEach((event) => {
      map.set(event.provider, (map.get(event.provider) ?? 0) + event.baseAmount);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [taxYearEvents]);
  const taxYearTypeTotals = useMemo(() => {
    let savings = 0;
    let investment = 0;
    let other = 0;
    taxYearEvents.forEach((event) => {
      switch (event.account.type) {
        case 'savings':
        case 'cash':
          savings += event.baseAmount;
          break;
        case 'investment':
          investment += event.baseAmount;
          break;
        default:
          other += event.baseAmount;
          break;
      }
    });
    return { savings, investment, other };
  }, [taxYearEvents]);

  const collectionSummary = useMemo(() => {
    if (!selectedCollectionIds.length) return 'All collections';
    const names = selectedCollectionIds
      .map((id) => collections.find((collection) => collection.id === id)?.name ?? 'Collection')
      .join(', ');
    return names;
  }, [collections, selectedCollectionIds]);

  return (
    <div className="content-stack interest-page">
      <PageHeader
        title="Interest analytics"
        description="Track earned interest across accounts with currency-aware breakdowns and UK tax-year reporting."
      />

      {sourceContext ? (
        <section className="content-card interest-context-card">
          <header>
            <h2>Budget drill-down</h2>
            <p className="muted-text">
              Showing interest for {sourceContext.label ?? 'the selected line'} during {sourceContext.periodLabel ?? formatDate(appliedRange.start ?? '')}.
            </p>
          </header>
          <p className="muted-text">Filters below can expand or narrow the analysis without changing your budget.</p>
        </section>
      ) : null}

      <section className="content-card interest-filters">
        <header className="interest-section-header">
          <div>
            <h2>Filters</h2>
            <p className="muted-text">Choose the period and accounts to include in this analysis.</p>
          </div>
        </header>
        <div className="interest-filter-grid">
          <label>
            Range mode
            <select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as RangeMode)}>
              <option value="custom">Custom range</option>
              <option value="calendar">Calendar year</option>
              <option value="uk-tax">UK tax year</option>
            </select>
          </label>
          {rangeMode === 'calendar' ? (
            <label>
              Calendar year
              <select value={calendarYear} onChange={(event) => setCalendarYear(Number.parseInt(event.target.value, 10))}>
                {Array.from({ length: 6 }, (_, index) => currentYear - index).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {rangeMode === 'uk-tax' ? (
            <label>
              UK tax year
              <select value={taxYear} onChange={(event) => setTaxYear(Number.parseInt(event.target.value, 10))}>
                {taxYearOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}/{String(option + 1).slice(-2)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {rangeMode === 'custom' ? (
            <>
              <label>
                Start date
                <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
              </label>
              <label>
                End date
                <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
              </label>
            </>
          ) : null}
          <label>
            Accounts
            <select
              multiple
              value={selectedAccountIds}
              onChange={(event) =>
                setSelectedAccountIds(Array.from(event.target.selectedOptions, (option) => option.value))
              }
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Providers
            <select
              multiple
              value={selectedProviders}
              onChange={(event) =>
                setSelectedProviders(Array.from(event.target.selectedOptions, (option) => option.value))
              }
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label>
            Collections
            <select
              multiple
              value={selectedCollectionIds}
              onChange={(event) =>
                setSelectedCollectionIds(Array.from(event.target.selectedOptions, (option) => option.value))
              }
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monthly grouping
            <select value={monthlyGrouping} onChange={(event) => setMonthlyGrouping(event.target.value as MonthlyGrouping)}>
              <option value="total">Total interest</option>
              <option value="account">By account</option>
              <option value="provider">By provider</option>
            </select>
          </label>
        </div>
      </section>

      <section className="content-card interest-summary">
        <header className="interest-section-header">
          <div>
            <h2>Summary</h2>
            <p className="muted-text">
              {startDate ? formatDate(toIso(startDate)) : 'Any'} → {endDate ? formatDate(toIso(endDate)) : 'Any'} · {collectionSummary}
            </p>
          </div>
        </header>
        <div className="interest-summary-grid">
          <div>
            <span className="muted-text">Total interest</span>
            <strong>{formatCurrency(totalInterestBase, baseCurrency)}</strong>
          </div>
          <div>
            <span className="muted-text">Average balance (est.)</span>
            <strong>{formatCurrency(Math.max(averageBalanceMeta.totalAverage, 0), baseCurrency)}</strong>
            <p className="muted-text">{averageBalanceMeta.days} day range</p>
          </div>
          <div>
            <span className="muted-text">Blended APR</span>
            <strong>
              {blendedApr > 0 ? (
                <>
                  {formatPercentage(blendedApr, 2)}
                  <Tooltip label="Approximate effective annual rate based on interest earned and average balances." />
                </>
              ) : (
                '—'
              )}
            </strong>
          </div>
          <div>
            <span className="muted-text">Projected 12-month interest</span>
            <strong>
              {projectionNextYear > 0
                ? `${formatCurrency(projectionNextYear, baseCurrency)} (approx)`
                : '—'}
            </strong>
          </div>
        </div>
      </section>

      <section className="content-card interest-breakdown">
        <header className="interest-section-header">
          <div>
            <h2>Breakdowns</h2>
            <p className="muted-text">Identify the accounts and providers contributing the most interest.</p>
          </div>
        </header>
        <div className="interest-breakdown-grid">
          <div>
            <h3>By account</h3>
            {accountBreakdown.length === 0 ? (
              <p className="muted-text">No interest recorded for the current filters.</p>
            ) : (
              <table className="interest-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Base total</th>
                    <th>Native amounts</th>
                  </tr>
                </thead>
                <tbody>
                  {accountBreakdown.map((entry) => (
                    <tr key={entry.account.id}>
                      <td>{entry.account.name}</td>
                      <td>{formatCurrency(entry.baseTotal, baseCurrency)}</td>
                      <td>{formatAllocationNativeSummary(Object.fromEntries(entry.nativeTotals))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3>By provider</h3>
            {providerBreakdown.length === 0 ? (
              <p className="muted-text">No provider-level interest in this view.</p>
            ) : (
              <table className="interest-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Base total</th>
                    <th>Native amounts</th>
                  </tr>
                </thead>
                <tbody>
                  {providerBreakdown.map((entry) => (
                    <tr key={entry.provider}>
                      <td>{entry.provider}</td>
                      <td>{formatCurrency(entry.baseTotal, baseCurrency)}</td>
                      <td>{formatAllocationNativeSummary(Object.fromEntries(entry.nativeTotals))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3>By collection</h3>
            {collectionBreakdown.length === 0 ? (
              <p className="muted-text">Collections will appear once matching interest exists.</p>
            ) : (
              <table className="interest-table">
                <thead>
                  <tr>
                    <th>Collection</th>
                    <th>Base total</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionBreakdown.map((entry) => (
                    <tr key={entry.collectionId}>
                      <td>{collections.find((collection) => collection.id === entry.collectionId)?.name ?? 'Collection'}</td>
                      <td>{formatCurrency(entry.baseTotal, baseCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      <section className="content-card interest-monthly">
        <header className="interest-section-header">
          <div>
            <h2>Monthly trend</h2>
            <p className="muted-text">Visualise the last twelve months (or selected window) of interest earnings.</p>
          </div>
        </header>
        {timeline.rows.length === 0 ? (
          <p className="muted-text">No monthly interest to display for the current filters.</p>
        ) : (
          <div className="interest-timeline">
            {timeline.rows.map((row) => (
              <div key={row.key} className="interest-timeline__row">
                <div className="interest-timeline__label">{row.label}</div>
                <div className="interest-timeline__bar" aria-hidden>
                  {row.segments.map((segment, index) => (
                    <div
                      key={`${row.key}-${segment.key}-${index}`}
                      className="interest-timeline__segment"
                      style={{
                        width: `${row.total > 0 ? (segment.value / row.total) * 100 : 0}%`,
                        backgroundColor: segment.color
                      }}
                      title={`${segment.label}: ${formatCurrency(segment.value, baseCurrency)}`}
                    />
                  ))}
                </div>
                <div className="interest-timeline__value">{formatCurrency(row.total, baseCurrency)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="content-card interest-tax-year">
        <header className="interest-section-header">
          <div>
            <h2>UK tax-year report</h2>
            <p className="muted-text">Current selection respects the account, provider, and collection filters above.</p>
          </div>
          <div className="interest-tax-year__controls">
            {taxYearOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`chip-button ${option === taxYear ? 'active' : ''}`}
                onClick={() => setTaxYear(option)}
              >
                {option}/{String(option + 1).slice(-2)}
              </button>
            ))}
          </div>
        </header>
        <div className="interest-summary-grid">
          <div>
            <span className="muted-text">Tax-year total</span>
            <strong>{formatCurrency(taxYearTotalBase, baseCurrency)}</strong>
            <p className="muted-text">
              {formatDate(toIso(taxYearRange.start))} → {formatDate(toIso(taxYearRange.end))}
            </p>
          </div>
          <div>
            <span className="muted-text">Savings accounts</span>
            <strong>{formatCurrency(taxYearTypeTotals.savings, baseCurrency)}</strong>
          </div>
          <div>
            <span className="muted-text">Investment cash</span>
            <strong>{formatCurrency(taxYearTypeTotals.investment, baseCurrency)}</strong>
          </div>
          <div>
            <span className="muted-text">Other accounts</span>
            <strong>{formatCurrency(taxYearTypeTotals.other, baseCurrency)}</strong>
          </div>
        </div>
        <div className="interest-breakdown-grid">
          <div>
            <h3>Accounts</h3>
            {taxYearAccountTotals.length === 0 ? (
              <p className="muted-text">No interest recorded for this tax year.</p>
            ) : (
              <table className="interest-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Base total</th>
                  </tr>
                </thead>
                <tbody>
                  {taxYearAccountTotals.map((entry) => (
                    <tr key={entry.account.id}>
                      <td>{entry.account.name}</td>
                      <td>{formatCurrency(entry.baseTotal, baseCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3>Providers</h3>
            {taxYearProviderTotals.length === 0 ? (
              <p className="muted-text">No provider breakdown available.</p>
            ) : (
              <table className="interest-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Base total</th>
                  </tr>
                </thead>
                <tbody>
                  {taxYearProviderTotals.map(([provider, value]) => (
                    <tr key={provider}>
                      <td>{provider}</td>
                      <td>{formatCurrency(value, baseCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Interest;

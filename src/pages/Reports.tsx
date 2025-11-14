import { Fragment, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import ReportFiltersBar from '../components/ReportFilters';
import { SimpleLineChart, HorizontalBarChart } from '../components/ReportCharts';
import { useData } from '../data/DataContext';
import {
  Account,
  AccountCollection,
  AllocationRule,
  AllocationRulePurpose,
  Category,
  MasterCategory,
  SubCategory,
  Transaction,
  TransactionAllocation
} from '../data/models';
import {
  buildCurrencyConverter,
  CurrencyConverter,
  buildMonthlyPeriods,
  computeShare,
  describeDateRange,
  filterTransactionsForReports,
  initialiseReportFilters,
  periodKeyFromDate,
  pickTopCategories,
  ReportFilters,
  TransactionView
} from '../utils/reporting';
import { formatCurrency, formatPercentage } from '../utils/format';
import { formatAllocationNativeSummary } from '../utils/allocations';
import { exportToCsv } from '../utils/csv';
import '../styles/reports.css';

const palette = ['#38bdf8', '#f97316', '#a855f7', '#22d3ee', '#facc15', '#fb7185', '#4ade80'];

type ReportType =
  | 'net-worth'
  | 'income-expense'
  | 'category-trends'
  | 'collection-provider'
  | 'allocation-summary';

type NetWorthPoint = {
  period: { key: string; label: string; end: string };
  total: number;
};

type IncomeExpenseRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

type MonthlyBreakdown = {
  [masterId: string]: { master: MasterCategory | null; values: Record<string, number> };
};

type TrendSeries = {
  id: string;
  label: string;
  values: Record<string, number>;
};

type AllocationSummaryRow = {
  rule: AllocationRule | undefined;
  purpose: AllocationRulePurpose | undefined;
  baseAmount: number;
  native: Record<string, number>;
};

type CollectionBreakdownRow = {
  id: string;
  label: string;
  value: number;
};

const normaliseProvider = (value: string) => value.toLowerCase();

const filterAccounts = (accounts: Account[], filters: ReportFilters) => {
  const accountSet = filters.accountIds.length ? new Set(filters.accountIds) : null;
  const providerSet = filters.providerNames.length
    ? new Set(filters.providerNames.map((entry) => normaliseProvider(entry)))
    : null;
  const collectionSet = filters.collectionIds.length ? new Set(filters.collectionIds) : null;

  return accounts.filter((account) => {
    if (account.archived || !account.includeInTotals) return false;
    if (accountSet && !accountSet.has(account.id)) return false;
    if (providerSet && !providerSet.has(normaliseProvider(account.provider))) return false;
    if (collectionSet && collectionSet.size > 0) {
      const match = account.collectionIds.some((id) => collectionSet.has(id));
      if (!match) return false;
    }
    return true;
  });
};

const Reports = () => {
  const { state } = useData();
  const baseCurrency = state.settings.baseCurrency;
  const today = useMemo(() => new Date(), []);
  const [filters, setFilters] = useState<ReportFilters>(() => initialiseReportFilters(today));
  const [activeReport, setActiveReport] = useState<ReportType>('net-worth');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedSubCategoryIds, setSelectedSubCategoryIds] = useState<string[]>([]);
  const converter = useMemo(() => buildCurrencyConverter(state.settings), [state.settings]);

  const filteredAccounts = useMemo(
    () => filterAccounts(state.accounts, filters),
    [state.accounts, filters]
  );

  const transactionViews = useMemo(
    () =>
      filterTransactionsForReports(
        state.transactions,
        state.accounts,
        state.categories,
        state.masterCategories,
        filters
      ),
    [filters, state.accounts, state.categories, state.masterCategories, state.transactions]
  );

  const reportTabs: { id: ReportType; label: string; description: string }[] = [
    {
      id: 'net-worth',
      label: 'Net Worth Over Time',
      description: 'Track assets minus liabilities as month-end totals.'
    },
    {
      id: 'income-expense',
      label: 'Income vs Expense',
      description: 'Compare inflows and outflows by month and master category.'
    },
    {
      id: 'category-trends',
      label: 'Category Trends',
      description: 'Follow spending or income for specific categories over time.'
    },
    {
      id: 'collection-provider',
      label: 'Collection & Provider Breakdown',
      description: 'See which collections and providers drive the selected flows.'
    },
    {
      id: 'allocation-summary',
      label: 'Allocation Summary',
      description: 'Summarise income allocation purposes for the selected range.'
    }
  ];

  return (
    <div className="reports-page">
      <PageHeader
        title="Reports"
        description="Filterable, read-only analytics across net worth, income and expense, categories, collections, providers, and allocations."
      />
      <ReportFiltersBar
        filters={filters}
        accounts={state.accounts}
        collections={state.accountCollections}
        masterCategories={state.masterCategories}
        onChange={setFilters}
      />
      <nav className="report-tabs" aria-label="Reports">
        {reportTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`chip-button ${activeReport === tab.id ? 'active' : ''}`}
            onClick={() => setActiveReport(tab.id)}
          >
            <span className="report-tabs__label">{tab.label}</span>
            <span className="muted-text small">{tab.description}</span>
          </button>
        ))}
      </nav>
      <section className="content-card">
        {activeReport === 'net-worth' && (
          <NetWorthReport
            accounts={filteredAccounts}
            transactions={state.transactions}
            filters={filters}
            baseCurrency={baseCurrency}
            converter={converter}
          />
        )}
        {activeReport === 'income-expense' && (
          <IncomeExpenseReport
            transactions={transactionViews}
            baseCurrency={baseCurrency}
            filters={filters}
            masterCategories={state.masterCategories}
            converter={converter}
          />
        )}
        {activeReport === 'category-trends' && (
          <CategoryTrendsReport
            transactions={transactionViews}
            categories={state.categories}
            subCategories={state.subCategories}
            baseCurrency={baseCurrency}
            converter={converter}
            filters={filters}
            selectedCategoryIds={selectedCategoryIds}
            selectedSubCategoryIds={selectedSubCategoryIds}
            onCategorySelectionChange={setSelectedCategoryIds}
            onSubCategorySelectionChange={setSelectedSubCategoryIds}
          />
        )}
        {activeReport === 'collection-provider' && (
          <CollectionProviderReport
            accounts={state.accounts}
            collections={state.accountCollections}
            transactions={transactionViews}
            baseCurrency={baseCurrency}
            converter={converter}
            filters={filters}
          />
        )}
        {activeReport === 'allocation-summary' && (
          <AllocationSummaryReport
            transactions={transactionViews}
            allocations={state.transactionAllocations}
            rules={state.allocationRules}
            baseCurrency={baseCurrency}
            converter={converter}
            filters={filters}
          />
        )}
      </section>
    </div>
  );
};

const NetWorthReport = ({
  accounts,
  transactions,
  filters,
  baseCurrency,
  converter
}: {
  accounts: Account[];
  transactions: Transaction[];
  filters: ReportFilters;
  baseCurrency: string;
  converter: CurrencyConverter;
}) => {
  const periods = useMemo(
    () => buildMonthlyPeriods(filters.startDate, filters.endDate),
    [filters.endDate, filters.startDate]
  );

  const earliestOpening = useMemo(() => {
    const dates = accounts.map((account) => account.openingBalanceDate.slice(0, 10));
    if (dates.length === 0) {
      return filters.startDate;
    }
    const sorted = [...dates].sort();
    return sorted[0] < filters.startDate ? sorted[0] : filters.startDate;
  }, [accounts, filters.startDate]);

  const timelineTransactions = useMemo(() => {
    const accountSet = new Set(accounts.map((account) => account.id));
    const currencyLookup = new Map(accounts.map((account) => [account.id, account.currency]));
    return transactions
      .filter((transaction) => accountSet.has(transaction.accountId))
      .map((transaction) => ({
        accountId: transaction.accountId,
        date: transaction.date.slice(0, 10),
        amount: converter.toBase(
          transaction.amount,
          transaction.currency ?? currencyLookup.get(transaction.accountId) ?? null
        )
      }))
      .filter((entry) => entry.date >= earliestOpening && entry.date <= filters.endDate)
      .sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [accounts, converter, earliestOpening, filters.endDate, transactions]);

  const timelineByAccount = useMemo(() => {
    const grouped = new Map<string, { date: string; amount: number }[]>();
    timelineTransactions.forEach((entry) => {
      const existing = grouped.get(entry.accountId);
      if (existing) {
        existing.push({ date: entry.date, amount: entry.amount });
      } else {
        grouped.set(entry.accountId, [{ date: entry.date, amount: entry.amount }]);
      }
    });
    grouped.forEach((entries) => entries.sort((a, b) => (a.date > b.date ? 1 : -1)));
    return grouped;
  }, [timelineTransactions]);

  const series = useMemo(() => {
    const points: NetWorthPoint[] = [];
    const accountEntries = accounts.map((account) => {
      const baseOpening = converter.toBase(account.openingBalance, account.currency);
      const entries = timelineByAccount.get(account.id) ?? [];
      return { account, baseOpening, entries, index: 0, running: 0 };
    });

    periods.forEach((period) => {
      let total = 0;
      accountEntries.forEach((entry) => {
        while (
          entry.index < entry.entries.length &&
          entry.entries[entry.index].date <= period.end
        ) {
          entry.running += entry.entries[entry.index].amount;
          entry.index += 1;
        }
        total += entry.baseOpening + entry.running;
      });
      points.push({ period: { key: period.key, label: period.label, end: period.end }, total });
    });
    return points;
  }, [accounts, converter, periods, timelineTransactions]);

  const exportData = () => {
    const headers = ['Report', 'Date range', 'Period', 'Net worth'];
    const rows = series.map((point) => [
      'Net Worth Over Time',
      describeDateRange(filters.startDate, filters.endDate),
      point.period.label,
      formatCurrency(point.total, baseCurrency)
    ]);
    exportToCsv('net-worth-over-time.csv', headers, rows);
  };

  return (
    <div className="report-section">
      <header className="report-section__header">
        <div>
          <h2>Net Worth Over Time</h2>
          <p className="muted-text">
            Monthly net worth approximated from opening balances and transaction history in the base currency.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={exportData}>
          Export CSV
        </button>
      </header>
      <SimpleLineChart
        categories={series.map((point) => point.period.label)}
        series={[
          {
            label: `Net worth (${baseCurrency})`,
            values: series.map((point) => point.total),
            color: palette[0]
          }
        ]}
      />
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Net worth ({baseCurrency})</th>
            <th scope="col">Basis</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.period.key}>
              <td>{point.period.label}</td>
              <td>{formatCurrency(point.total, baseCurrency)}</td>
              <td>Derived from opening balances and cumulative transactions</td>
            </tr>
          ))}
          {series.length === 0 && (
            <tr>
              <td colSpan={3} className="muted-text">
                No balances matched the selected filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const IncomeExpenseReport = ({
  transactions,
  baseCurrency,
  filters,
  masterCategories,
  converter
}: {
  transactions: TransactionView[];
  baseCurrency: string;
  filters: ReportFilters;
  masterCategories: MasterCategory[];
  converter: CurrencyConverter;
}) => {
  const periods = useMemo(
    () => buildMonthlyPeriods(filters.startDate, filters.endDate),
    [filters.endDate, filters.startDate]
  );
  const periodLookup = useMemo(() => new Map(periods.map((period, index) => [period.key, index])), [periods]);

  const summary = useMemo(() => {
    const rows: IncomeExpenseRow[] = periods.map((period) => ({
      key: period.key,
      label: period.label,
      income: 0,
      expense: 0,
      net: 0
    }));
    const breakdown: MonthlyBreakdown = {};
    const masterById = new Map(masterCategories.map((master) => [master.id, master]));

    transactions.forEach((view) => {
      const key = periodKeyFromDate(view.date);
      const index = periodLookup.get(key);
      if (index === undefined) return;
      const amount = converter.toBase(
        view.transaction.amount,
        view.transaction.currency ?? view.account?.currency ?? null
      );

      switch (view.flow) {
        case 'transfer':
          return;
        case 'out':
        case 'fees':
          rows[index].expense += Math.abs(amount);
          break;
        default:
          rows[index].income += amount;
          break;
      }

      if (view.masterCategoryId) {
        const masterEntry = (breakdown[view.masterCategoryId] =
          breakdown[view.masterCategoryId] ?? {
            master: masterById.get(view.masterCategoryId) ?? null,
            values: {}
          });
        const existing = masterEntry.values[key] ?? 0;
        masterEntry.values[key] = existing + amount;
      } else {
        const uncategorised = (breakdown.__uncategorised = breakdown.__uncategorised ?? {
          master: null,
          values: {}
        });
        const existing = uncategorised.values[key] ?? 0;
        uncategorised.values[key] = existing + amount;
      }
    });

    rows.forEach((row) => {
      row.net = row.income - row.expense;
    });

    return { rows, breakdown };
  }, [converter, masterCategories, periodLookup, periods, transactions]);

  const exportData = () => {
    const headers = ['Report', 'Date range', 'Month', 'Income', 'Expense', 'Net'];
    const rows = summary.rows.map((row) => [
      'Income vs Expense',
      describeDateRange(filters.startDate, filters.endDate),
      row.label,
      formatCurrency(row.income, baseCurrency),
      formatCurrency(row.expense, baseCurrency),
      formatCurrency(row.net, baseCurrency)
    ]);
    exportToCsv('income-vs-expense.csv', headers, rows);
  };

  const chartSeries = useMemo(
    () => [
      {
        label: `Income (${baseCurrency})`,
        values: summary.rows.map((row) => row.income),
        color: palette[0]
      },
      {
        label: `Expense (${baseCurrency})`,
        values: summary.rows.map((row) => row.expense),
        color: palette[1]
      },
      {
        label: `Net (${baseCurrency})`,
        values: summary.rows.map((row) => row.net),
        color: palette[2]
      }
    ],
    [baseCurrency, summary.rows]
  );

  const masterRows = useMemo(() => {
    const entries = Object.entries(summary.breakdown).map(([masterId, data]) => ({
      id: masterId,
      label: data.master?.name ?? 'Uncategorised',
      values: data.values
    }));
    return entries.sort((a, b) => {
      const totalA = Object.values(a.values).reduce((sum, value) => sum + Math.abs(value), 0);
      const totalB = Object.values(b.values).reduce((sum, value) => sum + Math.abs(value), 0);
      return totalB - totalA;
    });
  }, [summary.breakdown]);

  return (
    <div className="report-section">
      <header className="report-section__header">
        <div>
          <h2>Income vs Expense</h2>
          <p className="muted-text">
            Inflows include Income and Interest flows. Transfers are excluded by default.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={exportData}>
          Export CSV
        </button>
      </header>
      <SimpleLineChart
        categories={summary.rows.map((row) => row.label)}
        series={chartSeries}
      />
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Income ({baseCurrency})</th>
            <th scope="col">Expense ({baseCurrency})</th>
            <th scope="col">Net ({baseCurrency})</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{formatCurrency(row.income, baseCurrency)}</td>
              <td>{formatCurrency(row.expense, baseCurrency)}</td>
              <td>{formatCurrency(row.net, baseCurrency)}</td>
            </tr>
          ))}
          {summary.rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted-text">
                No transactions matched the selected filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="report-table__scroll">
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Master category</th>
              {summary.rows.map((row) => (
                <th key={row.key} scope="col">
                  {row.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {masterRows.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.label}</td>
                {summary.rows.map((row) => (
                  <td key={row.key}>
                    {formatCurrency(entry.values[row.key] ?? 0, baseCurrency)}
                  </td>
                ))}
              </tr>
            ))}
            {masterRows.length === 0 && (
              <tr>
                <td colSpan={summary.rows.length + 1} className="muted-text">
                  No master category data for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CategoryTrendsReport = ({
  transactions,
  categories,
  subCategories,
  baseCurrency,
  converter,
  filters,
  selectedCategoryIds,
  selectedSubCategoryIds,
  onCategorySelectionChange,
  onSubCategorySelectionChange
}: {
  transactions: TransactionView[];
  categories: Category[];
  subCategories: SubCategory[];
  baseCurrency: string;
  converter: CurrencyConverter;
  filters: ReportFilters;
  selectedCategoryIds: string[];
  selectedSubCategoryIds: string[];
  onCategorySelectionChange: (ids: string[]) => void;
  onSubCategorySelectionChange: (ids: string[]) => void;
}) => {
  const periods = useMemo(
    () => buildMonthlyPeriods(filters.startDate, filters.endDate),
    [filters.endDate, filters.startDate]
  );

  const resolvedCategories = useMemo(() => {
    if (selectedCategoryIds.length > 0) {
      return categories.filter((category) => selectedCategoryIds.includes(category.id));
    }
    const top = pickTopCategories(transactions, categories, converter, 3);
    return top.categories;
  }, [categories, converter, selectedCategoryIds, transactions]);

  const series = useMemo(() => {
    const map = new Map<string, TrendSeries>();
    resolvedCategories.forEach((category, index) => {
      map.set(category.id, {
        id: category.id,
        label: category.name,
        values: {}
      });
    });

    transactions.forEach((view) => {
      if (!view.transaction.categoryId) return;
      const key = view.transaction.categoryId;
      const categorySeries = map.get(key);
      const monthKey = periodKeyFromDate(view.date);
      if (!categorySeries) return;
      const amount = converter.toBase(
        view.transaction.amount,
        view.transaction.currency ?? view.account?.currency ?? null
      );
      categorySeries.values[monthKey] = (categorySeries.values[monthKey] ?? 0) + amount;
    });

    const extraSubSeries = selectedSubCategoryIds
      .map((id) => subCategories.find((sub) => sub.id === id))
      .filter(Boolean)
      .map((subCategory) => ({
        id: `sub-${subCategory!.id}`,
        label: `${categories.find((cat) => cat.id === subCategory!.categoryId)?.name ?? 'Category'} → ${
          subCategory!.name
        }`,
        values: {} as Record<string, number>
      }));

    if (extraSubSeries.length > 0) {
      const subMap = new Map(
        extraSubSeries.map((entry) => [entry.id.replace('sub-', ''), entry])
      );
      transactions.forEach((view) => {
        if (!view.transaction.subCategoryId) return;
        const subEntry = subMap.get(view.transaction.subCategoryId);
        if (!subEntry) return;
        const amount = converter.toBase(
          view.transaction.amount,
          view.transaction.currency ?? view.account?.currency ?? null
        );
        const key = periodKeyFromDate(view.date);
        subEntry.values[key] = (subEntry.values[key] ?? 0) + amount;
      });
      extraSubSeries.forEach((entry) => map.set(entry.id, entry));
    }

    return Array.from(map.values());
  }, [categories, converter, resolvedCategories, selectedSubCategoryIds, subCategories, transactions]);

  const exportData = () => {
    const headers = ['Report', 'Date range', 'Series', 'Month', 'Amount'];
    const rows: (string | number)[][] = [];
    series.forEach((entry) => {
      periods.forEach((period) => {
        rows.push([
          'Category Trends',
          describeDateRange(filters.startDate, filters.endDate),
          entry.label,
          period.label,
          formatCurrency(entry.values[period.key] ?? 0, baseCurrency)
        ]);
      });
    });
    exportToCsv('category-trends.csv', headers, rows);
  };

  return (
    <div className="report-section">
      <header className="report-section__header">
        <div>
          <h2>Category Trends</h2>
          <p className="muted-text">
            Select categories or sub-categories to chart their monthly totals in the base currency.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={exportData}>
          Export CSV
        </button>
      </header>
      <div className="report-facet-grid">
        <label>
          Categories
          <select
            multiple
            value={selectedCategoryIds}
            onChange={(event) =>
              onCategorySelectionChange(
                Array.from(event.target.selectedOptions).map((option) => option.value)
              )
            }
          >
            {categories
              .filter((category) => !category.archived)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Sub-categories
          <select
            multiple
            value={selectedSubCategoryIds}
            onChange={(event) =>
              onSubCategorySelectionChange(
                Array.from(event.target.selectedOptions).map((option) => option.value)
              )
            }
          >
            {subCategories
              .filter((sub) => !sub.archived)
              .map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {`${categories.find((category) => category.id === sub.categoryId)?.name ?? 'Category'} → ${
                    sub.name
                  }`}
                </option>
              ))}
          </select>
        </label>
      </div>
      <SimpleLineChart
        categories={periods.map((period) => period.label)}
        series={series.map((entry, index) => ({
          label: `${entry.label} (${baseCurrency})`,
          values: periods.map((period) => entry.values[period.key] ?? 0),
          color: palette[index % palette.length]
        }))}
      />
      <div className="report-table__scroll">
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Series</th>
              {periods.map((period) => (
                <th key={period.key} scope="col">
                  {period.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.label}</td>
                {periods.map((period) => (
                  <td key={period.key}>{formatCurrency(entry.values[period.key] ?? 0, baseCurrency)}</td>
                ))}
              </tr>
            ))}
            {series.length === 0 && (
              <tr>
                <td colSpan={periods.length + 1} className="muted-text">
                  Select at least one category or sub-category to see trends.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CollectionProviderReport = ({
  accounts,
  collections,
  transactions,
  baseCurrency,
  converter,
  filters
}: {
  accounts: Account[];
  collections: AccountCollection[];
  transactions: TransactionView[];
  baseCurrency: string;
  converter: CurrencyConverter;
  filters: ReportFilters;
}) => {
  const collectionLookup = useMemo(
    () => new Map(collections.map((collection) => [collection.id, collection])),
    [collections]
  );
  const providerTotals = new Map<string, number>();
  const collectionTotals = new Map<string, number>();
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  transactions.forEach((view) => {
    const account = accountById.get(view.transaction.accountId);
    if (!account) return;
    const amount = converter.toBase(
      view.transaction.amount,
      view.transaction.currency ?? account.currency
    );
    const magnitude = Math.abs(amount);
    providerTotals.set(account.provider, (providerTotals.get(account.provider) ?? 0) + magnitude);
    if (account.collectionIds.length === 0) {
      collectionTotals.set('__unassigned', (collectionTotals.get('__unassigned') ?? 0) + magnitude);
    } else {
      account.collectionIds.forEach((collectionId) => {
        collectionTotals.set(collectionId, (collectionTotals.get(collectionId) ?? 0) + magnitude);
      });
    }
  });

  const providerRows: CollectionBreakdownRow[] = Array.from(providerTotals.entries())
    .map(([label, value]) => ({ id: label, label, value }))
    .sort((a, b) => b.value - a.value);

  const collectionRows: CollectionBreakdownRow[] = Array.from(collectionTotals.entries())
    .map(([id, value]) => ({
      id,
      label: id === '__unassigned' ? 'Unassigned' : collectionLookup.get(id)?.name ?? 'Collection',
      value
    }))
    .sort((a, b) => b.value - a.value);

  const providerTotalValue = providerRows.reduce((sum, row) => sum + row.value, 0);
  const collectionTotalValue = collectionRows.reduce((sum, row) => sum + row.value, 0);

  const exportData = () => {
    const headers = ['Report', 'Date range', 'Type', 'Name', `Total (${baseCurrency})`, 'Share'];
    const rows: (string | number)[][] = [
      ...providerRows.map((row) => [
        'Collection & Provider Breakdown',
        describeDateRange(filters.startDate, filters.endDate),
        'Provider',
        row.label,
        formatCurrency(row.value, baseCurrency),
        formatPercentage(computeShare(row.value, providerTotalValue), 1)
      ]),
      ...collectionRows.map((row) => [
        'Collection & Provider Breakdown',
        describeDateRange(filters.startDate, filters.endDate),
        'Collection',
        row.label,
        formatCurrency(row.value, baseCurrency),
        formatPercentage(computeShare(row.value, collectionTotalValue), 1)
      ])
    ];
    exportToCsv('collection-provider-breakdown.csv', headers, rows);
  };

  return (
    <div className="report-section">
      <header className="report-section__header">
        <div>
          <h2>Collection & Provider Breakdown</h2>
          <p className="muted-text">
            Totals use absolute values so you can compare the scale of selected flows by provider or collection.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={exportData}>
          Export CSV
        </button>
      </header>
      <div className="report-grid">
        <div>
          <h3>Providers</h3>
          <HorizontalBarChart
            data={providerRows.map((row, index) => ({
              label: `${row.label} (${formatCurrency(row.value, baseCurrency)})`,
              value: row.value,
              color: palette[index % palette.length]
            }))}
          />
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Total ({baseCurrency})</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {providerRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{formatCurrency(row.value, baseCurrency)}</td>
                  <td>{formatPercentage(computeShare(row.value, providerTotalValue), 1)}</td>
                </tr>
              ))}
              {providerRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted-text">
                    No providers matched the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <h3>Collections</h3>
          <HorizontalBarChart
            data={collectionRows.map((row, index) => ({
              label: `${row.label} (${formatCurrency(row.value, baseCurrency)})`,
              value: row.value,
              color: palette[(index + 3) % palette.length]
            }))}
          />
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Collection</th>
                <th scope="col">Total ({baseCurrency})</th>
                <th scope="col">Share</th>
              </tr>
            </thead>
            <tbody>
              {collectionRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{formatCurrency(row.value, baseCurrency)}</td>
                  <td>{formatPercentage(computeShare(row.value, collectionTotalValue), 1)}</td>
                </tr>
              ))}
              {collectionRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted-text">
                    No collections matched the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AllocationSummaryReport = ({
  transactions,
  allocations,
  rules,
  baseCurrency,
  converter,
  filters
}: {
  transactions: TransactionView[];
  allocations: TransactionAllocation[];
  rules: AllocationRule[];
  baseCurrency: string;
  converter: CurrencyConverter;
  filters: ReportFilters;
}) => {
  const transactionIds = useMemo(() => new Set(transactions.map((view) => view.transaction.id)), [
    transactions
  ]);
  const rulesById = useMemo(() => new Map(rules.map((rule) => [rule.id, rule])), [rules]);

  const rows = useMemo(() => {
    const totals = new Map<string, AllocationSummaryRow>();
    allocations.forEach((allocation) => {
      if (!transactionIds.has(allocation.transactionId)) return;
      const key = `${allocation.ruleId}:${allocation.purposeId}`;
      const existing = totals.get(key);
      if (existing) {
        existing.baseAmount += allocation.baseAmount;
        existing.native[allocation.nativeCurrency] =
          (existing.native[allocation.nativeCurrency] ?? 0) + allocation.nativeAmount;
      } else {
        totals.set(key, {
          rule: rulesById.get(allocation.ruleId),
          purpose: rulesById.get(allocation.ruleId)?.purposes.find((p) => p.id === allocation.purposeId),
          baseAmount: allocation.baseAmount,
          native: { [allocation.nativeCurrency]: allocation.nativeAmount }
        });
      }
    });
    return Array.from(totals.values()).sort((a, b) => b.baseAmount - a.baseAmount);
  }, [allocations, rulesById, transactionIds]);

  const total = rows.reduce((sum, row) => sum + row.baseAmount, 0);

  const exportData = () => {
    if (rows.length === 0) {
      exportToCsv('allocation-summary.csv', ['Report', 'Message'], [
        ['Allocation Summary', 'No allocations matched the selected filters']
      ]);
      return;
    }
    const headers = ['Report', 'Date range', 'Rule', 'Purpose', `Allocated (${baseCurrency})`, 'Share'];
    const csvRows = rows.map((row) => [
      'Allocation Summary',
      describeDateRange(filters.startDate, filters.endDate),
      row.rule?.name ?? 'Rule',
      row.purpose?.name ?? 'Purpose',
      formatCurrency(row.baseAmount, baseCurrency),
      formatPercentage(computeShare(row.baseAmount, total), 1)
    ]);
    exportToCsv('allocation-summary.csv', headers, csvRows);
  };

  return (
    <div className="report-section">
      <header className="report-section__header">
        <div>
          <h2>Allocation Summary</h2>
          <p className="muted-text">
            Totals aggregate allocation entries; run allocation rules first if this table is empty.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={exportData}>
          Export CSV
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="muted-text">
          No allocation data for the selected range. Configure allocation rules and run them to populate this view.
        </p>
      ) : (
        <Fragment>
          <SimpleLineChart
            categories={rows.map((row) => row.purpose?.name ?? 'Purpose')}
            series={[
              {
                label: `Allocated (${baseCurrency})`,
                values: rows.map((row) => row.baseAmount),
                color: palette[4]
              }
            ]}
          />
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Purpose</th>
                <th scope="col">Allocated ({baseCurrency})</th>
                <th scope="col">Share</th>
                <th scope="col">Native summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.rule?.id ?? 'rule'}:${row.purpose?.id ?? 'purpose'}`}> 
                  <td>{row.rule?.name ?? 'Rule'}</td>
                  <td>{row.purpose?.name ?? 'Purpose'}</td>
                  <td>{formatCurrency(row.baseAmount, baseCurrency)}</td>
                  <td>{formatPercentage(computeShare(row.baseAmount, total), 1)}</td>
                  <td>{formatAllocationNativeSummary(row.native)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Fragment>
      )}
    </div>
  );
};

export default Reports;


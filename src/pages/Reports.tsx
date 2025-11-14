import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { formatCurrency, formatPercentage } from '../utils/format';
import { formatAllocationNativeSummary } from '../utils/allocations';
import { calculateBudgetPeriod } from '../utils/budgetCalculations';
import '../styles/reports.css';

const Reports = () => {
  const { state } = useData();
  const today = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const base = new Date(today);
    base.setMonth(base.getMonth() - 1);
    return base.toISOString().slice(0, 10);
  }, [today]);
  const defaultEnd = today.toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string>(
    () => state.budgets.find((budget) => budget.isPrimary)?.id ?? state.budgets[0]?.id ?? ''
  );

  const allocationSummary = useMemo(() => {
    const transactionsById = new Map(state.transactions.map((txn) => [txn.id, txn]));
    const rulesById = new Map(state.allocationRules.map((rule) => [rule.id, rule]));
    const filtered = state.transactionAllocations.filter((allocation) => {
      const transaction = transactionsById.get(allocation.transactionId);
      if (!transaction) return false;
      const date = transaction.date.slice(0, 10);
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      return true;
    });
    const totals = new Map<
      string,
      {
        ruleName: string;
        purposeName: string;
        baseAmount: number;
        nativeAmounts: Record<string, number>;
      }
    >();
    let totalBase = 0;
    filtered.forEach((allocation) => {
      const key = `${allocation.ruleId}:${allocation.purposeId}`;
      const rule = rulesById.get(allocation.ruleId);
      const purpose = rule?.purposes.find((entry) => entry.id === allocation.purposeId);
      totalBase += allocation.baseAmount;
      const entry = totals.get(key);
      if (entry) {
        entry.baseAmount += allocation.baseAmount;
        entry.nativeAmounts[allocation.nativeCurrency] =
          (entry.nativeAmounts[allocation.nativeCurrency] ?? 0) + allocation.nativeAmount;
      } else {
        totals.set(key, {
          ruleName: rule?.name ?? 'Allocation rule',
          purposeName: purpose?.name ?? 'Purpose',
          baseAmount: allocation.baseAmount,
          nativeAmounts: { [allocation.nativeCurrency]: allocation.nativeAmount }
        });
      }
    });
    const purposes = Array.from(totals.entries())
      .map(([key, value]) => ({
        key,
        ...value
      }))
      .sort((a, b) => b.baseAmount - a.baseAmount);
    return { totalBase, purposes };
  }, [
    endDate,
    startDate,
    state.allocationRules,
    state.transactionAllocations,
    state.transactions
  ]);

  const selectedBudget = useMemo(
    () => state.budgets.find((budget) => budget.id === selectedBudgetId) ?? null,
    [state.budgets, selectedBudgetId]
  );

  const budgetComparison = useMemo(() => {
    if (!selectedBudget) {
      return null;
    }
    const lines = state.budgetLines.filter((line) => line.budgetId === selectedBudget.id);
    if (!lines.length) {
      return { planned: 0, actual: 0, label: 'No lines configured' };
    }
    const reference = endDate ? new Date(endDate) : today;
    const period = calculateBudgetPeriod({
      budget: selectedBudget,
      lines,
      accounts: state.accounts,
      transactions: state.transactions,
      categories: state.categories,
      subCategories: state.subCategories,
      masterCategories: state.masterCategories,
      settings: state.settings,
      referenceDate: reference
    });
    return {
      planned: period.summary.totals.incomePlanned,
      actual: period.summary.totals.incomeActual,
      label: period.period.label
    };
  }, [
    endDate,
    selectedBudget,
    state.accounts,
    state.budgetLines,
    state.categories,
    state.masterCategories,
    state.settings,
    state.subCategories,
    state.transactions,
    today
  ]);

  const allocationCoverage = budgetComparison && budgetComparison.planned > 0
    ? (allocationSummary.totalBase / budgetComparison.planned) * 100
    : 0;

  return (
    <div className="reports-page">
      <PageHeader
        title="Reports"
        description="Generate net worth, income vs expense, merchant trends, and tax-ready summaries."
      />
      <section className="content-card allocation-report-card">
        <header className="allocation-report-card__header">
          <div>
            <h2>Allocation summary</h2>
            <p className="muted-text">
              Review how income allocations stack up against your selected budget or goal.
            </p>
          </div>
          <div className="allocation-report-card__filters">
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label>
              Budget comparison
              <select
                value={selectedBudgetId}
                onChange={(event) => setSelectedBudgetId(event.target.value)}
              >
                <option value="">No budget selected</option>
                {state.budgets.map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <div className="allocation-report-summary">
          <div>
            <span className="muted-text">Allocated income</span>
            <strong>{formatCurrency(allocationSummary.totalBase, state.settings.baseCurrency)}</strong>
          </div>
          <div>
            <span className="muted-text">Budgeted income</span>
            <strong>
              {budgetComparison
                ? formatCurrency(budgetComparison.planned, state.settings.baseCurrency)
                : '—'}
            </strong>
            {budgetComparison ? (
              <span className="muted-text">{budgetComparison.label}</span>
            ) : null}
          </div>
          <div>
            <span className="muted-text">Difference</span>
            <strong>
              {budgetComparison
                ? formatCurrency(
                    allocationSummary.totalBase - budgetComparison.planned,
                    state.settings.baseCurrency
                  )
                : '—'}
            </strong>
          </div>
          <div>
            <span className="muted-text">Allocation vs plan</span>
            <strong>
              {budgetComparison && budgetComparison.planned > 0
                ? formatPercentage(allocationCoverage, 1)
                : '—'}
            </strong>
          </div>
          <div>
            <span className="muted-text">Actual income</span>
            <strong>
              {budgetComparison
                ? formatCurrency(budgetComparison.actual, state.settings.baseCurrency)
                : '—'}
            </strong>
          </div>
        </div>
        <div className="allocation-report-grid">
          {allocationSummary.purposes.length === 0 ? (
            <p className="muted-text">No allocations matched the selected date range.</p>
          ) : (
            allocationSummary.purposes.map((purpose) => {
              const share = allocationSummary.totalBase
                ? (purpose.baseAmount / allocationSummary.totalBase) * 100
                : 0;
              return (
                <article key={purpose.key} className="allocation-report-card__item">
                  <header>
                    <h3>{purpose.purposeName}</h3>
                    <span className="muted-text">{purpose.ruleName}</span>
                  </header>
                  <div className="allocation-report-card__figures">
                    <strong>
                      {formatCurrency(purpose.baseAmount, state.settings.baseCurrency)}
                    </strong>
                    <span>{formatPercentage(share, 1)}</span>
                  </div>
                  <p className="muted-text">
                    {formatAllocationNativeSummary(purpose.nativeAmounts)}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </section>
      <div className="content-card">
        <p>
          Reports will deliver tailored views for fiscal years, calendar months, collections,
          categories, and allocation audits with exportable charts.
        </p>
        <div className="placeholder-grid">
          <div className="placeholder-tile">
            <h3>Report Gallery</h3>
            <p>Placeholder for selecting dashboards like income vs expense and collection insights.</p>
            <Tooltip label="Report gallery tooltip placeholder" />
          </div>
          <div className="placeholder-tile">
            <h3>Schedule Builder</h3>
            <p>Placeholder for scheduling exports and sharing filtered report packs.</p>
            <Tooltip label="Schedule builder tooltip placeholder" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;

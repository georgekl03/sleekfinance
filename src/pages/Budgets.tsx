import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { AccountCollection, Budget } from '../data/models';
import {
  applyBudgetPeriodDraft,
  BUDGET_PERIOD_TYPE_LABELS,
  formatBudgetPeriodRange,
  getBudgetPeriodInfo
} from '../utils/budgetPeriods';
import { formatCurrency, formatPercentage } from '../utils/format';
import {
  calculateBudgetPeriod,
  BudgetLineMetric,
  BudgetLineStatus,
  BudgetSubLineMetric
} from '../utils/budgetCalculations';
import '../styles/budgets.css';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: new Date(Date.UTC(2000, index, 1)).toLocaleDateString(undefined, {
    month: 'long'
  })
}));

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];

const PERIOD_TYPE_OPTIONS = [
  { value: 'monthly', label: BUDGET_PERIOD_TYPE_LABELS.monthly },
  { value: 'weekly', label: BUDGET_PERIOD_TYPE_LABELS.weekly },
  { value: 'annual', label: BUDGET_PERIOD_TYPE_LABELS.annual },
  { value: 'uk-fiscal', label: BUDGET_PERIOD_TYPE_LABELS['uk-fiscal'] }
] as const;

const STATUS_LABELS: Record<BudgetLineStatus, string> = {
  none: 'No activity',
  under: 'Under budget',
  near: 'Nearing limit',
  over: 'Over budget'
};

const FLOW_LABELS: Record<BudgetLineMetric['flow'], string> = {
  in: 'Income',
  out: 'Expense',
  transfer: 'Transfer'
};

type BudgetFormState = {
  name: string;
  periodType: Budget['periodType'];
  startMonth?: number;
  startYear?: number;
  startDayOfWeek?: number;
  includeMode: Budget['includeMode'];
  collectionIds: string[];
  rolloverEnabled: boolean;
};

type BudgetListItemProps = {
  budget: Budget;
  isSelected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onSetPrimary: () => void;
};

const BudgetListItem = ({
  budget,
  isSelected,
  onSelect,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onSetPrimary
}: BudgetListItemProps) => {
  const period = useMemo(() => getBudgetPeriodInfo(budget), [budget]);
  const inclusionLabel =
    budget.includeMode === 'collections' ? 'Collections' : 'All accounts';

  return (
    <div className={`budget-card${isSelected ? ' selected' : ''}`}>
      <button type="button" className="budget-card__select" onClick={onSelect}>
        <div>
          <h3>{budget.name}</h3>
          <p className="budget-card__meta-line">
            {BUDGET_PERIOD_TYPE_LABELS[budget.periodType]} • {period.label}
          </p>
          <p className="muted-text">{formatBudgetPeriodRange(period)}</p>
        </div>
      </button>
      <div className="budget-card__badges">
        <span className="budget-badge">{inclusionLabel}</span>
        {budget.isPrimary ? <span className="budget-badge primary">Primary</span> : null}
        {budget.archived ? <span className="budget-badge archived">Archived</span> : null}
      </div>
      <div className="budget-card__actions">
        <button type="button" className="chip-button" onClick={onRename}>
          Rename
        </button>
        <button type="button" className="chip-button" onClick={onDuplicate}>
          Duplicate
        </button>
        {!budget.isPrimary && !budget.archived ? (
          <button type="button" className="chip-button" onClick={onSetPrimary}>
            Set primary
          </button>
        ) : null}
        {budget.archived ? (
          <button type="button" className="chip-button" onClick={onRestore}>
            Restore
          </button>
        ) : (
          <button type="button" className="chip-button" onClick={onArchive}>
            Archive
          </button>
        )}
        <button type="button" className="chip-button danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
};

type BudgetEditorProps = {
  budget: Budget;
  collections: AccountCollection[];
  onClose: () => void;
};

const BudgetEditor = ({ budget, collections, onClose }: BudgetEditorProps) => {
  const {
    state,
    updateBudget,
    createBudgetLine,
    removeBudgetLine,
    setBudgetLineMode,
    setBudgetLinePlannedAmount,
    createBudgetSubLine,
    removeBudgetSubLine,
    setBudgetSubLinePlannedAmount
  } = useData();
  const navigate = useNavigate();
  const baseCurrency = state.settings.baseCurrency;
  const referenceDate = useMemo(() => new Date(), []);
  const [form, setForm] = useState<BudgetFormState>(() => ({
    name: budget.name,
    periodType: budget.periodType,
    startMonth: budget.startMonth,
    startYear: budget.startYear,
    startDayOfWeek: budget.startDayOfWeek ?? 1,
    includeMode: budget.includeMode,
    collectionIds: budget.collectionIds,
    rolloverEnabled: budget.rolloverEnabled
  }));
  const [periodOffset, setPeriodOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalised = applyBudgetPeriodDraft(budget, {}, new Date());
    setForm({
      name: budget.name,
      periodType: normalised.periodType,
      startMonth: normalised.startMonth,
      startYear: normalised.startYear,
      startDayOfWeek: normalised.startDayOfWeek ?? 1,
      includeMode: budget.includeMode,
      collectionIds: budget.collectionIds,
      rolloverEnabled: budget.rolloverEnabled
    });
    setPeriodOffset(0);
    setError(null);
  }, [budget]);

  const previewBudget = useMemo(() => {
    const periodApplied = applyBudgetPeriodDraft(budget, {
      periodType: form.periodType,
      startMonth: form.periodType === 'monthly' ? form.startMonth : undefined,
      startYear:
        form.periodType === 'monthly' ||
        form.periodType === 'annual' ||
        form.periodType === 'uk-fiscal'
          ? form.startYear
          : undefined,
      startDayOfWeek: form.periodType === 'weekly' ? form.startDayOfWeek : undefined
    });
    return {
      ...periodApplied,
      includeMode: form.includeMode,
      collectionIds:
        form.includeMode === 'collections'
          ? Array.from(new Set(form.collectionIds))
          : [],
      rolloverEnabled: form.rolloverEnabled
    };
  }, [budget, form]);

  const lines = useMemo(
    () =>
      state.budgetLines
        .filter((line) => line.budgetId === budget.id)
        .sort((a, b) => (a.order - b.order) || a.createdAt.localeCompare(b.createdAt)),
    [budget.id, state.budgetLines]
  );

  const computation = useMemo(
    () =>
      calculateBudgetPeriod({
        budget: previewBudget,
        lines,
        accounts: state.accounts,
        transactions: state.transactions,
        categories: state.categories,
        subCategories: state.subCategories,
        masterCategories: state.masterCategories,
        settings: state.settings,
        referenceDate,
        periodOffset
      }),
    [
      previewBudget,
      lines,
      state.accounts,
      state.transactions,
      state.categories,
      state.subCategories,
      state.masterCategories,
      state.settings,
      referenceDate,
      periodOffset
    ]
  );

  const periodInfo = computation.period;
  const periodRange = formatBudgetPeriodRange(periodInfo);
  const periodKey = computation.periodKey;

  const includedAccounts = useMemo(
    () =>
      state.accounts.filter((account) => {
        if (account.archived) return false;
        if (!account.includeInTotals) return false;
        if (form.includeMode === 'collections') {
          return form.collectionIds.some((collectionId) =>
            account.collectionIds.includes(collectionId)
          );
        }
        return true;
      }),
    [state.accounts, form.includeMode, form.collectionIds]
  );

  const availableCategories = useMemo(
    () =>
      state.categories
        .filter(
          (category) =>
            !category.archived &&
            !category.mergedIntoId &&
            category.masterCategoryId &&
            !lines.some((line) => line.categoryId === category.id)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lines, state.categories]
  );

  const [newLineCategory, setNewLineCategory] = useState<string>(
    () => availableCategories[0]?.id ?? ''
  );

  useEffect(() => {
    if (!availableCategories.some((category) => category.id === newLineCategory)) {
      setNewLineCategory(availableCategories[0]?.id ?? '');
    }
  }, [availableCategories, newLineCategory]);

  const getAvailableSubCategories = useMemo(
    () =>
      (line: BudgetLineMetric['line']) => {
        const used = new Set(line.subLines.map((sub) => sub.subCategoryId));
        return state.subCategories
          .filter(
            (sub) =>
              sub.categoryId === line.categoryId &&
              !sub.archived &&
              !sub.mergedIntoId &&
              !used.has(sub.id)
          )
          .sort((a, b) => a.name.localeCompare(b.name));
      },
    [state.subCategories]
  );

  const [subLineSelections, setSubLineSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    setSubLineSelections((current) => {
      const next: Record<string, string> = {};
      lines.forEach((line) => {
        const options = getAvailableSubCategories(line);
        const currentValue = current[line.id];
        if (currentValue && options.some((option) => option.id === currentValue)) {
          next[line.id] = currentValue;
        } else {
          next[line.id] = options[0]?.id ?? '';
        }
      });
      return next;
    });
  }, [getAvailableSubCategories, lines]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      periodType: form.periodType,
      startMonth: form.periodType === 'monthly' ? form.startMonth : undefined,
      startYear:
        form.periodType === 'monthly' ||
        form.periodType === 'annual' ||
        form.periodType === 'uk-fiscal'
          ? form.startYear
          : undefined,
      startDayOfWeek: form.periodType === 'weekly' ? form.startDayOfWeek : undefined,
      includeMode: form.includeMode,
      collectionIds:
        form.includeMode === 'collections' ? Array.from(new Set(form.collectionIds)) : [],
      rolloverEnabled: form.rolloverEnabled
    };
    const result = updateBudget(budget.id, payload);
    if (result) {
      setError(`${result.title}: ${result.description}`);
      return;
    }
    setError(null);
  };

  const handleCollectionToggle = (collectionId: string, checked: boolean) => {
    setForm((current) => {
      if (checked) {
        return {
          ...current,
          collectionIds: Array.from(new Set([...current.collectionIds, collectionId]))
        };
      }
      return {
        ...current,
        collectionIds: current.collectionIds.filter((id) => id !== collectionId)
      };
    });
  };

  const handleAddLine = () => {
    if (!newLineCategory) return;
    const line = createBudgetLine(budget.id, newLineCategory);
    if (!line) {
      window.alert('Category already added to this budget.');
      return;
    }
    setNewLineCategory('');
  };

  const handleRemoveLine = (line: BudgetLineMetric) => {
    const confirmed = window.confirm(`Remove ${line.category?.name ?? 'category'} from this budget?`);
    if (confirmed) {
      removeBudgetLine(line.line.id);
    }
  };

  const handleModeToggle = (line: BudgetLineMetric, enabled: boolean) => {
    setBudgetLineMode(line.line.id, enabled ? 'breakdown' : 'single');
  };

  const handlePlanChange = (line: BudgetLineMetric, value: string) => {
    const numeric = Number.parseFloat(value);
    const amount = Number.isFinite(numeric) ? Math.max(numeric, 0) : 0;
    setBudgetLinePlannedAmount(line.line.id, periodKey, amount);
  };

  const handleAddSubLine = (line: BudgetLineMetric) => {
    const selection = subLineSelections[line.line.id];
    if (!selection) return;
    createBudgetSubLine(line.line.id, selection);
    setSubLineSelections((current) => ({ ...current, [line.line.id]: '' }));
  };

  const handleSubLinePlanChange = (subLine: BudgetSubLineMetric, value: string) => {
    const numeric = Number.parseFloat(value);
    const amount = Number.isFinite(numeric) ? Math.max(numeric, 0) : 0;
    setBudgetSubLinePlannedAmount(subLine.subLine.id, periodKey, amount);
  };

  const handleDrilldown = (line: BudgetLineMetric, subLine?: BudgetSubLineMetric) => {
    navigate('/transactions', {
      state: {
        budgetDrilldown: {
          budgetId: budget.id,
          budgetName: budget.name,
          lineId: line.line.id,
          lineName: line.category?.name ?? 'Category',
          subLineId: subLine ? subLine.subLine.id : null,
          subLineName: subLine?.subCategory?.name ?? null,
          period: {
            start: periodInfo.start.toISOString().slice(0, 10),
            end: periodInfo.end.toISOString().slice(0, 10),
            label: periodInfo.label
          },
          flow: line.flow,
          includeMode: form.includeMode,
          accountIds: includedAccounts.map((account) => account.id),
          collectionIds: form.collectionIds,
          categoryId: line.line.categoryId,
          subCategoryId: subLine ? subLine.subLine.subCategoryId : null
        }
      }
    });
  };

  const formatDifference = (value: number) => {
    const formatted = formatCurrency(Math.abs(value), baseCurrency);
    if (value === 0) return formatted;
    return `${value > 0 ? '+' : '-'}${formatted}`;
  };

  const summary = computation.summary;
  const lineMetrics = computation.lines;

  return (
    <div className="budget-editor">
      <header className="budget-editor__header">
        <h3>Edit budget</h3>
        <p className="muted-text">
          Update the cadence, inclusion scope, and planned amounts for each category.
        </p>
      </header>
      <form className="form-grid" onSubmit={handleSubmit}>
        {error ? (
          <p role="alert" className="error-text">
            {error}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="budget-name">
            Budget name
            <Tooltip label="Give the budget a descriptive name such as Core Living or Side Projects." />
          </label>
          <input
            id="budget-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="budget-period-type">
            Period type
            <Tooltip label="Choose how long each budgeting cycle lasts. UK fiscal year runs 6 April to 5 April automatically." />
          </label>
          <select
            id="budget-period-type"
            value={form.periodType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                periodType: event.target.value as Budget['periodType']
              }))
            }
          >
            {PERIOD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {form.periodType === 'monthly' ? (
          <div className="field-grid">
            <div className="field">
              <label htmlFor="budget-start-month">Start month</label>
              <select
                id="budget-start-month"
                value={form.startMonth ?? 0}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startMonth: Number.parseInt(event.target.value, 10)
                  }))
                }
              >
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="budget-start-year">Start year</label>
              <input
                id="budget-start-year"
                type="number"
                value={form.startYear ?? ''}
                onChange={(event) => {
                  const next = event.target.value;
                  setForm((current) => ({
                    ...current,
                    startYear: next === '' ? undefined : Number.parseInt(next, 10)
                  }));
                }}
              />
            </div>
          </div>
        ) : null}
        {form.periodType === 'weekly' ? (
          <div className="field">
            <label htmlFor="budget-start-day">Week starts on</label>
            <select
              id="budget-start-day"
              value={form.startDayOfWeek ?? 1}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  startDayOfWeek: Number.parseInt(event.target.value, 10)
                }))
              }
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {form.periodType === 'annual' ? (
          <div className="field">
            <label htmlFor="budget-annual-year">Start year</label>
            <input
              id="budget-annual-year"
              type="number"
              value={form.startYear ?? ''}
              onChange={(event) => {
                const next = event.target.value;
                setForm((current) => ({
                  ...current,
                  startYear: next === '' ? undefined : Number.parseInt(next, 10)
                }));
              }}
            />
          </div>
        ) : null}
        {form.periodType === 'uk-fiscal' ? (
          <div className="field">
            <label htmlFor="budget-fiscal-year">Tax year starting</label>
            <input
              id="budget-fiscal-year"
              type="number"
              value={form.startYear ?? ''}
              onChange={(event) => {
                const next = event.target.value;
                setForm((current) => ({
                  ...current,
                  startYear: next === '' ? undefined : Number.parseInt(next, 10)
                }));
              }}
            />
          </div>
        ) : null}
        <div className="field">
          <span>
            Include accounts / collections
            <Tooltip label="All budgets include accounts shown in lists by default. Switch to collections to focus on a subset of accounts." />
          </span>
          <div className="radio-stack">
            <label>
              <input
                type="radio"
                name="budget-inclusion"
                value="all"
                checked={form.includeMode === 'all'}
                onChange={() => setForm((current) => ({ ...current, includeMode: 'all' }))}
              />
              All accounts that are shown in lists and count in net worth
            </label>
            <label>
              <input
                type="radio"
                name="budget-inclusion"
                value="collections"
                checked={form.includeMode === 'collections'}
                onChange={() => setForm((current) => ({ ...current, includeMode: 'collections' }))}
              />
              Only accounts inside specific collections
            </label>
          </div>
        </div>
        {form.includeMode === 'collections' ? (
          <div className="collection-picker">
            {collections.length === 0 ? (
              <p className="muted-text">No collections available yet. Create one from the Collections page.</p>
            ) : (
              collections.map((collection) => (
                <label key={collection.id} className="collection-checkbox">
                  <input
                    type="checkbox"
                    checked={form.collectionIds.includes(collection.id)}
                    onChange={(event) => handleCollectionToggle(collection.id, event.target.checked)}
                  />
                  <span className="collection-name">{collection.name}</span>
                </label>
              ))
            )}
          </div>
        ) : null}
        <div className="field checkbox-field">
          <label>
            <input
              type="checkbox"
              checked={form.rolloverEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, rolloverEnabled: event.target.checked }))
              }
            />
            Enable rollover between periods
          </label>
          <p className="muted-text">
            When enabled, unspent or overspent amounts carry into the next period automatically.
          </p>
        </div>
        <div className="field">
          <span>Active period preview</span>
          <div className="period-preview">
            <div>
              <strong>{periodInfo.label}</strong>
              <p className="muted-text">{periodRange}</p>
            </div>
            <div className="period-controls">
              <button
                type="button"
                className="chip-button"
                onClick={() => setPeriodOffset((value) => value - 1)}
              >
                Previous
              </button>
              <button type="button" className="chip-button" onClick={() => setPeriodOffset(0)}>
                Current
              </button>
              <button
                type="button"
                className="chip-button"
                onClick={() => setPeriodOffset((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button">
            Save changes
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close editor
          </button>
        </div>
      </form>

      <section className="budget-summary-card">
        <header>
          <h4>Summary for {periodInfo.label}</h4>
          <p className="muted-text">
            Planned amounts are stored in {baseCurrency}. Actuals convert from transaction currencies.
          </p>
        </header>
        <div className="budget-summary__totals">
          <div>
            <strong>Income</strong>
            <div className="budget-summary__figure">
              <span>Planned</span>
              <span>{formatCurrency(summary.totals.incomePlanned, baseCurrency)}</span>
            </div>
            <div className="budget-summary__figure">
              <span>Actual</span>
              <span>{formatCurrency(summary.totals.incomeActual, baseCurrency)}</span>
            </div>
            <div className="budget-summary__figure">
              <span>Difference</span>
              <span>{formatDifference(summary.totals.incomePlanned - summary.totals.incomeActual)}</span>
            </div>
          </div>
          <div>
            <strong>Expenses</strong>
            <div className="budget-summary__figure">
              <span>Planned</span>
              <span>{formatCurrency(summary.totals.expensePlanned, baseCurrency)}</span>
            </div>
            <div className="budget-summary__figure">
              <span>Actual</span>
              <span>{formatCurrency(summary.totals.expenseActual, baseCurrency)}</span>
            </div>
            <div className="budget-summary__figure">
              <span>Difference</span>
              <span>{formatDifference(summary.totals.expensePlanned - summary.totals.expenseActual)}</span>
            </div>
          </div>
        </div>
        <div className="budget-summary__breakdown">
          <div>
            <h5>Income by master category</h5>
            {summary.income.length === 0 ? (
              <p className="muted-text">No income categories in this period.</p>
            ) : (
              summary.income.map((entry) => (
                <div
                  key={entry.master.id}
                  className={`budget-summary__entry budget-status--${entry.status}`}
                >
                  <span>{entry.master.name}</span>
                  <span>{formatDifference(entry.planned - entry.actual)}</span>
                </div>
              ))
            )}
          </div>
          <div>
            <h5>Expenses by master category</h5>
            {summary.expenses.length === 0 ? (
              <p className="muted-text">No expense categories in this period.</p>
            ) : (
              summary.expenses.map((entry) => (
                <div
                  key={entry.master.id}
                  className={`budget-summary__entry budget-status--${entry.status}`}
                >
                  <span>{entry.master.name}</span>
                  <span>{formatDifference(entry.planned - entry.actual)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="budget-lines-section">
        <header className="budget-lines__header">
          <div>
            <h4>Budget lines</h4>
            <p className="muted-text">
              Click any line to open the Transactions workspace filtered to its matching activity.
            </p>
          </div>
          <div className="budget-lines__add">
            <select
              value={newLineCategory}
              onChange={(event) => setNewLineCategory(event.target.value)}
            >
              <option value="">Select category</option>
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chip-button"
              onClick={handleAddLine}
              disabled={!newLineCategory}
            >
              Add line
            </button>
          </div>
        </header>
        {lineMetrics.length === 0 ? (
          <p className="muted-text">
            Add budget lines to plan amounts for categories and compare real activity.
          </p>
        ) : (
          <div className="budget-lines">
            {lineMetrics.map((line) => {
              const availableSubs = getAvailableSubCategories(line.line);
              const safePercent = Math.max(line.percentUsed, 0);
              const percentValue = Math.min(safePercent * 100, 999);
              const progressWidth = Math.min(safePercent, 1) * 100;
              return (
                <article
                  key={line.line.id}
                  className={`budget-line budget-status--${line.status}`}
                >
                  <div className="budget-line__header">
                    <button
                      type="button"
                      className="budget-line__name"
                      onClick={() => handleDrilldown(line)}
                    >
                      {line.category?.name ?? 'Category'}
                    </button>
                    <span className="budget-line__status">{STATUS_LABELS[line.status]}</span>
                  </div>
                  <div className="budget-line__meta">
                    <span>{FLOW_LABELS[line.flow]}</span>
                    <label className="budget-line__toggle">
                      <input
                        type="checkbox"
                        checked={line.line.mode === 'breakdown'}
                        onChange={(event) => handleModeToggle(line, event.target.checked)}
                      />
                      Breakdown by sub-category
                    </label>
                  </div>
                  <div className="budget-line__metrics">
                    <label className="budget-line__plan">
                      <span>Planned</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.storedPlan}
                        onChange={(event) => handlePlanChange(line, event.target.value)}
                      />
                    </label>
                    {form.rolloverEnabled && line.rolloverIn !== 0 ? (
                      <div className="budget-line__rollover">
                        <span>Rollover applied</span>
                        <strong>{formatDifference(line.rolloverIn)}</strong>
                      </div>
                    ) : null}
                    <div className="budget-line__figure">
                      <span>Effective plan</span>
                      <strong>{formatCurrency(line.effectivePlan, baseCurrency)}</strong>
                    </div>
                    <div className="budget-line__figure">
                      <span>Actual</span>
                      <strong>{formatCurrency(line.actual, baseCurrency)}</strong>
                    </div>
                    <div className="budget-line__figure">
                      <span>Difference</span>
                      <strong>{formatDifference(line.difference)}</strong>
                    </div>
                  </div>
                  <div className="budget-line__progress">
                    <div className={`budget-progress budget-progress--${line.status}`}>
                      <div
                        className="budget-progress__value"
                        style={{ width: `${progressWidth}%` }}
                      />
                    </div>
                    <span>{formatPercentage(percentValue, 1)}</span>
                  </div>
                  <div className="budget-line__actions">
                    <button
                      type="button"
                      className="chip-button danger"
                      onClick={() => handleRemoveLine(line)}
                    >
                      Remove line
                    </button>
                  </div>
                  {line.line.mode === 'breakdown' ? (
                    <div className="budget-sublines">
                      <div className="budget-sublines__add">
                        <select
                          value={subLineSelections[line.line.id] ?? ''}
                          onChange={(event) =>
                            setSubLineSelections((current) => ({
                              ...current,
                              [line.line.id]: event.target.value
                            }))
                          }
                        >
                          <option value="">Select sub-category</option>
                          {availableSubs.map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="chip-button"
                          onClick={() => handleAddSubLine(line)}
                          disabled={!(subLineSelections[line.line.id] ?? '')}
                        >
                          Add sub-line
                        </button>
                      </div>
                      {line.subLines.length === 0 ? (
                        <p className="muted-text">
                          Add sub-categories to plan detailed amounts for this category.
                        </p>
                      ) : (
                        line.subLines.map((subLine) => {
                          const subSafePercent = Math.max(subLine.percentUsed, 0);
                          const subPercent = Math.min(subSafePercent * 100, 999);
                          const subWidth = Math.min(subSafePercent, 1) * 100;
                          return (
                            <div
                              key={subLine.subLine.id}
                              className={`budget-subline budget-status--${subLine.status}`}
                            >
                              <div className="budget-subline__header">
                                <button
                                  type="button"
                                  className="budget-line__name"
                                  onClick={() => handleDrilldown(line, subLine)}
                                >
                                  {subLine.subCategory?.name ?? 'Sub-category'}
                                </button>
                                <span>{STATUS_LABELS[subLine.status]}</span>
                              </div>
                              <div className="budget-subline__metrics">
                                <label className="budget-line__plan">
                                  <span>Planned</span>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={subLine.storedPlan}
                                    onChange={(event) =>
                                      handleSubLinePlanChange(subLine, event.target.value)
                                    }
                                  />
                                </label>
                                {form.rolloverEnabled && subLine.rolloverIn !== 0 ? (
                                  <div className="budget-line__rollover">
                                    <span>Rollover</span>
                                    <strong>{formatDifference(subLine.rolloverIn)}</strong>
                                  </div>
                                ) : null}
                                <div className="budget-line__figure">
                                  <span>Effective</span>
                                  <strong>{formatCurrency(subLine.effectivePlan, baseCurrency)}</strong>
                                </div>
                                <div className="budget-line__figure">
                                  <span>Actual</span>
                                  <strong>{formatCurrency(subLine.actual, baseCurrency)}</strong>
                                </div>
                                <div className="budget-line__figure">
                                  <span>Difference</span>
                                  <strong>{formatDifference(subLine.difference)}</strong>
                                </div>
                              </div>
                              <div className="budget-line__progress">
                                <div className={`budget-progress budget-progress--${subLine.status}`}>
                                  <div
                                    className="budget-progress__value"
                                    style={{ width: `${subWidth}%` }}
                                  />
                                </div>
                                <span>{formatPercentage(subPercent, 1)}</span>
                              </div>
                              <div className="budget-line__actions">
                                <button
                                  type="button"
                                  className="chip-button danger"
                                  onClick={() => removeBudgetSubLine(line.line.id, subLine.subLine.id)}
                                >
                                  Remove sub-line
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

const Budgets = () => {
  const {
    state,
    createBudget,
    updateBudget,
    setPrimaryBudget,
    duplicateBudget,
    archiveBudget,
    restoreBudget,
    deleteBudget
  } = useData();
  const budgets = state.budgets;
  const activeBudgets = budgets.filter((budget) => !budget.archived);
  const archivedBudgets = budgets.filter((budget) => budget.archived);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(
    () => activeBudgets[0]?.id ?? archivedBudgets[0]?.id ?? null
  );
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const payload = (location.state as { budgetId?: string } | null)?.budgetId;
    if (payload) {
      setSelectedBudgetId(payload);
      navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (!selectedBudgetId) {
      const fallback = activeBudgets[0]?.id ?? archivedBudgets[0]?.id ?? null;
      setSelectedBudgetId(fallback);
      return;
    }
    const exists = budgets.some((budget) => budget.id === selectedBudgetId);
    if (!exists) {
      const fallback = activeBudgets[0]?.id ?? archivedBudgets[0]?.id ?? null;
      setSelectedBudgetId(fallback);
    }
  }, [activeBudgets, archivedBudgets, budgets, selectedBudgetId]);

  const selectedBudget = budgets.find((budget) => budget.id === selectedBudgetId) ?? null;

  const handleCreateBudget = () => {
    const budget = createBudget();
    setSelectedBudgetId(budget.id);
  };

  const handleRename = (budget: Budget) => {
    const nextName = window.prompt('Rename budget', budget.name);
    if (nextName && nextName.trim()) {
      const result = updateBudget(budget.id, { name: nextName.trim() });
      if (result) {
        window.alert(`${result.title}: ${result.description}`);
      }
    }
  };

  const handleArchive = (budget: Budget) => {
    if (budget.archived) return;
    const confirmed = window.confirm(
      `Archive ${budget.name}? It will be hidden from active lists but kept for history.`
    );
    if (confirmed) {
      archiveBudget(budget.id);
    }
  };

  const handleDelete = (budget: Budget) => {
    const confirmed = window.confirm(
      `Delete ${budget.name}? This removes the budget permanently and cannot be undone.`
    );
    if (confirmed) {
      deleteBudget(budget.id);
      if (selectedBudgetId === budget.id) {
        setSelectedBudgetId(null);
      }
    }
  };

  const handleDuplicate = (budget: Budget) => {
    const duplicate = duplicateBudget(budget.id);
    if (duplicate) {
      setSelectedBudgetId(duplicate.id);
    }
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Budgets"
        description="Define planned spending or income levels by period and keep track of the active cycle."
      />
      <div className="budgets-layout">
        <div className="content-card budgets-list-card">
          <div className="budgets-list-header">
            <h3>Budgets</h3>
            <button type="button" className="primary-button" onClick={handleCreateBudget}>
              New budget
            </button>
          </div>
          {budgets.length === 0 ? (
            <p className="muted-text">
              Create your first budget to start planning by month, week, year, or UK fiscal year.
            </p>
          ) : (
            <div className="budget-list">
              {activeBudgets.map((budget) => (
                <BudgetListItem
                  key={budget.id}
                  budget={budget}
                  isSelected={budget.id === selectedBudgetId}
                  onSelect={() => setSelectedBudgetId(budget.id)}
                  onRename={() => handleRename(budget)}
                  onDuplicate={() => handleDuplicate(budget)}
                  onArchive={() => handleArchive(budget)}
                  onRestore={() => restoreBudget(budget.id)}
                  onDelete={() => handleDelete(budget)}
                  onSetPrimary={() => setPrimaryBudget(budget.id)}
                />
              ))}
              {archivedBudgets.length > 0 ? (
                <details className="archived-section">
                  <summary>Archived budgets ({archivedBudgets.length})</summary>
                  <div className="archived-list">
                    {archivedBudgets.map((budget) => (
                      <BudgetListItem
                        key={budget.id}
                        budget={budget}
                        isSelected={budget.id === selectedBudgetId}
                        onSelect={() => setSelectedBudgetId(budget.id)}
                        onRename={() => handleRename(budget)}
                        onDuplicate={() => handleDuplicate(budget)}
                        onArchive={() => handleArchive(budget)}
                        onRestore={() => restoreBudget(budget.id)}
                        onDelete={() => handleDelete(budget)}
                        onSetPrimary={() => setPrimaryBudget(budget.id)}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </div>
        <div className="content-card budget-editor-card">
          {selectedBudget ? (
            <BudgetEditor
              budget={selectedBudget}
              collections={state.accountCollections}
              onClose={() => setSelectedBudgetId(null)}
            />
          ) : (
            <div className="budget-editor-placeholder">
              <h3>Select a budget</h3>
              <p className="muted-text">
                Choose a budget from the list to edit its period and included collections.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Budgets;

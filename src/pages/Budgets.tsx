import { FormEvent, useEffect, useMemo, useState } from 'react';
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

type BudgetFormState = {
  name: string;
  periodType: Budget['periodType'];
  startMonth?: number;
  startYear?: number;
  startDayOfWeek?: number;
  includeMode: Budget['includeMode'];
  collectionIds: string[];
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
};

const BudgetListItem = ({
  budget,
  isSelected,
  onSelect,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete
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
        {budget.archived ? <span className="budget-badge archived">Archived</span> : null}
      </div>
      <div className="budget-card__actions">
        <button type="button" className="chip-button" onClick={onRename}>
          Rename
        </button>
        <button type="button" className="chip-button" onClick={onDuplicate}>
          Duplicate
        </button>
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
  const { updateBudget } = useData();
  const [form, setForm] = useState<BudgetFormState>(() => ({
    name: budget.name,
    periodType: budget.periodType,
    startMonth: budget.startMonth,
    startYear: budget.startYear,
    startDayOfWeek: budget.startDayOfWeek ?? 1,
    includeMode: budget.includeMode,
    collectionIds: budget.collectionIds
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
      collectionIds: budget.collectionIds
    });
    setPeriodOffset(0);
    setError(null);
  }, [budget]);

  const previewBudget = useMemo(
    () =>
      applyBudgetPeriodDraft(budget, {
        periodType: form.periodType,
        startMonth: form.periodType === 'monthly' ? form.startMonth : undefined,
        startYear:
          form.periodType === 'monthly' ||
          form.periodType === 'annual' ||
          form.periodType === 'uk-fiscal'
            ? form.startYear
            : undefined,
        startDayOfWeek: form.periodType === 'weekly' ? form.startDayOfWeek : undefined
      }),
    [budget, form]
  );

  const currentPeriod = useMemo(
    () => getBudgetPeriodInfo(previewBudget, periodOffset),
    [previewBudget, periodOffset]
  );

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
        form.includeMode === 'collections' ? Array.from(new Set(form.collectionIds)) : []
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

  return (
    <div className="budget-editor">
      <header className="budget-editor__header">
        <h3>Edit budget</h3>
        <p className="muted-text">
          Update the period cadence, start point, and which accounts feed this budget.
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
        <div className="field">
          <span>Active period preview</span>
          <div className="period-preview">
            <div>
              <strong>{currentPeriod.label}</strong>
              <p className="muted-text">{formatBudgetPeriodRange(currentPeriod)}</p>
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
    </div>
  );
};

const Budgets = () => {
  const {
    state,
    createBudget,
    updateBudget,
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

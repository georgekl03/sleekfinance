import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import {
  AllocationCondition,
  AllocationRule,
  AllocationRulePurpose,
  AllocationRuleBase,
  AllocationPurposeTargetType,
  Account,
  AccountCollection,
  Category,
  Payee,
  SubCategory,
  TransactionAllocation
} from '../data/models';
import {
  AllocationRunFilters,
  AllocationRunPreview,
  useData
} from '../data/DataContext';
import { formatCurrency, formatPercentage } from '../utils/format';
import { generateId } from '../utils/id';
import { formatAllocationNativeSummary } from '../utils/allocations';
import '../styles/allocations.css';

const PURPOSE_TARGET_LABELS: Record<AllocationPurposeTargetType, string> = {
  account: 'Account',
  collection: 'Collection',
  label: 'Virtual bucket'
};

type AllocationFilterFormState = {
  categoryIds: string[];
  subCategoryIds: string[];
  payeeIds: string[];
  accountIds: string[];
  providerNames: string[];
  tagIds: string[];
};

type RetroFiltersState = AllocationRunFilters & {
  startDate: string;
  endDate: string;
};

const createEmptyFilterState = (): AllocationFilterFormState => ({
  categoryIds: [],
  subCategoryIds: [],
  payeeIds: [],
  accountIds: [],
  providerNames: [],
  tagIds: []
});

const cloneBase = (base: AllocationRuleBase): AllocationRuleBase => {
  switch (base.type) {
    case 'categories':
      return { type: 'categories', categoryIds: [...base.categoryIds] };
    case 'sub-categories':
      return { type: 'sub-categories', subCategoryIds: [...base.subCategoryIds] };
    case 'payees':
      return { type: 'payees', payeeIds: [...base.payeeIds] };
    case 'accounts':
      return { type: 'accounts', accountIds: [...base.accountIds] };
    case 'providers':
      return { type: 'providers', providerNames: [...base.providerNames] };
    case 'all-income':
    default:
      return { type: 'all-income', description: base.description ?? null };
  }
};

const cloneRule = (rule: AllocationRule): AllocationRule => ({
  ...rule,
  base: cloneBase(rule.base),
  filters: rule.filters.map((filter) => ({ ...filter } as AllocationCondition)),
  purposes: rule.purposes.map((purpose) => ({ ...purpose }))
});

const buildFilterStateFromRule = (
  rule: AllocationRule,
  payees: Payee[]
): AllocationFilterFormState => {
  const payeeByName = new Map(
    payees.map((payee) => [payee.name.toLocaleLowerCase(), payee.id])
  );
  const state = createEmptyFilterState();
  rule.filters.forEach((filter) => {
    switch (filter.type) {
      case 'category':
        if (filter.subCategoryId) {
          state.subCategoryIds.push(filter.subCategoryId);
        } else if (filter.categoryId) {
          state.categoryIds.push(filter.categoryId);
        }
        break;
      case 'payee':
        if (filter.operator === 'equals' && filter.value) {
          const id = payeeByName.get(filter.value.toLocaleLowerCase());
          if (id) {
            state.payeeIds.push(id);
          }
        }
        break;
      case 'account':
        state.accountIds.push(...filter.accountIds);
        break;
      case 'provider':
        state.providerNames.push(...filter.providers);
        break;
      case 'tag':
        state.tagIds.push(filter.tagId);
        break;
      default:
        break;
    }
  });
  return state;
};

const describeBase = (
  rule: AllocationRule,
  categories: Map<string, Category>,
  subCategories: Map<string, SubCategory>,
  payees: Map<string, Payee>,
  accounts: Map<string, Account>
) => {
  switch (rule.base.type) {
    case 'all-income':
      return 'All income transactions';
    case 'categories':
      if (!rule.base.categoryIds.length) return 'Income categories (not set)';
      return `Categories: ${rule.base.categoryIds
        .map((id) => categories.get(id)?.name ?? 'Unknown')
        .join(', ')}`;
    case 'sub-categories':
      if (!rule.base.subCategoryIds.length) return 'Sub-categories (not set)';
      return `Sub-categories: ${rule.base.subCategoryIds
        .map((id) => subCategories.get(id)?.name ?? 'Unknown')
        .join(', ')}`;
    case 'payees':
      if (!rule.base.payeeIds.length) return 'Payees (not set)';
      return `Payees: ${rule.base.payeeIds
        .map((id) => payees.get(id)?.name ?? 'Unknown')
        .join(', ')}`;
    case 'accounts':
      if (!rule.base.accountIds.length) return 'Accounts (not set)';
      return `Accounts: ${rule.base.accountIds
        .map((id) => accounts.get(id)?.name ?? 'Unknown account')
        .join(', ')}`;
    case 'providers':
      if (!rule.base.providerNames.length) return 'Providers (not set)';
      return `Providers: ${rule.base.providerNames.join(', ')}`;
    default:
      return 'Scope not configured';
  }
};

const describeFilters = (
  rule: AllocationRule,
  categories: Map<string, Category>,
  subCategories: Map<string, SubCategory>,
  payees: Map<string, Payee>,
  accounts: Map<string, Account>,
  tags: Map<string, string>
) => {
  if (!rule.filters.length) {
    return 'No additional filters';
  }
  const parts: string[] = [];
  rule.filters.forEach((filter) => {
    switch (filter.type) {
      case 'category':
        if (filter.subCategoryId) {
          const sub = subCategories.get(filter.subCategoryId)?.name ?? 'Unknown sub-category';
          parts.push(`Sub-category is ${sub}`);
        } else if (filter.categoryId) {
          const category = categories.get(filter.categoryId)?.name ?? 'Unknown category';
          parts.push(`Category is ${category}`);
        }
        break;
      case 'payee':
        if (filter.operator === 'equals') {
          parts.push(`Payee equals ${filter.value}`);
        } else {
          parts.push(`Payee contains "${filter.value}"`);
        }
        break;
      case 'account':
        parts.push(
          `Accounts: ${filter.accountIds
            .map((id) => accounts.get(id)?.name ?? 'Unknown account')
            .join(', ')}`
        );
        break;
      case 'provider':
        parts.push(`Providers: ${filter.providers.join(', ')}`);
        break;
      case 'tag':
        parts.push(`Tag is ${tags.get(filter.tagId) ?? 'Unknown tag'}`);
        break;
      default:
        break;
    }
  });
  return parts.join('; ');
};

const describeSplits = (rule: AllocationRule) =>
  rule.purposes
    .map((purpose) => `${formatPercentage(purpose.percentage, 1)} ${purpose.name}`)
    .join(', ');

const buildNativeTotals = (
  allocations: TransactionAllocation[],
  baseCurrency: string
): { totals: Record<string, number>; baseTotal: number } => {
  const totalsByCurrency: Record<string, number> = {};
  let baseTotal = 0;
  allocations.forEach((allocation) => {
    totalsByCurrency[allocation.nativeCurrency] =
      (totalsByCurrency[allocation.nativeCurrency] ?? 0) + allocation.nativeAmount;
    baseTotal += allocation.baseAmount;
  });
  return { totals: totalsByCurrency, baseTotal };
};

const sumPercentages = (purposes: AllocationRulePurpose[]) =>
  purposes.reduce((sum, purpose) => sum + Number(purpose.percentage || 0), 0);

const DEFAULT_RETRO_FILTERS: RetroFiltersState = {
  startDate: '',
  endDate: '',
  accountIds: [],
  collectionIds: []
};
const convertFiltersToConditions = (
  form: AllocationFilterFormState,
  categories: Map<string, Category>,
  subCategories: Map<string, SubCategory>,
  payees: Map<string, Payee>,
  tags: Map<string, string>
): AllocationCondition[] => {
  const conditions: AllocationCondition[] = [];
  const seen = new Set<string>();

  form.categoryIds.forEach((categoryId) => {
    if (!categoryId || seen.has(`category:${categoryId}`)) return;
    conditions.push({
      id: generateId('alloc-cond'),
      type: 'category',
      categoryId,
      subCategoryId: null
    });
    seen.add(`category:${categoryId}`);
  });

  form.subCategoryIds.forEach((subCategoryId) => {
    if (!subCategoryId || seen.has(`sub:${subCategoryId}`)) return;
    const sub = subCategories.get(subCategoryId);
    const categoryId = sub?.categoryId ?? '';
    conditions.push({
      id: generateId('alloc-cond'),
      type: 'category',
      categoryId,
      subCategoryId
    });
    seen.add(`sub:${subCategoryId}`);
  });

  form.payeeIds.forEach((payeeId) => {
    const payee = payees.get(payeeId);
    if (!payee) return;
    conditions.push({
      id: generateId('alloc-cond'),
      type: 'payee',
      operator: 'equals',
      value: payee.name
    });
  });

  if (form.accountIds.length) {
    conditions.push({
      id: generateId('alloc-cond'),
      type: 'account',
      accountIds: Array.from(new Set(form.accountIds))
    });
  }

  if (form.providerNames.length) {
    conditions.push({
      id: generateId('alloc-cond'),
      type: 'provider',
      providers: Array.from(new Set(form.providerNames))
    });
  }

  form.tagIds.forEach((tagId) => {
    if (!tags.has(tagId)) return;
    conditions.push({
      id: generateId('alloc-cond'),
      type: 'tag',
      tagId
    });
  });

  return conditions;
};

const filterAllocations = (
  allocations: TransactionAllocation[],
  transactionsById: Map<string, { accountId: string; date: string }>,
  accountsById: Map<string, Account>,
  filters: RetroFiltersState
) => {
  const startTime = filters.startDate ? new Date(filters.startDate).getTime() : Number.NaN;
  const endTime = filters.endDate ? new Date(filters.endDate).getTime() : Number.NaN;
  const hasStart = !Number.isNaN(startTime);
  const hasEnd = !Number.isNaN(endTime);
  const accountFilter = new Set(filters.accountIds ?? []);
  const collectionFilter = new Set(filters.collectionIds ?? []);
  const filterByAccount = accountFilter.size > 0;
  const filterByCollection = collectionFilter.size > 0;

  const accountMatchesCollection = (accountId: string) => {
    if (!filterByCollection) return true;
    const account = accountsById.get(accountId);
    if (!account) return false;
    return account.collectionIds.some((collectionId) => collectionFilter.has(collectionId));
  };

  return allocations.filter((allocation) => {
    const transaction = transactionsById.get(allocation.transactionId);
    if (!transaction) return false;
    if (filterByAccount && !accountFilter.has(transaction.accountId)) {
      return false;
    }
    if (!accountMatchesCollection(transaction.accountId)) {
      return false;
    }
    const timestamp = new Date(transaction.date).getTime();
    if (Number.isNaN(timestamp)) {
      return false;
    }
    if (hasStart && timestamp < startTime) {
      return false;
    }
    if (hasEnd && timestamp > endTime) {
      return false;
    }
    return true;
  });
};
const Allocations = () => {
  const {
    state,
    createAllocationRule,
    saveAllocationRule,
    duplicateAllocationRule,
    renameAllocationRule,
    setAllocationRuleEnabled,
    setAllocationRulePriority,
    archiveAllocationRule,
    restoreAllocationRule,
    clearAllocationsForRule,
    previewAllocationRun,
    applyAllocationRun
  } = useData();

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [draftRule, setDraftRule] = useState<AllocationRule | null>(null);
  const [filterForm, setFilterForm] = useState<AllocationFilterFormState>(createEmptyFilterState);
  const [retroFilters, setRetroFilters] = useState<RetroFiltersState>(DEFAULT_RETRO_FILTERS);
  const [preview, setPreview] = useState<AllocationRunPreview | null>(null);

  const baseCurrency = state.settings.baseCurrency;

  const categoriesById = useMemo(
    () => new Map(state.categories.map((category) => [category.id, category])),
    [state.categories]
  );
  const subCategoriesById = useMemo(
    () => new Map(state.subCategories.map((sub) => [sub.id, sub])),
    [state.subCategories]
  );
  const payeesById = useMemo(
    () => new Map(state.payees.map((payee) => [payee.id, payee])),
    [state.payees]
  );
  const accountsById = useMemo(
    () => new Map(state.accounts.map((account) => [account.id, account])),
    [state.accounts]
  );
  const tagsById = useMemo(
    () => new Map(state.tags.map((tag) => [tag.id, tag.name])),
    [state.tags]
  );

  const sortedRules = useMemo(() => {
    const active = state.allocationRules.filter((rule) => !rule.archived);
    const archived = state.allocationRules.filter((rule) => rule.archived);
    const sortByPriority = (rules: AllocationRule[]) =>
      [...rules].sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.name.localeCompare(b.name);
      });
    return [...sortByPriority(active), ...sortByPriority(archived)];
  }, [state.allocationRules]);

  const transactionsById = useMemo(
    () =>
      new Map(
        state.transactions.map((transaction) => [transaction.id, {
          accountId: transaction.accountId,
          date: transaction.date
        }])
      ),
    [state.transactions]
  );

  useEffect(() => {
    if (!selectedRuleId) {
      setDraftRule(null);
      setFilterForm(createEmptyFilterState());
      setPreview(null);
      return;
    }
    const rule = state.allocationRules.find((entry) => entry.id === selectedRuleId);
    if (!rule) {
      setDraftRule(null);
      setFilterForm(createEmptyFilterState());
      setPreview(null);
      return;
    }
    setDraftRule(cloneRule(rule));
    setFilterForm(buildFilterStateFromRule(rule, state.payees));
    setPreview(null);
  }, [selectedRuleId, state.allocationRules, state.payees]);
  const handleRuleSelect = (rule: AllocationRule) => {
    setSelectedRuleId(rule.id);
  };

  const handleCreateRule = () => {
    const created = createAllocationRule();
    setSelectedRuleId(created.id);
  };

  const handleDuplicateRule = (id: string) => {
    const duplicate = duplicateAllocationRule(id);
    if (duplicate) {
      setSelectedRuleId(duplicate.id);
    }
  };

  const handleRenameRule = (id: string) => {
    const rule = state.allocationRules.find((entry) => entry.id === id);
    if (!rule) return;
    const nextName = window.prompt('Rename allocation rule', rule.name);
    if (nextName && nextName.trim()) {
      renameAllocationRule(id, nextName.trim());
    }
  };

  const handleSaveRule = (event: FormEvent) => {
    event.preventDefault();
    if (!draftRule) return;
    const tolerance = Number.isFinite(draftRule.tolerance)
      ? Math.max(Number(draftRule.tolerance), 0)
      : 0.5;
    const totalPercentage = sumPercentages(draftRule.purposes);
    if (Math.abs(totalPercentage - 100) > tolerance + 0.0001) {
      window.alert('Allocation percentages must add up to 100% within the configured tolerance.');
      return;
    }
    const filters = convertFiltersToConditions(
      filterForm,
      categoriesById,
      subCategoriesById,
      payeesById,
      tagsById
    );
    const nextRule: AllocationRule = {
      ...draftRule,
      filters,
      tolerance
    };
    saveAllocationRule(nextRule);
    setPreview(null);
  };

  const handleAddPurpose = () => {
    if (!draftRule) return;
    const nextPurposes: AllocationRulePurpose[] = [
      ...draftRule.purposes,
      {
        id: generateId('allocp'),
        name: 'New purpose',
        percentage: 0,
        targetType: 'label',
        targetId: null,
        targetLabel: 'Untitled'
      }
    ];
    setDraftRule({ ...draftRule, purposes: nextPurposes });
  };

  const handlePurposeChange = (
    index: number,
    field: 'name' | 'percentage' | 'targetType' | 'targetLabel',
    value: string
  ) => {
    if (!draftRule) return;
    const purposes = draftRule.purposes.map((purpose, idx): AllocationRulePurpose => {
      if (idx !== index) {
        return purpose;
      }
      const updated: AllocationRulePurpose = { ...purpose };
      if (field === 'percentage') {
        const numeric = Number.parseFloat(value);
        updated.percentage = Number.isFinite(numeric) ? numeric : 0;
      } else if (field === 'name') {
        updated.name = value;
      } else if (field === 'targetType') {
        const nextType = value as AllocationPurposeTargetType;
        updated.targetType = nextType;
        updated.targetId = nextType === 'label' ? null : updated.targetId ?? null;
        updated.targetLabel = nextType === 'label' ? updated.targetLabel ?? 'Untitled' : null;
      } else if (field === 'targetLabel') {
        updated.targetLabel = value;
      }
      return updated;
    });
    setDraftRule({ ...draftRule, purposes });
  };

  const handlePurposeTargetSelect = (
    index: number,
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const value = event.target.value;
    setDraftRule((current) => {
      if (!current) return current;
      const purposes = current.purposes.map((purpose, idx) =>
        idx === index ? { ...purpose, targetId: value || null } : purpose
      );
      return { ...current, purposes };
    });
  };

  const handleRemovePurpose = (index: number) => {
    setDraftRule((current) => {
      if (!current) return current;
      if (current.purposes.length <= 1) return current;
      const purposes = current.purposes.filter((_, idx) => idx !== index);
      return { ...current, purposes };
    });
  };

  const handleBaseChange = (value: string) => {
    setDraftRule((current) => {
      if (!current) return current;
      let nextBase: AllocationRuleBase;
      switch (value) {
        case 'categories':
          nextBase = { type: 'categories', categoryIds: [] };
          break;
        case 'sub-categories':
          nextBase = { type: 'sub-categories', subCategoryIds: [] };
          break;
        case 'payees':
          nextBase = { type: 'payees', payeeIds: [] };
          break;
        case 'accounts':
          nextBase = { type: 'accounts', accountIds: [] };
          break;
        case 'providers':
          nextBase = { type: 'providers', providerNames: [] };
          break;
        default:
          nextBase = { type: 'all-income', description: null };
          break;
      }
      return { ...current, base: nextBase };
    });
  };

  const handleBaseSelectionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setDraftRule((current) => {
      if (!current) return current;
      const base = current.base;
      switch (base.type) {
        case 'categories':
          return { ...current, base: { ...base, categoryIds: values } };
        case 'sub-categories':
          return { ...current, base: { ...base, subCategoryIds: values } };
        case 'payees':
          return { ...current, base: { ...base, payeeIds: values } };
        case 'accounts':
          return { ...current, base: { ...base, accountIds: values } };
        case 'providers':
          return { ...current, base: { ...base, providerNames: values } };
        default:
          return current;
      }
    });
  };

  const handleFilterSelectChange = (
    key: keyof AllocationFilterFormState,
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setFilterForm((current) => ({ ...current, [key]: values }));
  };

  const handleRetroSelectChange = (
    key: keyof AllocationRunFilters,
    event: ChangeEvent<HTMLSelectElement>
  ) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setRetroFilters((current) => ({ ...current, [key]: values }));
  };

  const handlePreviewRun = () => {
    if (!draftRule) return;
    const filters: AllocationRunFilters = {
      startDate: retroFilters.startDate || undefined,
      endDate: retroFilters.endDate || undefined,
      accountIds: retroFilters.accountIds,
      collectionIds: retroFilters.collectionIds
    };
    const result = previewAllocationRun(draftRule.id, filters);
    setPreview(result);
  };

  const handleApplyRun = () => {
    if (!draftRule) return;
    const filters: AllocationRunFilters = {
      startDate: retroFilters.startDate || undefined,
      endDate: retroFilters.endDate || undefined,
      accountIds: retroFilters.accountIds,
      collectionIds: retroFilters.collectionIds
    };
    const result = applyAllocationRun(draftRule.id, filters);
    setPreview(result);
  };

  const totalPercentage = draftRule ? sumPercentages(draftRule.purposes) : 0;
  const tolerance = draftRule ? Math.max(Number(draftRule.tolerance) || 0, 0) : 0.5;
  const withinTolerance = Math.abs(totalPercentage - 100) <= tolerance + 0.0001;
  const allocationSummary = useMemo(() => {
    const rulesById = new Map(state.allocationRules.map((rule) => [rule.id, rule]));
    const purposesByRule = new Map<string, AllocationRulePurpose>();
    state.allocationRules.forEach((rule) => {
      rule.purposes.forEach((purpose) => {
        purposesByRule.set(`${rule.id}:${purpose.id}`, purpose);
      });
    });
    const filtered = filterAllocations(
      state.transactionAllocations,
      transactionsById,
      accountsById,
      retroFilters
    );
    const totals = new Map<
      string,
      {
        ruleId: string;
        purposeId: string;
        purposeName: string;
        ruleName: string;
        baseAmount: number;
        nativeAmounts: Record<string, number>;
      }
    >();
    filtered.forEach((allocation) => {
      const key = `${allocation.ruleId}:${allocation.purposeId}`;
      const entry = totals.get(key);
      const purpose = purposesByRule.get(key);
      const rule = rulesById.get(allocation.ruleId);
      if (!purpose || !rule) return;
      if (entry) {
        entry.baseAmount += allocation.baseAmount;
        entry.nativeAmounts[allocation.nativeCurrency] =
          (entry.nativeAmounts[allocation.nativeCurrency] ?? 0) + allocation.nativeAmount;
      } else {
        totals.set(key, {
          ruleId: allocation.ruleId,
          purposeId: allocation.purposeId,
          purposeName: purpose.name,
          ruleName: rule.name,
          baseAmount: allocation.baseAmount,
          nativeAmounts: {
            [allocation.nativeCurrency]: allocation.nativeAmount
          }
        });
      }
    });
    const totalBase = Array.from(totals.values()).reduce(
      (sum, item) => sum + item.baseAmount,
      0
    );
    const purposes = Array.from(totals.values()).sort((a, b) => b.baseAmount - a.baseAmount);
    return { totalBase, purposes };
  }, [
    state.allocationRules,
    state.transactionAllocations,
    accountsById,
    transactionsById,
    retroFilters
  ]);

  const timeRangeLabel = retroFilters.startDate || retroFilters.endDate
    ? `${retroFilters.startDate || 'Start'} → ${retroFilters.endDate || 'Now'}`
    : 'Entire history';
  return (
    <div className="allocations-page">
      <PageHeader
        title="Income Allocation Rules"
        description="Define how incoming money is analytically distributed across purposes and monitor allocation performance over time."
        tooltip="Allocation rules create virtual splits for inflows without affecting account balances."
      />
      <section className="allocations-intro">
        <p>
          Rules execute in ascending priority order. The first enabled rule that matches a
          transaction applies unless a later rule is configured to overwrite allocations. Use
          priorities and overwrite mode to manage precedence between overlapping rules.
        </p>
      </section>
      <div className="allocations-layout">
        <section className="allocations-panel">
          <header className="allocations-panel__header">
            <h3>Rule library</h3>
            <div className="allocations-panel__actions">
              <button type="button" className="primary" onClick={handleCreateRule}>
                New allocation rule
              </button>
            </div>
          </header>
          <div className="allocations-rule-list">
            {sortedRules.map((rule) => {
              const baseDescription = describeBase(
                rule,
                categoriesById,
                subCategoriesById,
                payeesById,
                accountsById
              );
              const filterDescription = describeFilters(
                rule,
                categoriesById,
                subCategoriesById,
                payeesById,
                accountsById,
                tagsById
              );
              const splitDescription = describeSplits(rule);
              const isSelected = selectedRuleId === rule.id;
              return (
                <article
                  key={rule.id}
                  className={`allocations-rule-card${isSelected ? ' is-selected' : ''}${
                    rule.archived ? ' is-archived' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="allocations-rule-card__select"
                    onClick={() => handleRuleSelect(rule)}
                  >
                    <header className="allocations-rule-card__header">
                      <h4>{rule.name}</h4>
                      {rule.archived ? <span className="badge">Archived</span> : null}
                      {!rule.enabled ? <span className="badge muted">Disabled</span> : null}
                    </header>
                    <p className="allocations-rule-card__meta">{baseDescription}</p>
                    <p className="allocations-rule-card__meta">{filterDescription}</p>
                    <p className="allocations-rule-card__meta">{splitDescription}</p>
                  </button>
                  <footer className="allocations-rule-card__footer">
                    <div className="allocations-rule-card__priority">
                      <label>
                        Priority
                        <input
                          type="number"
                          value={rule.priority}
                          onChange={(event) =>
                            setAllocationRulePriority(
                              rule.id,
                              Number.parseInt(event.target.value, 10) || 0
                            )
                          }
                        />
                      </label>
                      <span className="muted-text">
                        {rule.allowOverwrite
                          ? 'Overwrites previous allocations'
                          : 'Stops after first match'}
                      </span>
                    </div>
                    <div className="allocations-rule-card__actions">
                      <button
                        type="button"
                        className="chip-button"
                        onClick={() => setAllocationRuleEnabled(rule.id, !rule.enabled)}
                      >
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="chip-button"
                        onClick={() => handleDuplicateRule(rule.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="chip-button"
                        onClick={() => handleRenameRule(rule.id)}
                      >
                        Rename
                      </button>
                      {rule.archived ? (
                        <button
                          type="button"
                          className="chip-button"
                          onClick={() => restoreAllocationRule(rule.id)}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="chip-button danger"
                          onClick={() => archiveAllocationRule(rule.id)}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </footer>
                </article>
              );
            })}
            {sortedRules.length === 0 ? (
              <p className="muted-text">No allocation rules yet. Create one to start analysing income splits.</p>
            ) : null}
          </div>
        </section>
        <section className="allocations-panel">
          <header className="allocations-panel__header">
            <h3>Rule editor</h3>
            <Tooltip label="Configure base scope, filters, and allocation splits for the selected rule." />
          </header>
          {draftRule ? (
            <form className="allocation-editor" onSubmit={handleSaveRule}>
              <div className="field">
                <label htmlFor="allocation-name">Rule name</label>
                <input
                  id="allocation-name"
                  value={draftRule.name}
                  onChange={(event) =>
                    setDraftRule((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  required
                />
              </div>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="allocation-priority">Priority</label>
                  <input
                    id="allocation-priority"
                    type="number"
                    value={draftRule.priority}
                    onChange={(event) =>
                      setDraftRule((current) =>
                        current
                          ? {
                              ...current,
                              priority: Number.parseInt(event.target.value, 10) || 0
                            }
                          : current
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="allocation-tolerance">
                    Percentage tolerance
                    <Tooltip label="Allow a small tolerance around 100% when validating split percentages." />
                  </label>
                  <input
                    id="allocation-tolerance"
                    type="number"
                    min={0}
                    step={0.1}
                    value={draftRule.tolerance}
                    onChange={(event) =>
                      setDraftRule((current) =>
                        current
                          ? { ...current, tolerance: Number.parseFloat(event.target.value) || 0 }
                          : current
                      )
                    }
                  />
                </div>
              </div>
              <div className="field checkbox-field">
                <label>
                  <input
                    type="checkbox"
                    checked={draftRule.allowOverwrite}
                    onChange={(event) =>
                      setDraftRule((current) =>
                        current ? { ...current, allowOverwrite: event.target.checked } : current
                      )
                    }
                  />
                  Allow this rule to overwrite allocations created by earlier rules
                </label>
              </div>
              <fieldset className="allocation-editor__section">
                <legend>Base scope</legend>
                <div className="field">
                  <label htmlFor="allocation-base">Base type</label>
                  <select
                    id="allocation-base"
                    value={draftRule.base.type}
                    onChange={(event) => handleBaseChange(event.target.value)}
                  >
                    <option value="all-income">All income</option>
                    <option value="categories">Specific income categories</option>
                    <option value="sub-categories">Specific sub-categories</option>
                    <option value="payees">Specific payees</option>
                    <option value="accounts">Specific accounts</option>
                    <option value="providers">Specific providers</option>
                  </select>
                </div>
                {draftRule.base.type === 'categories' ? (
                  <div className="field">
                    <label htmlFor="allocation-base-categories">Categories</label>
                    <select
                      id="allocation-base-categories"
                      multiple
                      value={draftRule.base.categoryIds}
                      onChange={handleBaseSelectionChange}
                    >
                      {state.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {draftRule.base.type === 'sub-categories' ? (
                  <div className="field">
                    <label htmlFor="allocation-base-subs">Sub-categories</label>
                    <select
                      id="allocation-base-subs"
                      multiple
                      value={draftRule.base.subCategoryIds}
                      onChange={handleBaseSelectionChange}
                    >
                      {state.subCategories.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {draftRule.base.type === 'payees' ? (
                  <div className="field">
                    <label htmlFor="allocation-base-payees">Payees</label>
                    <select
                      id="allocation-base-payees"
                      multiple
                      value={draftRule.base.payeeIds}
                      onChange={handleBaseSelectionChange}
                    >
                      {state.payees.map((payee) => (
                        <option key={payee.id} value={payee.id}>
                          {payee.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {draftRule.base.type === 'accounts' ? (
                  <div className="field">
                    <label htmlFor="allocation-base-accounts">Accounts</label>
                    <select
                      id="allocation-base-accounts"
                      multiple
                      value={draftRule.base.accountIds}
                      onChange={handleBaseSelectionChange}
                    >
                      {state.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {draftRule.base.type === 'providers' ? (
                  <div className="field">
                    <label htmlFor="allocation-base-providers">Providers</label>
                    <select
                      id="allocation-base-providers"
                      multiple
                      value={draftRule.base.providerNames}
                      onChange={handleBaseSelectionChange}
                    >
                      {state.providerDirectory.map((provider) => (
                        <option key={provider} value={provider}>
                          {provider}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </fieldset>
              <fieldset className="allocation-editor__section">
                <legend>Additional filters</legend>
                <div className="field">
                  <label htmlFor="allocation-filter-categories">Categories</label>
                  <select
                    id="allocation-filter-categories"
                    multiple
                    value={filterForm.categoryIds}
                    onChange={(event) => handleFilterSelectChange('categoryIds', event)}
                  >
                    {state.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="allocation-filter-subcategories">Sub-categories</label>
                  <select
                    id="allocation-filter-subcategories"
                    multiple
                    value={filterForm.subCategoryIds}
                    onChange={(event) => handleFilterSelectChange('subCategoryIds', event)}
                  >
                    {state.subCategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="allocation-filter-payees">Payees</label>
                  <select
                    id="allocation-filter-payees"
                    multiple
                    value={filterForm.payeeIds}
                    onChange={(event) => handleFilterSelectChange('payeeIds', event)}
                  >
                    {state.payees.map((payee) => (
                      <option key={payee.id} value={payee.id}>
                        {payee.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="allocation-filter-accounts">Accounts</label>
                  <select
                    id="allocation-filter-accounts"
                    multiple
                    value={filterForm.accountIds}
                    onChange={(event) => handleFilterSelectChange('accountIds', event)}
                  >
                    {state.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="allocation-filter-providers">Providers</label>
                  <select
                    id="allocation-filter-providers"
                    multiple
                    value={filterForm.providerNames}
                    onChange={(event) => handleFilterSelectChange('providerNames', event)}
                  >
                    {state.providerDirectory.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="allocation-filter-tags">Tags</label>
                  <select
                    id="allocation-filter-tags"
                    multiple
                    value={filterForm.tagIds}
                    onChange={(event) => handleFilterSelectChange('tagIds', event)}
                  >
                    {state.tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
              <fieldset className="allocation-editor__section">
                <legend>Allocation splits</legend>
                <div className="allocation-splits">
                  <div className="allocation-splits__header">
                    <span>Purpose</span>
                    <span>Percentage</span>
                    <span>Target</span>
                    <span aria-hidden />
                  </div>
                  {draftRule.purposes.map((purpose, index) => (
                    <div key={purpose.id} className="allocation-splits__row">
                      <input
                        value={purpose.name}
                        onChange={(event) => handlePurposeChange(index, 'name', event.target.value)}
                        aria-label="Purpose name"
                      />
                      <input
                        type="number"
                        step={0.1}
                        value={purpose.percentage}
                        onChange={(event) =>
                          handlePurposeChange(index, 'percentage', event.target.value)
                        }
                        aria-label="Purpose percentage"
                      />
                      <div className="allocation-splits__target">
                        <select
                          value={purpose.targetType}
                          onChange={(event) => handlePurposeChange(index, 'targetType', event.target.value)}
                        >
                          <option value="label">Label only</option>
                          <option value="account">Account</option>
                          <option value="collection">Collection</option>
                        </select>
                        {purpose.targetType === 'account' ? (
                          <select
                            value={purpose.targetId ?? ''}
                            onChange={(event) => handlePurposeTargetSelect(index, event)}
                          >
                            <option value="">Select account</option>
                            {state.accounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {purpose.targetType === 'collection' ? (
                          <select
                            value={purpose.targetId ?? ''}
                            onChange={(event) => handlePurposeTargetSelect(index, event)}
                          >
                            <option value="">Select collection</option>
                            {state.accountCollections.map((collection) => (
                              <option key={collection.id} value={collection.id}>
                                {collection.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {purpose.targetType === 'label' ? (
                          <input
                            value={purpose.targetLabel ?? ''}
                            onChange={(event) =>
                              handlePurposeChange(index, 'targetLabel', event.target.value)
                            }
                            placeholder="Label"
                          />
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="chip-button danger"
                        onClick={() => handleRemovePurpose(index)}
                        aria-label="Remove purpose"
                        disabled={draftRule.purposes.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="allocation-editor__splits-footer">
                  <button type="button" className="chip-button" onClick={handleAddPurpose}>
                    Add purpose
                  </button>
                  <span className={`allocation-editor__total${withinTolerance ? '' : ' error'}`}>
                    Total: {formatPercentage(totalPercentage, 2)}
                  </span>
                </div>
                {!withinTolerance ? (
                  <p className="error-text">
                    Adjust the percentages so that the total is within ±{tolerance}% of 100%.
                  </p>
                ) : null}
              </fieldset>
              <fieldset className="allocation-editor__section">
                <legend>Retroactive run</legend>
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="retro-start">Start date</label>
                    <input
                      id="retro-start"
                      type="date"
                      value={retroFilters.startDate}
                      onChange={(event) =>
                        setRetroFilters((current) => ({ ...current, startDate: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="retro-end">End date</label>
                    <input
                      id="retro-end"
                      type="date"
                      value={retroFilters.endDate}
                      onChange={(event) =>
                        setRetroFilters((current) => ({ ...current, endDate: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="retro-accounts">Accounts</label>
                  <select
                    id="retro-accounts"
                    multiple
                    value={retroFilters.accountIds}
                    onChange={(event) => handleRetroSelectChange('accountIds', event)}
                  >
                    {state.accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="retro-collections">Collections</label>
                  <select
                    id="retro-collections"
                    multiple
                    value={retroFilters.collectionIds}
                    onChange={(event) => handleRetroSelectChange('collectionIds', event)}
                  >
                    {state.accountCollections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="allocation-editor__retro-actions">
                  <button type="button" className="chip-button" onClick={handlePreviewRun}>
                    Preview allocations
                  </button>
                  <button type="button" className="chip-button primary" onClick={handleApplyRun}>
                    Apply retroactively
                  </button>
                  <button
                    type="button"
                    className="chip-button danger"
                    onClick={() => clearAllocationsForRule(draftRule.id)}
                  >
                    Clear existing allocations
                  </button>
                </div>
                {preview ? (
                  <div className="allocation-preview">
                    <h4>Preview</h4>
                    <p>
                      {preview.transactionCount} transactions matched • {preview.allocationCount} allocations
                      • {formatCurrency(preview.totalBaseAmount, baseCurrency)} total
                    </p>
                    <div className="allocation-preview__grid">
                      {preview.purposes.map((purpose) => (
                        <div key={`${purpose.ruleId}:${purpose.purposeId}`} className="allocation-preview__item">
                          <h5>{purpose.purposeName}</h5>
                          <p>{formatCurrency(purpose.baseAmount, baseCurrency)}</p>
                          <p className="muted-text">
                            {formatAllocationNativeSummary(purpose.nativeAmounts)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </fieldset>
              <footer className="allocation-editor__footer">
                <button type="submit" className="primary" disabled={!withinTolerance}>
                  Save changes
                </button>
              </footer>
            </form>
          ) : (
            <p className="muted-text">Select an allocation rule to edit its configuration.</p>
          )}
        </section>
      </div>
      <section className="allocations-summary">
        <header className="allocations-summary__header">
          <div>
            <h3>Allocation summary</h3>
            <p className="muted-text">
              {timeRangeLabel} • {allocationSummary.purposes.length} purposes •{' '}
              {formatCurrency(allocationSummary.totalBase, baseCurrency)} total
            </p>
          </div>
          <div className="allocations-summary__filters">
            <label>
              Start date
              <input
                type="date"
                value={retroFilters.startDate}
                onChange={(event) =>
                  setRetroFilters((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={retroFilters.endDate}
                onChange={(event) =>
                  setRetroFilters((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
          </div>
        </header>
        {allocationSummary.purposes.length ? (
          <div className="allocations-summary__grid">
            {allocationSummary.purposes.map((purpose) => {
              const percentage = allocationSummary.totalBase
                ? (purpose.baseAmount / allocationSummary.totalBase) * 100
                : 0;
              return (
                <article
                  key={`${purpose.ruleId}:${purpose.purposeId}`}
                  className="allocations-summary__item"
                >
                  <header>
                    <h4>{purpose.purposeName}</h4>
                    <span className="muted-text">{purpose.ruleName}</span>
                  </header>
                  <div className="allocations-summary__value">
                    <strong>{formatCurrency(purpose.baseAmount, baseCurrency)}</strong>
                    <span>{formatPercentage(percentage, 1)}</span>
                  </div>
                  <div className="allocations-summary__bar" aria-hidden>
                    <div
                      className="allocations-summary__bar-fill"
                      style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
                    />
                  </div>
                  <p className="muted-text">
                    {formatAllocationNativeSummary(purpose.nativeAmounts)}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted-text">No allocations matched the selected filters.</p>
        )}
      </section>
    </div>
  );
};

export default Allocations;

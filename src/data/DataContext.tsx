import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  Account,
  AccountCollection,
  Budget,
  BudgetLine,
  BudgetLineMode,
  BudgetLineSubLine,
  BudgetInclusionMode,
  BudgetPeriodType,
  Category,
  CurrencyCode,
  DataActionError,
  DataState,
  ImportBatch,
  ImportDefaults,
  ImportFormatOptions,
  ImportProfile,
  InclusionMode,
  MasterCategory,
  Payee,
  Rule,
  RuleAction,
  RuleCondition,
  RuleRunLogEntry,
  RuleRunPreview,
  RuleRunSummary,
  RuleActionField,
  RuleFlowType,
  SettingsState,
  SubCategory,
  Tag,
  Transaction
} from './models';
import { buildDemoOnlyData, buildInitialState, MASTER_CATEGORIES } from './demoData';
import { generateId } from '../utils/id';
import { logError, logInfo } from '../utils/logger';
import {
  applyBudgetPeriodDraft,
  buildBudgetPeriodState
} from '../utils/budgetPeriods';

const STORAGE_KEY = 'sleekfinance.stage3.data';

export type TransactionAuditEntry = {
  id: string;
  field: string;
  previous: string | null;
  next: string | null;
  user: string;
  timestamp: string;
};

export type TransactionUpdateOptions = {
  manual?: boolean;
  user?: string;
  auditEntries?:
    | {
        field: string;
        previous?: string | null;
        next?: string | null;
      }[]
    | ((existing: Transaction) => {
        field: string;
        previous?: string | null;
        next?: string | null;
      }[]);
};

export type TransactionSplitLineInput = {
  amount: number;
  memo?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  payeeId?: string | null;
  tags?: string[];
  description?: string | null;
  metadata?: Record<string, unknown>;
};

const createDefaultImportDefaults = (): ImportDefaults => ({
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: '.',
  thousandsSeparator: ',',
  signConvention: 'positive-credit'
});

const createDefaultSettings = (): SettingsState => ({
  baseCurrency: 'GBP',
  exchangeRates: [{ currency: 'GBP', rateToBase: 1 }],
  lastExchangeRateUpdate: null,
  importDefaults: createDefaultImportDefaults(),
  importProfiles: []
});

const migrateState = (state: DataState): DataState => {
  const mergedSettings: SettingsState = state.settings
    ? {
        ...createDefaultSettings(),
        ...state.settings,
        importDefaults: {
          ...createDefaultImportDefaults(),
          ...state.settings.importDefaults
        },
        importProfiles: state.settings.importProfiles ?? []
      }
    : createDefaultSettings();

  const hasBaseRate = mergedSettings.exchangeRates.some(
    (rate) => rate.currency.toUpperCase() === mergedSettings.baseCurrency.toUpperCase()
  );
  if (!hasBaseRate) {
    mergedSettings.exchangeRates = [
      ...mergedSettings.exchangeRates,
      { currency: mergedSettings.baseCurrency, rateToBase: 1 }
    ];
  }

  const legacyInstitutions = (state as unknown as { institutions?: { id: string; name: string }[] })
    .institutions ?? [];
  const institutionLookup = new Map<string, string>(
    legacyInstitutions.map((inst) => [inst.id, inst.name])
  );

  const accounts = state.accounts.map((account) => {
    const {
      institutionId,
      includeOnlyGroupIds,
      excludeGroupId,
      collectionIds,
      provider,
      ...rest
    } = account as Account & {
      institutionId?: string;
      includeOnlyGroupIds?: string[];
      excludeGroupId?: string | null;
      collectionIds?: string[];
      provider?: string;
    };

    const resolvedProvider = (
      provider ?? (institutionId ? institutionLookup.get(institutionId) : undefined) ?? 'Unspecified Provider'
    ).trim();

    const existingCollections = Array.isArray(collectionIds)
      ? collectionIds
      : Array.from(
          new Set([
            ...((includeOnlyGroupIds as string[]) ?? []),
            ...((excludeGroupId ? [excludeGroupId] : []) as string[])
          ])
        );

    const nextAccount: Account = {
      ...(rest as Account),
      provider: resolvedProvider || 'Unspecified Provider',
      collectionIds: existingCollections,
      currency: account.currency ?? mergedSettings.baseCurrency
    };

    return nextAccount;
  });

  const accountCurrency = new Map<string, CurrencyCode>(accounts.map((account) => [account.id, account.currency]));

  const transactions = state.transactions.map((txn) => {
    const currency = txn.currency ?? accountCurrency.get(txn.accountId) ?? mergedSettings.baseCurrency;
    return {
      ...txn,
      currency,
      nativeAmount: txn.nativeAmount ?? txn.amount,
      nativeCurrency: txn.nativeCurrency ?? currency,
      importBatchId: txn.importBatchId ?? null,
      metadata: txn.metadata ?? undefined,
      flowOverride: (txn as Transaction).flowOverride ?? null
    };
  });

  const legacyCollections = (state as unknown as { accountCollections?: AccountCollection[] })
    .accountCollections;
  const legacyGroups = (state as unknown as { accountGroups?: AccountCollection[] }).accountGroups ?? [];

  const accountCollections = Array.isArray(legacyCollections)
    ? legacyCollections.map((collection) => ({
        ...collection,
        color: collection.color ?? '#2563eb',
        description: collection.description ?? undefined
      }))
    : legacyGroups.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color ?? '#2563eb',
        isDemo: (group as { isDemo?: boolean }).isDemo ?? false
      }));

  const rawBudgets = (state as unknown as { budgets?: Budget[] }).budgets ?? [];
  const budgets = Array.isArray(rawBudgets)
    ? rawBudgets.map((budget) => {
        const periodType: BudgetPeriodType = budget.periodType ?? 'monthly';
        const periodState = buildBudgetPeriodState({
          periodType,
          startMonth:
            typeof budget.startMonth === 'number' ? budget.startMonth : undefined,
          startYear: typeof budget.startYear === 'number' ? budget.startYear : undefined,
          startDayOfWeek:
            typeof budget.startDayOfWeek === 'number' ? budget.startDayOfWeek : undefined,
          anchorDate: typeof budget.anchorDate === 'string' ? budget.anchorDate : undefined
        });
        const includeMode: BudgetInclusionMode =
          budget.includeMode === 'collections' ? 'collections' : 'all';
        const uniqueCollections = Array.isArray(budget.collectionIds)
          ? Array.from(
              new Set(
                budget.collectionIds.filter((collectionId): collectionId is string =>
                  typeof collectionId === 'string'
                )
              )
            )
          : [];
        const createdAt = budget.createdAt ?? new Date().toISOString();
        const updatedAt = budget.updatedAt ?? createdAt;
        return {
          ...budget,
          ...periodState,
          name: budget.name?.trim() || 'Untitled budget',
          includeMode,
          collectionIds: includeMode === 'collections' ? uniqueCollections : [],
          rolloverEnabled: Boolean(budget.rolloverEnabled),
          isPrimary: Boolean(budget.isPrimary),
          archived: Boolean(budget.archived),
          createdAt,
          updatedAt
        } satisfies Budget;
      })
    : [];

  if (budgets.length > 0 && !budgets.some((budget) => budget.isPrimary)) {
    budgets[0] = { ...budgets[0], isPrimary: true };
  }

  const rawBudgetLines = (state as unknown as { budgetLines?: BudgetLine[] }).budgetLines ?? [];
  const budgetLines = Array.isArray(rawBudgetLines)
    ? rawBudgetLines
        .map((line, index) => {
          if (!line || typeof line !== 'object') {
            return null;
          }
          const plannedEntries = Object.entries(line.plannedAmounts ?? {}).filter(([, value]) =>
            Number.isFinite(Number(value))
          );
          const plannedAmounts = plannedEntries.reduce<Record<string, number>>((acc, [key, value]) => {
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
              acc[key] = numeric;
            }
            return acc;
          }, {});
          const subLines = Array.isArray(line.subLines)
            ? line.subLines
                .map((sub) => {
                  if (!sub || typeof sub !== 'object') {
                    return null;
                  }
                  const subPlannedEntries = Object.entries(sub.plannedAmounts ?? {}).filter(([, value]) =>
                    Number.isFinite(Number(value))
                  );
                  const subPlanned = subPlannedEntries.reduce<Record<string, number>>(
                    (acc, [key, value]) => {
                      const numeric = Number(value);
                      if (Number.isFinite(numeric)) {
                        acc[key] = numeric;
                      }
                      return acc;
                    },
                    {}
                  );
                  return {
                    id: sub.id ?? generateId('bdl-sub'),
                    subCategoryId: sub.subCategoryId ?? '',
                    plannedAmounts: subPlanned,
                    createdAt: sub.createdAt ?? new Date().toISOString(),
                    updatedAt: sub.updatedAt ?? sub.createdAt ?? new Date().toISOString()
                  } satisfies BudgetLineSubLine;
                })
                .filter((sub): sub is BudgetLineSubLine => Boolean(sub && sub.subCategoryId))
            : [];
          return {
            id: line.id ?? generateId('bdl'),
            budgetId: line.budgetId ?? '',
            categoryId: line.categoryId ?? '',
            mode: line.mode === 'breakdown' ? 'breakdown' : 'single',
            plannedAmounts,
            subLines,
            order: typeof line.order === 'number' ? line.order : index,
            createdAt: line.createdAt ?? new Date().toISOString(),
            updatedAt: line.updatedAt ?? line.createdAt ?? new Date().toISOString()
          } satisfies BudgetLine;
        })
        .filter((line): line is BudgetLine => Boolean(line && line.budgetId && line.categoryId))
    : [];

  const existingDirectory = Array.isArray((state as unknown as { providerDirectory?: string[] }).providerDirectory)
    ? ((state as unknown as { providerDirectory: string[] }).providerDirectory as string[])
    : [];

  const providerDirectory = Array.from(
    new Map(
      [...existingDirectory, ...accounts.map((account) => account.provider)].map((name) => [
        name.toLocaleLowerCase(),
        name
      ])
    ).values()
  ).sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()));

  const { institutions: _institutions, accountGroups: _accountGroups, ...restState } = state as Record<string, unknown>;

  return {
    ...(restState as DataState),
    accounts,
    budgets,
    budgetLines,
    transactions,
    importBatches: state.importBatches ?? [],
    rules: state.rules ?? [],
    ruleLogs: state.ruleLogs ?? [],
    settings: mergedSettings,
    providerDirectory,
    accountCollections
  };
};

type CreateAccountInput = {
  provider: string;
  name: string;
  type: Account['type'];
  currency: CurrencyCode;
  openingBalance: number;
  openingBalanceDate: string;
  includeInTotals: boolean;
  collectionIds: string[];
  notes?: string;
  accountNumber?: string;
  currentBalance?: number;
};

type UpdateAccountInput = Partial<CreateAccountInput> & {
  includeInTotals?: boolean;
};

type CreateAccountCollectionInput = {
  name: string;
  description?: string;
  color?: string;
};

type UpdateAccountCollectionInput = Partial<CreateAccountCollectionInput>;

type CreateBudgetInput = {
  name: string;
  periodType: BudgetPeriodType;
  startMonth?: number;
  startYear?: number;
  startDayOfWeek?: number;
  anchorDate?: string;
  includeMode: BudgetInclusionMode;
  collectionIds: string[];
  rolloverEnabled?: boolean;
  isPrimary?: boolean;
};

type UpdateBudgetInput = Partial<CreateBudgetInput> & {
  archived?: boolean;
};

type CreateCategoryInput = {
  masterCategoryId: string;
  name: string;
};

type UpdateCategoryInput = {
  name?: string;
};

type CreateSubCategoryInput = {
  categoryId: string;
  name: string;
};

type UpdateSubCategoryInput = {
  name?: string;
};

type CreatePayeeInput = {
  name: string;
  defaultCategoryId: string | null;
  defaultSubCategoryId: string | null;
};

type UpdatePayeeInput = Partial<CreatePayeeInput>;

type CreateTagInput = {
  name: string;
  color?: string;
};

type UpdateTagInput = Partial<CreateTagInput>;

type SaveImportProfileInput = {
  id?: string;
  name: string;
  headerFingerprint: string;
  fieldMapping: ImportProfile['fieldMapping'];
  format: ImportFormatOptions;
  transforms?: Record<string, string>;
};

type CreateImportBatchInput = Omit<ImportBatch, 'id'> & { id?: string };

type DataContextValue = {
  state: DataState;
  masterCategories: MasterCategory[];
  recordProviderName: (name: string) => void;
  createAccount: (input: CreateAccountInput) => DataActionError | null;
  updateAccount: (id: string, input: UpdateAccountInput) => DataActionError | null;
  archiveAccount: (id: string) => void;
  unarchiveAccount: (id: string) => void;
  setAccountInclusion: (id: string, mode: InclusionMode) => DataActionError | null;
  setCollectionsForAccount: (accountId: string, collectionIds: string[]) => DataActionError | null;
  createBudget: (input?: Partial<CreateBudgetInput>) => Budget;
  updateBudget: (id: string, input: UpdateBudgetInput) => DataActionError | null;
  setPrimaryBudget: (id: string) => void;
  duplicateBudget: (id: string) => Budget | null;
  archiveBudget: (id: string) => void;
  restoreBudget: (id: string) => void;
  deleteBudget: (id: string) => void;
  createBudgetLine: (budgetId: string, categoryId: string) => BudgetLine | null;
  removeBudgetLine: (id: string) => void;
  setBudgetLineMode: (id: string, mode: BudgetLineMode) => void;
  setBudgetLinePlannedAmount: (id: string, periodKey: string, amount: number) => void;
  reorderBudgetLines: (budgetId: string, orderedIds: string[]) => void;
  createBudgetSubLine: (lineId: string, subCategoryId: string) => BudgetLineSubLine | null;
  removeBudgetSubLine: (lineId: string, subLineId: string) => void;
  setBudgetSubLinePlannedAmount: (id: string, periodKey: string, amount: number) => void;
  createAccountCollection: (
    input: CreateAccountCollectionInput
  ) => DataActionError | null;
  updateAccountCollection: (
    id: string,
    input: UpdateAccountCollectionInput
  ) => DataActionError | null;
  deleteAccountCollection: (id: string) => void;
  createCategory: (input: CreateCategoryInput) => DataActionError | null;
  updateCategory: (id: string, input: UpdateCategoryInput) => DataActionError | null;
  mergeCategories: (fromId: string, toId: string) => DataActionError | null;
  archiveCategory: (id: string) => void;
  createSubCategory: (input: CreateSubCategoryInput) => DataActionError | null;
  updateSubCategory: (id: string, input: UpdateSubCategoryInput) => DataActionError | null;
  mergeSubCategories: (fromId: string, toId: string) => DataActionError | null;
  archiveSubCategory: (id: string) => void;
  createPayee: (input: CreatePayeeInput) => DataActionError | null;
  updatePayee: (id: string, input: UpdatePayeeInput) => DataActionError | null;
  archivePayee: (id: string) => void;
  createTag: (input: CreateTagInput) => DataActionError | null;
  updateTag: (id: string, input: UpdateTagInput) => DataActionError | null;
  archiveTag: (id: string) => void;
  addTransaction: (txn: Omit<Transaction, 'id'>) => Transaction;
  updateTransaction: (
    id: string,
    txn: Partial<Transaction>,
    options?: TransactionUpdateOptions
  ) => void;
  bulkUpdateTransactions: (
    ids: string[],
    txn: Partial<Transaction>,
    options?: TransactionUpdateOptions
  ) => void;
  splitTransaction: (
    id: string,
    lines: TransactionSplitLineInput[],
    user?: string
  ) => DataActionError | null;
  archiveTransaction: (id: string) => void;
  updateBaseCurrency: (currency: CurrencyCode) => void;
  upsertExchangeRate: (currency: CurrencyCode, rate: number) => DataActionError | null;
  removeExchangeRate: (currency: CurrencyCode) => void;
  updateImportDefaults: (defaults: ImportDefaults) => void;
  saveImportProfile: (input: SaveImportProfileInput) => ImportProfile;
  deleteImportProfile: (id: string) => void;
  createImportBatch: (input: CreateImportBatchInput) => ImportBatch;
  undoLastImport: () => void;
  clearDemoTransactionsForAccount: (accountId: string) => void;
  loadDemoData: () => void;
  clearDemoData: () => void;
  createRule: () => Rule;
  saveRule: (rule: Rule) => void;
  duplicateRule: (id: string) => Rule | null;
  setRuleEnabled: (id: string, enabled: boolean) => void;
  archiveRule: (id: string) => void;
  restoreRule: (id: string) => void;
  previewRuleRun: (transactionIds: string[]) => RuleRunPreview;
  runRules: (
    transactionIds: string[],
    mode: 'auto' | 'manual',
    source?: string
  ) => RuleRunLogEntry | null;
};

const DataContext = createContext<DataContextValue | undefined>(undefined);

const persistState = (state: DataState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    logError('Unable to persist finance data store', { error });
  }
};

const loadState = (): DataState => {
  if (typeof window === 'undefined') {
    return buildInitialState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = buildInitialState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as DataState;
    return migrateState(parsed);
  } catch (error) {
    logError('Failed to parse finance data store, rebuilding initial state.', { error });
    const initial = buildInitialState();
    persistState(initial);
    return initial;
  }
};

const withTimestamp = (updater: (state: DataState) => DataState) => (state: DataState) => {
  const next = updater(state);
  return { ...next, lastUpdated: new Date().toISOString() };
};

const normalise = (value: string) => value.trim().toLocaleLowerCase();

const WORKSPACE_METADATA_KEY = '__transactionsWorkspace';

type WorkspaceMetadata = {
  auditLog?: TransactionAuditEntry[];
  lastManualEdit?: { user: string; timestamp: string; fields: string[] };
  manuallyEdited?: boolean;
  splitParentId?: string | null;
  splitIndex?: number | null;
  splitTotal?: number | null;
  rawFields?: Record<string, unknown> | null;
};

const readWorkspaceMetadata = (metadata: Transaction['metadata']): WorkspaceMetadata => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const raw = (metadata as Record<string, unknown>)[WORKSPACE_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const value = raw as WorkspaceMetadata;
  const auditLog = Array.isArray(value.auditLog)
    ? (value.auditLog as TransactionAuditEntry[])
    : undefined;
  const lastManualEdit =
    value.lastManualEdit && typeof value.lastManualEdit === 'object'
      ? (value.lastManualEdit as WorkspaceMetadata['lastManualEdit'])
      : undefined;
  const rawFields =
    value.rawFields && typeof value.rawFields === 'object' && !Array.isArray(value.rawFields)
      ? (value.rawFields as Record<string, unknown>)
      : undefined;
  return {
    auditLog,
    lastManualEdit,
    manuallyEdited: value.manuallyEdited ?? Boolean(lastManualEdit),
    splitParentId: value.splitParentId ?? undefined,
    splitIndex: value.splitIndex ?? undefined,
    splitTotal: value.splitTotal ?? undefined,
    rawFields: rawFields ?? undefined
  };
};

const setWorkspaceMetadata = (
  metadata: Transaction['metadata'],
  workspace: WorkspaceMetadata
): Record<string, unknown> => {
  const base: Record<string, unknown> =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base[WORKSPACE_METADATA_KEY] = {
    ...workspace,
    auditLog: workspace.auditLog?.map((entry) => ({ ...entry })),
    rawFields: workspace.rawFields ? { ...workspace.rawFields } : workspace.rawFields
  };
  return base;
};

const mergeWorkspaceMetadata = (
  metadata: Transaction['metadata'],
  partial: Partial<WorkspaceMetadata>
): Record<string, unknown> => {
  const current = readWorkspaceMetadata(metadata);
  const merged: WorkspaceMetadata = {
    ...current,
    ...partial,
    auditLog: partial.auditLog ?? current.auditLog,
    rawFields: partial.rawFields ?? current.rawFields
  };
  return setWorkspaceMetadata(metadata, merged);
};

const applyManualMetadata = (
  transaction: Transaction,
  fields: string[],
  user: string,
  auditEntries?: {
    field: string;
    previous?: string | null;
    next?: string | null;
  }[]
): Transaction => {
  if (!fields.length && !(auditEntries && auditEntries.length)) {
    return transaction;
  }
  const timestamp = new Date().toISOString();
  const fallback = fields.map((field) => ({ field, previous: null, next: null }));
  const entries = (auditEntries && auditEntries.length ? auditEntries : fallback).map(
    (entry) => ({
      id: generateId('edit'),
      field: entry.field,
      previous: entry.previous ?? null,
      next: entry.next ?? null,
      user,
      timestamp
    })
  );
  const workspace = readWorkspaceMetadata(transaction.metadata);
  const nextWorkspace: WorkspaceMetadata = {
    ...workspace,
    manuallyEdited: true,
    auditLog: [...(workspace.auditLog ?? []), ...entries],
    lastManualEdit: {
      user,
      timestamp,
      fields: fields.length ? fields : entries.map((entry) => entry.field)
    }
  };
  return {
    ...transaction,
    metadata: setWorkspaceMetadata(transaction.metadata, nextWorkspace)
  };
};

const getActionField = (action: RuleAction): RuleActionField => {
  switch (action.type) {
    case 'set-category':
      return 'category';
    case 'add-tags':
      return 'tags';
    case 'set-payee':
      return 'payee';
    case 'mark-transfer':
      return 'flow';
    case 'prepend-memo':
      return 'memo';
    case 'clear-needs-fx':
      return 'needsFx';
    default:
      return 'memo';
  }
};

type RuleEvaluationContext = {
  accountsById: Map<string, Account>;
  payeesById: Map<string, Payee>;
  payeesByName: Map<string, Payee>;
  categoriesById: Map<string, Category>;
  subCategoriesById: Map<string, SubCategory>;
  masterById: Map<string, MasterCategory>;
};

const resolveFlowType = (
  transaction: Transaction,
  context: RuleEvaluationContext
): RuleFlowType => {
  if (transaction.flowOverride) {
    return transaction.flowOverride;
  }
  if (transaction.categoryId) {
    const category = context.categoriesById.get(transaction.categoryId);
    if (category) {
      const master = context.masterById.get(category.masterCategoryId);
      if (master) {
        const name = normalise(master.name);
        if (name.includes('interest')) return 'interest';
        if (name.includes('fee')) return 'fees';
        if (name.includes('transfer')) return 'transfer';
        if (name.includes('income') || name.includes('inflow')) return 'in';
        if (name.includes('expense') || name.includes('spend') || name.includes('out')) return 'out';
      }
    }
  }
  if (transaction.amount >= 0) return 'in';
  return 'out';
};

const textIncludes = (haystack: string | undefined, needle: string) => {
  if (!needle.trim()) return false;
  const value = haystack?.toLocaleLowerCase() ?? '';
  const search = needle.trim().toLocaleLowerCase();
  return value.includes(search);
};

const textStartsWith = (haystack: string | undefined, needle: string) => {
  if (!needle.trim()) return false;
  const value = haystack?.toLocaleLowerCase() ?? '';
  const search = needle.trim().toLocaleLowerCase();
  return value.startsWith(search);
};

const textEquals = (haystack: string | undefined, needle: string) => {
  if (!needle.trim()) return false;
  const value = haystack?.toLocaleLowerCase() ?? '';
  const search = needle.trim().toLocaleLowerCase();
  return value === search;
};

const conditionMatches = (
  condition: RuleCondition,
  transaction: Transaction,
  context: RuleEvaluationContext
): boolean => {
  switch (condition.type) {
    case 'description': {
      const description =
        transaction.description ?? transaction.rawDescription ?? transaction.memo ?? '';
      if (condition.operator === 'contains') {
        return textIncludes(description, condition.value);
      }
      if (condition.operator === 'startsWith') {
        return textStartsWith(description, condition.value);
      }
      return textEquals(description, condition.value);
    }
    case 'payee': {
      const payee = transaction.payeeId
        ? context.payeesById.get(transaction.payeeId)?.name
        : undefined;
      if (condition.operator === 'contains') {
        return textIncludes(payee, condition.value);
      }
      return textEquals(payee, condition.value);
    }
    case 'amount': {
      const amount = transaction.amount;
      switch (condition.operator) {
        case 'equals':
          return amount === condition.value;
        case 'greaterThan':
          return amount > condition.value;
        case 'lessThan':
          return amount < condition.value;
        case 'between': {
          if (condition.secondaryValue === undefined) return false;
          const min = Math.min(condition.value, condition.secondaryValue);
          const max = Math.max(condition.value, condition.secondaryValue);
          return amount >= min && amount <= max;
        }
        default:
          return false;
      }
    }
    case 'dateRange': {
      const timestamp = new Date(transaction.date).getTime();
      if (Number.isNaN(timestamp)) return false;
      if (condition.start) {
        const start = new Date(condition.start).getTime();
        if (!Number.isNaN(start) && timestamp < start) {
          return false;
        }
      }
      if (condition.end) {
        const end = new Date(condition.end).getTime();
        if (!Number.isNaN(end) && timestamp > end) {
          return false;
        }
      }
      return true;
    }
    case 'account': {
      return condition.accountIds.includes(transaction.accountId);
    }
    case 'provider': {
      const account = context.accountsById.get(transaction.accountId);
      const provider = account?.provider ?? '';
      return condition.providers.some(
        (candidate) => normalise(candidate) === normalise(provider)
      );
    }
    case 'category-empty': {
      if (condition.level === 'category') {
        return !transaction.categoryId;
      }
      return !transaction.subCategoryId;
    }
    case 'category': {
      if (!transaction.categoryId) return false;
      if (transaction.categoryId !== condition.categoryId) return false;
      if (condition.subCategoryId) {
        return transaction.subCategoryId === condition.subCategoryId;
      }
      return true;
    }
    case 'flow': {
      return resolveFlowType(transaction, context) === condition.flow;
    }
    case 'tag': {
      return transaction.tags.includes(condition.tagId);
    }
    default:
      return false;
  }
};

type ActionOutcome = {
  applied: boolean;
  changed: boolean;
};

const ensurePayee = (
  name: string,
  payeesById: Map<string, Payee>,
  payeesByName: Map<string, Payee>,
  pendingPayees: Payee[]
): Payee | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = payeesByName.get(normalise(trimmed));
  if (existing) {
    return existing;
  }
  const payee: Payee = {
    id: generateId('pay'),
    name: trimmed,
    defaultCategoryId: null,
    defaultSubCategoryId: null,
    archived: false,
    isDemo: false
  };
  payeesById.set(payee.id, payee);
  payeesByName.set(normalise(payee.name), payee);
  pendingPayees.push(payee);
  return payee;
};

const applyRuleAction = (
  action: RuleAction,
  transaction: Transaction,
  context: RuleEvaluationContext,
  pendingPayees: Payee[]
): ActionOutcome => {
  switch (action.type) {
    case 'set-category': {
      const subCategory =
        action.subCategoryId ? context.subCategoriesById.get(action.subCategoryId) : null;
      const validSubCategory =
        subCategory && subCategory.categoryId === action.categoryId ? subCategory.id : null;
      const nextCategoryId = action.categoryId;
      const nextSubCategoryId = action.subCategoryId ? validSubCategory : null;
      const changed =
        transaction.categoryId !== nextCategoryId ||
        (transaction.subCategoryId ?? null) !== nextSubCategoryId;
      transaction.categoryId = nextCategoryId;
      transaction.subCategoryId = nextSubCategoryId;
      return { applied: true, changed };
    }
    case 'add-tags': {
      if (!action.tagIds.length) {
        return { applied: false, changed: false };
      }
      const current = new Set(transaction.tags);
      action.tagIds.forEach((tagId) => current.add(tagId));
      const next = Array.from(current);
      const before = transaction.tags;
      const changed =
        before.length !== next.length || before.some((tagId, index) => tagId !== next[index]);
      transaction.tags = next;
      return { applied: true, changed };
    }
    case 'set-payee': {
      const payee = ensurePayee(action.payeeName, context.payeesById, context.payeesByName, pendingPayees);
      if (!payee) {
        return { applied: false, changed: false };
      }
      const changed = transaction.payeeId !== payee.id;
      transaction.payeeId = payee.id;
      return { applied: true, changed };
    }
    case 'mark-transfer': {
      const changed = transaction.flowOverride !== 'transfer';
      transaction.flowOverride = 'transfer';
      return { applied: true, changed };
    }
    case 'prepend-memo': {
      const prefix = action.prefix.trim();
      if (!prefix) {
        return { applied: false, changed: false };
      }
      const existing = transaction.memo ?? '';
      if (existing.startsWith(prefix)) {
        return { applied: true, changed: false };
      }
      transaction.memo = existing ? `${prefix} ${existing}` : prefix;
      return { applied: true, changed: true };
    }
    case 'clear-needs-fx': {
      const previous = transaction.needsFx ?? false;
      transaction.needsFx = false;
      return { applied: true, changed: previous !== false };
    }
    default:
      return { applied: false, changed: false };
  }
};

const summariseFields = (fields: Set<RuleActionField>): RuleActionField[] =>
  Array.from(fields.values()).sort();

type RuleEngineResult = {
  preview: RuleRunPreview;
  updatedTransactions: Map<string, Transaction>;
  pendingPayees: Payee[];
  changedTransactionIds: Set<string>;
};

const executeRules = (
  rules: Rule[],
  transactions: Transaction[],
  transactionIds: string[],
  state: DataState
): RuleEngineResult => {
  const enabledRules = rules
    .filter((rule) => rule.enabled && !rule.archived)
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.name.localeCompare(b.name);
    });

  const transactionMap = new Map<string, Transaction>();
  transactionIds.forEach((id) => {
    const original = transactions.find((txn) => txn.id === id);
    if (original) {
      transactionMap.set(id, { ...original, tags: [...original.tags] });
    }
  });

  const accountsById = new Map(state.accounts.map((account) => [account.id, account]));
  const payeesById = new Map(state.payees.map((payee) => [payee.id, payee]));
  const payeesByName = new Map(
    state.payees.map((payee) => [normalise(payee.name), payee])
  );
  const categoriesById = new Map(state.categories.map((category) => [category.id, category]));
  const subCategoriesById = new Map(
    state.subCategories.map((sub) => [sub.id, sub])
  );
  const masterById = new Map(state.masterCategories.map((master) => [master.id, master]));

  const context: RuleEvaluationContext = {
    accountsById,
    payeesById,
    payeesByName,
    categoriesById,
    subCategoriesById,
    masterById
  };

  const fieldLocks = new Map<string, Set<RuleActionField>>();
  const pendingPayees: Payee[] = [];
  const summaries: RuleRunSummary[] = [];
  const changedTransactionIds = new Set<string>();

  const orderedTransactions = transactionIds
    .map((id) => transactionMap.get(id))
    .filter((txn): txn is Transaction => Boolean(txn));

  enabledRules.forEach((rule) => {
    let matchedCount = 0;
    const fieldsForRule = new Set<RuleActionField>();

    orderedTransactions.forEach((transaction) => {
      if (!transaction) return;
      const conditions = rule.conditions ?? [];
      const match =
        conditions.length === 0
          ? true
          : rule.matchType === 'any'
          ? conditions.some((condition) => conditionMatches(condition, transaction, context))
          : conditions.every((condition) => conditionMatches(condition, transaction, context));

      if (!match) {
        return;
      }

      matchedCount += 1;

      const localAppliedFields = new Set<RuleActionField>();

      rule.actions.forEach((action) => {
        const field = getActionField(action);
        if (localAppliedFields.has(field)) {
          return;
        }
        const lockSet = fieldLocks.get(transaction.id) ?? new Set<RuleActionField>();
        if (lockSet.has(field)) {
          return;
        }

        const outcome = applyRuleAction(action, transaction, context, pendingPayees);
        if (!outcome.applied) {
          return;
        }

        localAppliedFields.add(field);
        lockSet.add(field);
        fieldLocks.set(transaction.id, lockSet);
        fieldsForRule.add(field);
        if (outcome.changed) {
          changedTransactionIds.add(transaction.id);
        }
      });
    });

    summaries.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched: matchedCount,
      actionFields: summariseFields(fieldsForRule)
    });
  });

  return {
    preview: {
      transactionCount: orderedTransactions.length,
      summaries
    },
    updatedTransactions: transactionMap,
    pendingPayees,
    changedTransactionIds
  };
};
const validateOpeningBalanceDate = (iso: string): DataActionError | null => {
  const candidate = new Date(iso);
  if (Number.isNaN(candidate.getTime())) {
    return {
      title: 'Invalid opening balance date',
      description: 'Enter a valid ISO date (YYYY-MM-DD).' 
    };
  }
  const today = new Date();
  if (candidate.getTime() > today.getTime()) {
    return {
      title: 'Future opening balance date',
      description: 'Opening balance dates must not be in the future.'
    };
  }
  return null;
};

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<DataState>(() => loadState());

  useEffect(() => {
    persistState(state);
  }, [state]);

  const updateState = (updater: (prev: DataState) => DataState) => {
    setState((prev) => withTimestamp(updater)(prev));
  };

  const recordProviderName = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = state.providerDirectory.some(
      (provider) => provider.toLocaleLowerCase() === trimmed.toLocaleLowerCase()
    );
    if (exists) return;
    updateState((prev) => ({
      ...prev,
      providerDirectory: [...prev.providerDirectory, trimmed].sort((a, b) =>
        a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())
      )
    }));
    logInfo('Provider recorded', { name: trimmed });
  };

  const createAccount = (input: CreateAccountInput): DataActionError | null => {
    const provider = input.provider.trim();
    if (!provider) {
      return { title: 'Provider required', description: 'Specify who holds this account.' };
    }

    if (!input.currency.trim()) {
      return { title: 'Currency required', description: 'Choose a currency for the account.' };
    }

    const duplicate = state.accounts.find(
      (acct) =>
        acct.provider.toLocaleLowerCase() === provider.toLocaleLowerCase() &&
        acct.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate account',
        description: 'Another account with this provider already uses that name.'
      };
    }

    const dateError = validateOpeningBalanceDate(input.openingBalanceDate);
    if (dateError) return dateError;

    const invalidCollections = input.collectionIds.filter(
      (collectionId) => !state.accountCollections.some((collection) => collection.id === collectionId)
    );
    if (invalidCollections.length > 0) {
      return {
        title: 'Unknown collection',
        description: 'Choose from the available collections when assigning accounts.'
      };
    }

    const account: Account = {
      id: generateId('acct'),
      provider,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency.trim().toUpperCase(),
      includeInTotals: input.includeInTotals,
      collectionIds: Array.from(new Set(input.collectionIds)),
      openingBalance: input.openingBalance,
      openingBalanceDate: input.openingBalanceDate,
      currentBalance: input.currentBalance ?? input.openingBalance,
      archived: false,
      accountNumber: input.accountNumber?.trim() || undefined,
      notes: input.notes,
      isDemo: false
    };

    updateState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, account],
      providerDirectory: prev.providerDirectory.some(
        (existing) => existing.toLocaleLowerCase() === provider.toLocaleLowerCase()
      )
        ? prev.providerDirectory
        : [...prev.providerDirectory, provider].sort((a, b) =>
            a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())
          ),
      settings: {
        ...prev.settings,
        exchangeRates: prev.settings.exchangeRates.some(
          (rate) => rate.currency.toUpperCase() === account.currency
        )
          ? prev.settings.exchangeRates
          : [...prev.settings.exchangeRates, { currency: account.currency, rateToBase: 1 }]
      }
    }));

    logInfo('Account created', { id: account.id, provider: account.provider });
    return null;
  };

  const updateAccount = (id: string, input: UpdateAccountInput): DataActionError | null => {
    const account = state.accounts.find((acct) => acct.id === id);
    if (!account) {
      return { title: 'Account missing', description: 'The referenced account no longer exists.' };
    }

    const trimmedName = input.name?.trim();
    const nextName = trimmedName ?? account.name;

    const provider = input.provider !== undefined ? input.provider.trim() : account.provider;
    if (!provider) {
      return { title: 'Provider required', description: 'Specify who holds this account.' };
    }

    const duplicate = state.accounts.find(
      (acct) =>
        acct.id !== id &&
        acct.provider.toLocaleLowerCase() === provider.toLocaleLowerCase() &&
        acct.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate account',
        description: 'Another account with this provider already uses that name.'
      };
    }

    if (input.openingBalanceDate) {
      const dateError = validateOpeningBalanceDate(input.openingBalanceDate);
      if (dateError) return dateError;
    }

    if (input.collectionIds) {
      const invalid = input.collectionIds.filter(
        (collectionId) =>
          !state.accountCollections.some((collection) => collection.id === collectionId)
      );
      if (invalid.length > 0) {
        return {
          title: 'Unknown collection',
          description: 'Choose from the available collections when assigning accounts.'
        };
      }
    }

    const currency = input.currency ? input.currency.trim().toUpperCase() : account.currency;
    const includeInTotals = input.includeInTotals ?? account.includeInTotals;
    const nextCollections = input.collectionIds
      ? Array.from(new Set(input.collectionIds))
      : account.collectionIds.filter((collectionId) =>
          state.accountCollections.some((collection) => collection.id === collectionId)
        );

    const nextAccountNumber =
      input.accountNumber !== undefined
        ? input.accountNumber.trim() || undefined
        : account.accountNumber;

    const nextNotes = input.notes !== undefined ? input.notes || undefined : account.notes;

    const nextOpeningBalance =
      input.openingBalance !== undefined ? input.openingBalance : account.openingBalance;

    const nextCurrentBalance =
      input.currentBalance !== undefined ? input.currentBalance : account.currentBalance;

    const nextOpeningBalanceDate =
      input.openingBalanceDate ?? account.openingBalanceDate;

    updateState((prev) => {
      const updatedAccounts = prev.accounts.map((acct) =>
        acct.id === id
          ? {
              ...acct,
              provider,
              name: nextName,
              type: input.type ?? acct.type,
              currency,
              includeInTotals,
              collectionIds: nextCollections,
              openingBalance: nextOpeningBalance,
              openingBalanceDate: nextOpeningBalanceDate,
              currentBalance: nextCurrentBalance,
              accountNumber: nextAccountNumber,
              notes: nextNotes
            }
          : acct
      );

      const transactions = prev.transactions.map((txn) =>
        txn.accountId === id
          ? {
              ...txn,
              currency,
              nativeCurrency: txn.nativeCurrency ?? currency
            }
          : txn
      );

      const exchangeRates = prev.settings.exchangeRates.some(
        (rate) => rate.currency.toUpperCase() === currency
      )
        ? prev.settings.exchangeRates
        : [...prev.settings.exchangeRates, { currency, rateToBase: 1 }];

      const providerDirectory = prev.providerDirectory.some(
        (existing) => existing.toLocaleLowerCase() === provider.toLocaleLowerCase()
      )
        ? prev.providerDirectory
        : [...prev.providerDirectory, provider].sort((a, b) =>
            a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())
          );

      return {
        ...prev,
        accounts: updatedAccounts,
        transactions,
        providerDirectory,
        settings: { ...prev.settings, exchangeRates }
      };
    });
    logInfo('Account updated', { id });
    return null;
  };

  const archiveAccount = (id: string) => {
    updateState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acct) => (acct.id === id ? { ...acct, archived: true } : acct))
    }));
    logInfo('Account archived', { id });
  };

  const unarchiveAccount = (id: string) => {
    const account = state.accounts.find((acct) => acct.id === id);
    if (!account) {
      logInfo('Account restore skipped', { id });
      return;
    }
    updateState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acct) => (acct.id === id ? { ...acct, archived: false } : acct))
    }));
    logInfo('Account restored', { id });
  };

  const setAccountInclusion = (id: string, mode: InclusionMode): DataActionError | null => {
    const account = state.accounts.find((acct) => acct.id === id);
    if (!account) {
      return { title: 'Account missing', description: 'Select a valid account.' };
    }
    updateState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acct) =>
        acct.id === id ? { ...acct, includeInTotals: mode === 'included' } : acct
      )
    }));
    logInfo('Account inclusion updated', { id, mode });
    return null;
  };

  const setCollectionsForAccount = (
    accountId: string,
    collectionIds: string[]
  ): DataActionError | null => {
    const account = state.accounts.find((acct) => acct.id === accountId);
    if (!account) {
      return { title: 'Account missing', description: 'Select a valid account first.' };
    }

    const invalid = collectionIds.filter(
      (collectionId) =>
        !state.accountCollections.some((collection) => collection.id === collectionId)
    );
    if (invalid.length > 0) {
      return {
        title: 'Unknown collection',
        description: 'Choose from the available collections when assigning accounts.'
      };
    }

    updateState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acct) =>
        acct.id === accountId
          ? { ...acct, collectionIds: Array.from(new Set(collectionIds)) }
          : acct
      )
    }));
    logInfo('Account collections updated', { accountId, count: collectionIds.length });
    return null;
  };

  const makeUniqueBudgetName = (preferred: string) => {
    const existingNames = new Set(
      state.budgets.map((budget) => budget.name.toLocaleLowerCase())
    );
    if (!existingNames.has(preferred.toLocaleLowerCase())) {
      return preferred;
    }
    let counter = 2;
    let candidate = `${preferred} (${counter})`;
    while (existingNames.has(candidate.toLocaleLowerCase())) {
      counter += 1;
      candidate = `${preferred} (${counter})`;
    }
    return candidate;
  };

  const createBudget = (input?: Partial<CreateBudgetInput>): Budget => {
    const now = new Date();
    const baseName = input?.name?.trim() || 'New budget';
    const name = makeUniqueBudgetName(baseName);
    const periodState = buildBudgetPeriodState({
      periodType: input?.periodType ?? 'monthly',
      startMonth: input?.startMonth,
      startYear: input?.startYear,
      startDayOfWeek: input?.startDayOfWeek,
      anchorDate: input?.anchorDate
    }, now);
    const includeMode: BudgetInclusionMode =
      input?.includeMode === 'collections' ? 'collections' : 'all';
    const validCollections = includeMode === 'collections'
      ? (input?.collectionIds ?? []).filter((collectionId) =>
          state.accountCollections.some((collection) => collection.id === collectionId)
        )
      : [];
    const hasPrimary = state.budgets.some((budget) => budget.isPrimary);
    const shouldBePrimary = input?.isPrimary ?? !hasPrimary;
    const budget: Budget = {
      id: generateId('bdg'),
      name,
      ...periodState,
      includeMode,
      collectionIds: Array.from(new Set(validCollections)),
      rolloverEnabled: Boolean(input?.rolloverEnabled),
      isPrimary: shouldBePrimary,
      archived: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    const finalBudget = shouldBePrimary ? { ...budget, isPrimary: true } : budget;

    updateState((prev) => {
      const appended = [...prev.budgets, finalBudget];
      const budgets = shouldBePrimary
        ? appended.map((entry) =>
            entry.id === finalBudget.id ? entry : { ...entry, isPrimary: false }
          )
        : appended;
      return { ...prev, budgets };
    });
    logInfo('Budget created', { id: budget.id });
    return finalBudget;
  };

  const updateBudget = (
    id: string,
    input: UpdateBudgetInput
  ): DataActionError | null => {
    const trimmedName =
      input.name !== undefined ? input.name.trim() : undefined;
    if (trimmedName !== undefined && !trimmedName) {
      return { title: 'Budget name required', description: 'Enter a budget name.' };
    }

    if (input.includeMode === 'collections') {
      const invalidCollections = (input.collectionIds ?? []).filter(
        (collectionId) =>
          !state.accountCollections.some((collection) => collection.id === collectionId)
      );
      if (invalidCollections.length > 0) {
        return {
          title: 'Unknown collection',
          description: 'Choose from available collections when scoping a budget.'
        };
      }
    }

    let updated: Budget | null = null;
    updateState((prev) => {
      const index = prev.budgets.findIndex((budget) => budget.id === id);
      if (index === -1) {
        return prev;
      }
      const budget = prev.budgets[index];
      const includeMode: BudgetInclusionMode =
        input.includeMode ?? budget.includeMode;
      const collectionIds = includeMode === 'collections'
        ? Array.from(
            new Set(
              (input.collectionIds ?? budget.collectionIds).filter((collectionId) =>
                prev.accountCollections.some((collection) => collection.id === collectionId)
              )
            )
          )
        : [];
      const periodDraft = applyBudgetPeriodDraft(
        budget,
        {
          periodType: input.periodType,
          startMonth: input.startMonth,
          startYear: input.startYear,
          startDayOfWeek: input.startDayOfWeek,
          anchorDate: input.anchorDate
        }
      );
      const nextBudget: Budget = {
        ...periodDraft,
        name: trimmedName ?? budget.name,
        includeMode,
        collectionIds,
        rolloverEnabled: input.rolloverEnabled ?? budget.rolloverEnabled,
        isPrimary: budget.isPrimary,
        archived: input.archived ?? budget.archived,
        createdAt: budget.createdAt,
        updatedAt: new Date().toISOString()
      };
      const budgets = [...prev.budgets];
      budgets[index] = nextBudget;
      updated = nextBudget;
      return { ...prev, budgets };
    });
    if (!updated) {
      return { title: 'Budget missing', description: 'Select an existing budget first.' };
    }
    logInfo('Budget updated', { id });
    return null;
  };

  const setPrimaryBudget = (id: string) => {
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      if (!prev.budgets.some((budget) => budget.id === id)) {
        return prev;
      }
      let changed = false;
      const budgets = prev.budgets.map((budget) => {
        if (budget.id === id) {
          if (!budget.isPrimary) {
            changed = true;
            return { ...budget, isPrimary: true, updatedAt: timestamp };
          }
          return budget;
        }
        if (budget.isPrimary) {
          changed = true;
          return { ...budget, isPrimary: false, updatedAt: timestamp };
        }
        return budget;
      });
      if (!changed) {
        return prev;
      }
      return { ...prev, budgets };
    });
    logInfo('Primary budget set', { id });
  };

  const duplicateBudget = (id: string): Budget | null => {
    const source = state.budgets.find((budget) => budget.id === id);
    if (!source) {
      return null;
    }
    const now = new Date();
    const duplicateName = makeUniqueBudgetName(`${source.name} (copy)`);
    const duplicate: Budget = {
      ...source,
      id: generateId('bdg'),
      name: duplicateName,
      archived: false,
      isPrimary: false,
      collectionIds: [...source.collectionIds],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    const sourceLines = state.budgetLines
      .filter((line) => line.budgetId === id)
      .map((line) => {
        const newLineId = generateId('bdl');
        const nowIso = now.toISOString();
        const subLines = line.subLines.map((sub) => ({
          ...sub,
          id: generateId('bdl-sub'),
          plannedAmounts: { ...sub.plannedAmounts },
          createdAt: nowIso,
          updatedAt: nowIso
        }));
        return {
          ...line,
          id: newLineId,
          budgetId: duplicate.id,
          plannedAmounts: { ...line.plannedAmounts },
          subLines,
          createdAt: nowIso,
          updatedAt: nowIso
        } satisfies BudgetLine;
      });
    updateState((prev) => ({
      ...prev,
      budgets: [...prev.budgets, duplicate],
      budgetLines: [...prev.budgetLines, ...sourceLines]
    }));
    logInfo('Budget duplicated', { id: duplicate.id, source: id });
    return duplicate;
  };

  const archiveBudget = (id: string) => {
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      let primaryArchived = false;
      const budgets = prev.budgets.map((budget) => {
        if (budget.id === id) {
          primaryArchived = budget.isPrimary;
          return { ...budget, archived: true, isPrimary: false, updatedAt: timestamp };
        }
        return budget;
      });
      if (primaryArchived) {
        const next = budgets.find((budget) => !budget.archived);
        if (next) {
          const withPrimary = budgets.map((budget) =>
            budget.id === next.id
              ? { ...budget, isPrimary: true, updatedAt: timestamp }
              : budget
          );
          return { ...prev, budgets: withPrimary };
        }
      }
      return { ...prev, budgets };
    });
    logInfo('Budget archived', { id });
  };

  const restoreBudget = (id: string) => {
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      const budgets = prev.budgets.map((budget) =>
        budget.id === id
          ? { ...budget, archived: false, updatedAt: timestamp }
          : budget
      );
      if (!budgets.some((budget) => budget.isPrimary)) {
        const next = budgets.find((budget) => !budget.archived);
        if (next) {
          const withPrimary = budgets.map((budget) =>
            budget.id === next.id
              ? { ...budget, isPrimary: true, updatedAt: timestamp }
              : budget
          );
          return { ...prev, budgets: withPrimary };
        }
      }
      return { ...prev, budgets };
    });
    logInfo('Budget restored', { id });
  };

  const deleteBudget = (id: string) => {
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      const removed = prev.budgets.find((budget) => budget.id === id);
      if (!removed) {
        return prev;
      }
      const remainingBudgets = prev.budgets.filter((budget) => budget.id !== id);
      let budgets = remainingBudgets;
      if (removed.isPrimary) {
        const next = remainingBudgets.find((budget) => !budget.archived);
        if (next) {
          budgets = remainingBudgets.map((budget) =>
            budget.id === next.id
              ? { ...budget, isPrimary: true, updatedAt: timestamp }
              : budget
          );
        }
      }
      return {
        ...prev,
        budgets,
        budgetLines: prev.budgetLines.filter((line) => line.budgetId !== id)
      };
    });
    logInfo('Budget deleted', { id });
  };

  const createBudgetLine = (budgetId: string, categoryId: string): BudgetLine | null => {
    if (!state.budgets.some((budget) => budget.id === budgetId)) {
      return null;
    }
    if (!state.categories.some((category) => category.id === categoryId)) {
      return null;
    }
    if (
      state.budgetLines.some(
        (line) => line.budgetId === budgetId && line.categoryId === categoryId
      )
    ) {
      return null;
    }
    const nowIso = new Date().toISOString();
    const maxOrder = state.budgetLines
      .filter((line) => line.budgetId === budgetId)
      .reduce((max, line) => Math.max(max, line.order), -1);
    const line: BudgetLine = {
      id: generateId('bdl'),
      budgetId,
      categoryId,
      mode: 'single',
      plannedAmounts: {},
      subLines: [],
      order: maxOrder + 1,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    updateState((prev) => ({
      ...prev,
      budgetLines: [...prev.budgetLines, line]
    }));
    logInfo('Budget line created', { budgetId, lineId: line.id });
    return line;
  };

  const removeBudgetLine = (id: string) => {
    updateState((prev) => ({
      ...prev,
      budgetLines: prev.budgetLines.filter((line) => line.id !== id)
    }));
    logInfo('Budget line removed', { id });
  };

  const setBudgetLineMode = (id: string, mode: BudgetLineMode) => {
    if (mode !== 'single' && mode !== 'breakdown') return;
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      const index = prev.budgetLines.findIndex((line) => line.id === id);
      if (index === -1) {
        return prev;
      }
      const line = prev.budgetLines[index];
      if (line.mode === mode) {
        return prev;
      }
      const budgetLines = [...prev.budgetLines];
      budgetLines[index] = { ...line, mode, updatedAt: timestamp };
      return { ...prev, budgetLines };
    });
    logInfo('Budget line mode updated', { id, mode });
  };

  const setBudgetLinePlannedAmount = (
    id: string,
    periodKey: string,
    amount: number
  ) => {
    const value = Number(amount);
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      const index = prev.budgetLines.findIndex((line) => line.id === id);
      if (index === -1) {
        return prev;
      }
      const line = prev.budgetLines[index];
      const planned = { ...line.plannedAmounts };
      if (!Number.isFinite(value) || Math.abs(value) < 1e-6) {
        delete planned[periodKey];
      } else {
        planned[periodKey] = value;
      }
      const budgetLines = [...prev.budgetLines];
      budgetLines[index] = { ...line, plannedAmounts: planned, updatedAt: timestamp };
      return { ...prev, budgetLines };
    });
    logInfo('Budget line planned amount set', { id, periodKey, amount: value });
  };

  const reorderBudgetLines = (budgetId: string, orderedIds: string[]) => {
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      const orderMap = new Map<string, number>();
      orderedIds.forEach((lineId, index) => {
        orderMap.set(lineId, index);
      });
      let nextOrder = orderedIds.length;
      let changed = false;
      const budgetLines = prev.budgetLines.map((line) => {
        if (line.budgetId !== budgetId) {
          return line;
        }
        const newOrder = orderMap.has(line.id) ? orderMap.get(line.id)! : nextOrder++;
        if (line.order === newOrder) {
          return line;
        }
        changed = true;
        return { ...line, order: newOrder, updatedAt: timestamp };
      });
      if (!changed) {
        return prev;
      }
      return { ...prev, budgetLines };
    });
    logInfo('Budget lines reordered', { budgetId });
  };

  const createBudgetSubLine = (
    lineId: string,
    subCategoryId: string
  ): BudgetLineSubLine | null => {
    if (!state.subCategories.some((sub) => sub.id === subCategoryId)) {
      return null;
    }
    const parent = state.budgetLines.find((line) => line.id === lineId);
    if (!parent) {
      return null;
    }
    if (parent.subLines.some((sub) => sub.subCategoryId === subCategoryId)) {
      return null;
    }
    const timestamp = new Date().toISOString();
    const subLine: BudgetLineSubLine = {
      id: generateId('bdl-sub'),
      subCategoryId,
      plannedAmounts: {},
      createdAt: timestamp,
      updatedAt: timestamp
    };
    updateState((prev) => {
      const index = prev.budgetLines.findIndex((line) => line.id === lineId);
      if (index === -1) {
        return prev;
      }
      const line = prev.budgetLines[index];
      const budgetLines = [...prev.budgetLines];
      budgetLines[index] = {
        ...line,
        subLines: [...line.subLines, subLine],
        updatedAt: timestamp
      };
      return { ...prev, budgetLines };
    });
    logInfo('Budget sub-line created', { lineId, subLineId: subLine.id });
    return subLine;
  };

  const removeBudgetSubLine = (lineId: string, subLineId: string) => {
    updateState((prev) => {
      const index = prev.budgetLines.findIndex((line) => line.id === lineId);
      if (index === -1) {
        return prev;
      }
      const line = prev.budgetLines[index];
      if (!line.subLines.some((sub) => sub.id === subLineId)) {
        return prev;
      }
      const timestamp = new Date().toISOString();
      const subLines = line.subLines.filter((sub) => sub.id !== subLineId);
      const budgetLines = [...prev.budgetLines];
      budgetLines[index] = { ...line, subLines, updatedAt: timestamp };
      return { ...prev, budgetLines };
    });
    logInfo('Budget sub-line removed', { lineId, subLineId });
  };

  const setBudgetSubLinePlannedAmount = (
    subLineId: string,
    periodKey: string,
    amount: number
  ) => {
    const value = Number(amount);
    const timestamp = new Date().toISOString();
    updateState((prev) => {
      let changed = false;
      const budgetLines = prev.budgetLines.map((line) => {
        const subIndex = line.subLines.findIndex((sub) => sub.id === subLineId);
        if (subIndex === -1) {
          return line;
        }
        const sub = line.subLines[subIndex];
        const planned = { ...sub.plannedAmounts };
        if (!Number.isFinite(value) || Math.abs(value) < 1e-6) {
          delete planned[periodKey];
        } else {
          planned[periodKey] = value;
        }
        const updatedSub: BudgetLineSubLine = {
          ...sub,
          plannedAmounts: planned,
          updatedAt: timestamp
        };
        const subLines = [...line.subLines];
        subLines[subIndex] = updatedSub;
        changed = true;
        return { ...line, subLines, updatedAt: timestamp };
      });
      if (!changed) {
        return prev;
      }
      return { ...prev, budgetLines };
    });
    logInfo('Budget sub-line planned amount set', { subLineId, periodKey, amount: value });
  };

  const createAccountCollection = (
    input: CreateAccountCollectionInput
  ): DataActionError | null => {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      return { title: 'Name required', description: 'Provide a collection name.' };
    }
    const duplicate = state.accountCollections.find(
      (collection) => collection.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate collection',
        description: 'Collection names must be unique.'
      };
    }

    const collection: AccountCollection = {
      id: generateId('col'),
      name: trimmedName,
      description: input.description?.trim() || undefined,
      color: input.color ?? '#2563eb',
      isDemo: false
    };

    updateState((prev) => ({
      ...prev,
      accountCollections: [...prev.accountCollections, collection]
    }));
    logInfo('Account collection created', { id: collection.id });
    return null;
  };

  const updateAccountCollection = (
    id: string,
    input: UpdateAccountCollectionInput
  ): DataActionError | null => {
    const collection = state.accountCollections.find((item) => item.id === id);
    if (!collection) {
      return { title: 'Collection missing', description: 'Select a valid collection.' };
    }

    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.accountCollections.find(
        (item) => item.id !== id && item.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return {
          title: 'Duplicate collection',
          description: 'Collection names must be unique.'
        };
      }
    }

    updateState((prev) => ({
      ...prev,
      accountCollections: prev.accountCollections.map((item) =>
        item.id === id
          ? {
              ...item,
              name: trimmedName ?? item.name,
              description:
                input.description !== undefined
                  ? input.description.trim() || undefined
                  : item.description,
              color: input.color ?? item.color
            }
          : item
      )
    }));
    logInfo('Account collection updated', { id });
    return null;
  };

  const deleteAccountCollection = (id: string) => {
    updateState((prev) => ({
      ...prev,
      accountCollections: prev.accountCollections.filter((collection) => collection.id !== id),
      accounts: prev.accounts.map((acct) => ({
        ...acct,
        collectionIds: acct.collectionIds.filter((collectionId) => collectionId !== id)
      }))
    }));
    logInfo('Account collection deleted', { id });
  };

  const createCategory = (input: CreateCategoryInput): DataActionError | null => {
    const master = MASTER_CATEGORIES.find((mc) => mc.id === input.masterCategoryId);
    if (!master) {
      return { title: 'Invalid master category', description: 'Select a valid master category.' };
    }
    const duplicate = state.categories.find(
      (category) =>
        category.masterCategoryId === input.masterCategoryId &&
        category.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate category',
        description: 'Category names must be unique inside each master category.'
      };
    }

    const category: Category = {
      id: generateId('cat'),
      masterCategoryId: input.masterCategoryId,
      name: input.name.trim(),
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: false
    };

    updateState((prev) => ({ ...prev, categories: [...prev.categories, category] }));
    logInfo('Category created', { id: category.id, masterCategoryId: category.masterCategoryId });
    return null;
  };

  const updateCategory = (id: string, input: UpdateCategoryInput): DataActionError | null => {
    const category = state.categories.find((cat) => cat.id === id);
    if (!category) {
      return { title: 'Category missing', description: 'Select a valid category to update.' };
    }
    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.categories.find(
        (cat) =>
          cat.id !== id &&
          cat.masterCategoryId === category.masterCategoryId &&
          cat.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return {
          title: 'Duplicate category',
          description: 'Choose a unique name within the master category.'
        };
      }
    }

    updateState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === id
          ? {
              ...cat,
              name: trimmedName ?? cat.name,
              previousNames: trimmedName ? [...cat.previousNames, cat.name] : cat.previousNames
            }
          : cat
      )
    }));
    logInfo('Category renamed', { id });
    return null;
  };

  const mergeCategories = (fromId: string, toId: string): DataActionError | null => {
    if (fromId === toId) {
      return { title: 'Invalid merge', description: 'Choose two different categories.' };
    }
    const from = state.categories.find((cat) => cat.id === fromId);
    const to = state.categories.find((cat) => cat.id === toId);
    if (!from || !to) {
      return { title: 'Category missing', description: 'Select valid categories to merge.' };
    }
    if (from.masterCategoryId !== to.masterCategoryId) {
      return {
        title: 'Cross-master merge not allowed',
        description: 'Only categories in the same master category can be merged.'
      };
    }

    updateState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === fromId
          ? { ...cat, archived: true, mergedIntoId: toId }
          : cat
      ),
      subCategories: prev.subCategories.map((sub) =>
        sub.categoryId === fromId ? { ...sub, categoryId: toId } : sub
      ),
      transactions: prev.transactions.map((txn) =>
        txn.categoryId === fromId ? { ...txn, categoryId: toId } : txn
      )
    }));
    logInfo('Categories merged', { fromId, toId });
    return null;
  };

  const archiveCategory = (id: string) => {
    updateState((prev) => ({
      ...prev,
      categories: prev.categories.map((cat) =>
        cat.id === id ? { ...cat, archived: true } : cat
      )
    }));
    logInfo('Category archived', { id });
  };

  const createSubCategory = (input: CreateSubCategoryInput): DataActionError | null => {
    const category = state.categories.find((cat) => cat.id === input.categoryId);
    if (!category) {
      return { title: 'Category missing', description: 'Select a valid category first.' };
    }
    const duplicate = state.subCategories.find(
      (sub) =>
        sub.categoryId === input.categoryId &&
        sub.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate sub-category',
        description: 'Names must be unique inside each category.'
      };
    }

    const subCategory: SubCategory = {
      id: generateId('sub'),
      categoryId: input.categoryId,
      name: input.name.trim(),
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: false
    };

    updateState((prev) => ({ ...prev, subCategories: [...prev.subCategories, subCategory] }));
    logInfo('Sub-category created', { id: subCategory.id, categoryId: subCategory.categoryId });
    return null;
  };

  const updateSubCategory = (
    id: string,
    input: UpdateSubCategoryInput
  ): DataActionError | null => {
    const subCategory = state.subCategories.find((sub) => sub.id === id);
    if (!subCategory) {
      return { title: 'Sub-category missing', description: 'Select a valid sub-category.' };
    }
    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.subCategories.find(
        (sub) =>
          sub.id !== id &&
          sub.categoryId === subCategory.categoryId &&
          sub.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return {
          title: 'Duplicate sub-category',
          description: 'Choose a unique name inside the category.'
        };
      }
    }

    updateState((prev) => ({
      ...prev,
      subCategories: prev.subCategories.map((sub) =>
        sub.id === id
          ? {
              ...sub,
              name: trimmedName ?? sub.name,
              previousNames: trimmedName ? [...sub.previousNames, sub.name] : sub.previousNames
            }
          : sub
      )
    }));
    logInfo('Sub-category updated', { id });
    return null;
  };

  const mergeSubCategories = (fromId: string, toId: string): DataActionError | null => {
    if (fromId === toId) {
      return { title: 'Invalid merge', description: 'Choose two different sub-categories.' };
    }
    const from = state.subCategories.find((sub) => sub.id === fromId);
    const to = state.subCategories.find((sub) => sub.id === toId);
    if (!from || !to) {
      return { title: 'Sub-category missing', description: 'Select valid sub-categories to merge.' };
    }
    if (from.categoryId !== to.categoryId) {
      return {
        title: 'Cross-category merge not allowed',
        description: 'Merge within the same category to preserve reporting.'
      };
    }

    updateState((prev) => ({
      ...prev,
      subCategories: prev.subCategories.map((sub) =>
        sub.id === fromId
          ? { ...sub, archived: true, mergedIntoId: toId }
          : sub
      ),
      transactions: prev.transactions.map((txn) =>
        txn.subCategoryId === fromId ? { ...txn, subCategoryId: toId } : txn
      )
    }));
    logInfo('Sub-categories merged', { fromId, toId });
    return null;
  };

  const archiveSubCategory = (id: string) => {
    updateState((prev) => ({
      ...prev,
      subCategories: prev.subCategories.map((sub) =>
        sub.id === id ? { ...sub, archived: true } : sub
      )
    }));
    logInfo('Sub-category archived', { id });
  };

  const createPayee = (input: CreatePayeeInput): DataActionError | null => {
    if (!input.name.trim()) {
      return { title: 'Payee name required', description: 'Provide a payee or merchant name.' };
    }
    const duplicate = state.payees.find(
      (payee) => payee.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return { title: 'Duplicate payee', description: 'Choose a unique payee name.' };
    }

    const payee: Payee = {
      id: generateId('payee'),
      name: input.name.trim(),
      defaultCategoryId: input.defaultCategoryId,
      defaultSubCategoryId: input.defaultSubCategoryId,
      archived: false,
      isDemo: false
    };

    updateState((prev) => ({ ...prev, payees: [...prev.payees, payee] }));
    logInfo('Payee created', { id: payee.id });
    return null;
  };

  const updatePayee = (id: string, input: UpdatePayeeInput): DataActionError | null => {
    const payee = state.payees.find((p) => p.id === id);
    if (!payee) {
      return { title: 'Payee missing', description: 'Select a valid payee to update.' };
    }
    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.payees.find(
        (p) => p.id !== id && p.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return { title: 'Duplicate payee', description: 'Payee names must be unique.' };
      }
    }

    updateState((prev) => ({
      ...prev,
      payees: prev.payees.map((p) =>
        p.id === id
          ? {
              ...p,
              name: trimmedName ?? p.name,
              defaultCategoryId:
                input.defaultCategoryId !== undefined ? input.defaultCategoryId : p.defaultCategoryId,
              defaultSubCategoryId:
                input.defaultSubCategoryId !== undefined
                  ? input.defaultSubCategoryId
                  : p.defaultSubCategoryId
            }
          : p
      )
    }));
    logInfo('Payee updated', { id });
    return null;
  };

  const archivePayee = (id: string) => {
    updateState((prev) => ({
      ...prev,
      payees: prev.payees.map((payee) =>
        payee.id === id ? { ...payee, archived: true } : payee
      )
    }));
    logInfo('Payee archived', { id });
  };

  const createTag = (input: CreateTagInput): DataActionError | null => {
    if (!input.name.trim()) {
      return { title: 'Tag name required', description: 'Provide a tag name.' };
    }
    const duplicate = state.tags.find(
      (tag) => tag.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return { title: 'Duplicate tag', description: 'Tag names must be unique.' };
    }

    const tag: Tag = {
      id: generateId('tag'),
      name: input.name.trim(),
      color: input.color ?? '#0891b2',
      archived: false,
      isDemo: false
    };

    updateState((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    logInfo('Tag created', { id: tag.id });
    return null;
  };

  const updateTag = (id: string, input: UpdateTagInput): DataActionError | null => {
    const tag = state.tags.find((t) => t.id === id);
    if (!tag) {
      return { title: 'Tag missing', description: 'Select a valid tag to update.' };
    }
    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.tags.find(
        (t) => t.id !== id && t.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return { title: 'Duplicate tag', description: 'Choose a unique tag name.' };
      }
    }

    updateState((prev) => ({
      ...prev,
      tags: prev.tags.map((t) =>
        t.id === id
          ? {
              ...t,
              name: trimmedName ?? t.name,
              color: input.color ?? t.color
            }
          : t
      )
    }));
    logInfo('Tag updated', { id });
    return null;
  };

  const archiveTag = (id: string) => {
    updateState((prev) => ({
      ...prev,
      tags: prev.tags.map((tag) =>
        tag.id === id ? { ...tag, archived: true } : tag
      )
    }));
    logInfo('Tag archived', { id });
  };

  const createRule = (): Rule => {
    const priorities = state.rules.map((rule) => rule.priority);
    const nextPriority = priorities.length ? Math.max(...priorities) + 10 : 10;
    const rule: Rule = {
      id: generateId('rule'),
      name: `New rule ${state.rules.length + 1}`,
      enabled: true,
      priority: nextPriority,
      matchType: 'all',
      conditions: [],
      actions: [],
      archived: false
    };
    updateState((prev) => ({ ...prev, rules: [...prev.rules, rule] }));
    logInfo('Rule created', { id: rule.id });
    return rule;
  };

  const saveRule = (rule: Rule) => {
    updateState((prev) => ({
      ...prev,
      rules: prev.rules.some((existing) => existing.id === rule.id)
        ? prev.rules.map((existing) => (existing.id === rule.id ? { ...rule } : existing))
        : [...prev.rules, { ...rule }]
    }));
    logInfo('Rule saved', { id: rule.id });
  };

  const duplicateRule = (id: string): Rule | null => {
    const original = state.rules.find((rule) => rule.id === id);
    if (!original) {
      return null;
    }
    const priorities = state.rules.map((rule) => rule.priority);
    const nextPriority = priorities.length ? Math.max(...priorities) + 10 : original.priority + 10;
    const cloneConditions = original.conditions.map((condition) => ({
      ...condition,
      id: generateId('cond')
    }));
    const cloneActions = original.actions.map((action) => ({
      ...action,
      id: generateId('act')
    }));
    const duplicate: Rule = {
      ...original,
      id: generateId('rule'),
      name: `${original.name} (Copy)`,
      priority: nextPriority,
      conditions: cloneConditions,
      actions: cloneActions,
      archived: false
    };
    updateState((prev) => ({ ...prev, rules: [...prev.rules, duplicate] }));
    logInfo('Rule duplicated', { id: duplicate.id, sourceId: id });
    return duplicate;
  };

  const setRuleEnabled = (id: string, enabled: boolean) => {
    updateState((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) =>
        rule.id === id ? { ...rule, enabled } : rule
      )
    }));
    logInfo('Rule toggled', { id, enabled });
  };

  const archiveRule = (id: string) => {
    updateState((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) =>
        rule.id === id ? { ...rule, archived: true, enabled: false } : rule
      )
    }));
    logInfo('Rule archived', { id });
  };

  const restoreRule = (id: string) => {
    updateState((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) =>
        rule.id === id ? { ...rule, archived: false, enabled: true } : rule
      )
    }));
    logInfo('Rule restored', { id });
  };

  const previewRuleRun = (transactionIds: string[]): RuleRunPreview => {
    if (transactionIds.length === 0) {
      return { transactionCount: 0, summaries: [] };
    }
    const result = executeRules(state.rules, state.transactions, transactionIds, state);
    return result.preview;
  };

  const runRules = (
    transactionIds: string[],
    mode: 'auto' | 'manual',
    source?: string
  ): RuleRunLogEntry | null => {
    const timestamp = new Date().toISOString();
    if (transactionIds.length === 0) {
      const emptyLog: RuleRunLogEntry = {
        id: generateId('rulelog'),
        runAt: timestamp,
        mode,
        source,
        transactionCount: 0,
        summaries: []
      };
      updateState((prev) => ({
        ...prev,
        ruleLogs: [emptyLog, ...prev.ruleLogs].slice(0, 50)
      }));
      logInfo('Rules executed (no transactions)', { mode, source });
      return emptyLog;
    }

    const result = executeRules(state.rules, state.transactions, transactionIds, state);
    const logEntry: RuleRunLogEntry = {
      id: generateId('rulelog'),
      runAt: timestamp,
      mode,
      source,
      transactionCount: result.preview.transactionCount,
      summaries: result.preview.summaries
    };

    updateState((prev) => {
      const transactionSet = result.updatedTransactions;
      const changed = result.changedTransactionIds;
      const nextTransactions = changed.size
        ? prev.transactions.map((txn) =>
            transactionSet.has(txn.id) && changed.has(txn.id)
              ? { ...transactionSet.get(txn.id)! }
              : txn
          )
        : prev.transactions;
      const nextPayees = result.pendingPayees.length
        ? [...prev.payees, ...result.pendingPayees]
        : prev.payees;
      return {
        ...prev,
        transactions: nextTransactions,
        payees: nextPayees,
        ruleLogs: [logEntry, ...prev.ruleLogs].slice(0, 50)
      };
    });

    logInfo('Rules executed', {
      mode,
      source,
      transactionCount: result.preview.transactionCount
    });

    return logEntry;
  };

  const addTransaction = (txn: Omit<Transaction, 'id'>): Transaction => {
    const transaction: Transaction = {
      ...txn,
      id: generateId('txn'),
      flowOverride: txn.flowOverride ?? null,
      isDemo: txn.isDemo ?? false
    };
    updateState((prev) => ({ ...prev, transactions: [transaction, ...prev.transactions] }));
    logInfo('Transaction created', { id: transaction.id });
    return transaction;
  };

  const updateTransaction = (
    id: string,
    txn: Partial<Transaction>,
    options?: TransactionUpdateOptions
  ) => {
    const user = options?.user ?? 'Manual edit';
    updateState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((existing) => {
        if (existing.id !== id) {
          return existing;
        }
        const entriesSource = options?.auditEntries;
        const resolvedEntries =
          typeof entriesSource === 'function'
            ? entriesSource(existing)
            : entriesSource ?? [];
        const next: Transaction = { ...existing, ...txn };
        if (options?.manual) {
          const fields = resolvedEntries.length
            ? resolvedEntries.map((entry) => entry.field)
            : Object.keys(txn);
          return applyManualMetadata(next, fields, user, resolvedEntries);
        }
        return next;
      })
    }));
    logInfo('Transaction updated', { id });
  };

  const bulkUpdateTransactions = (
    ids: string[],
    txn: Partial<Transaction>,
    options?: TransactionUpdateOptions
  ) => {
    if (ids.length === 0) {
      return;
    }
    const idSet = new Set(ids);
    const user = options?.user ?? 'Bulk edit';
    updateState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((existing) => {
        if (!idSet.has(existing.id)) {
          return existing;
        }
        const entriesSource = options?.auditEntries;
        const resolvedEntries =
          typeof entriesSource === 'function'
            ? entriesSource(existing)
            : entriesSource ?? [];
        const next: Transaction = { ...existing, ...txn };
        if (options?.manual) {
          const fields = resolvedEntries.length
            ? resolvedEntries.map((entry) => entry.field)
            : Object.keys(txn);
          return applyManualMetadata(next, fields, user, resolvedEntries);
        }
        return next;
      })
    }));
    logInfo('Transactions bulk updated', { count: ids.length });
  };

  const splitTransaction = (
    id: string,
    lines: TransactionSplitLineInput[],
    user = 'Manual split'
  ): DataActionError | null => {
    if (lines.length < 2) {
      return {
        title: 'Two or more lines required',
        description: 'Provide at least two split lines to replace the transaction.'
      };
    }

    let error: DataActionError | null = null;

    updateState((prev) => {
      const index = prev.transactions.findIndex((txn) => txn.id === id);
      if (index === -1) {
        error = {
          title: 'Transaction not found',
          description: 'The transaction you are trying to split no longer exists.'
        };
        return prev;
      }

      const original = prev.transactions[index];
      const total = lines.reduce((sum, line) => sum + line.amount, 0);
      const tolerance = Math.max(Math.abs(original.amount) * 0.0001, 0.01);
      if (Math.abs(total - original.amount) > tolerance) {
        error = {
          title: 'Split total mismatch',
          description: 'Split amounts must add up to the original transaction amount.'
        };
        return prev;
      }

      const before = prev.transactions.slice(0, index);
      const after = prev.transactions.slice(index + 1);
      const workspaceSource = readWorkspaceMetadata(original.metadata);

      const manualFieldsBase: string[] = ['split'];

      const createdTransactions = lines.map((line, lineIndex) => {
        const manualFields = [...manualFieldsBase];
        if (line.categoryId !== undefined || line.subCategoryId !== undefined) {
          manualFields.push('category');
        }
        if (line.payeeId !== undefined) {
          manualFields.push('payee');
        }
        if (line.tags !== undefined) {
          manualFields.push('tags');
        }
        if (line.memo !== undefined) {
          manualFields.push('memo');
        }

        const child: Transaction = {
          ...original,
          id: generateId('txn'),
          amount: line.amount,
          nativeAmount: line.amount,
          memo: line.memo ?? original.memo,
          description: line.description ?? original.description,
          categoryId: line.categoryId ?? original.categoryId,
          subCategoryId: line.subCategoryId ?? original.subCategoryId,
          payeeId: line.payeeId ?? original.payeeId,
          tags: line.tags ? [...line.tags] : [...original.tags],
          metadata: mergeWorkspaceMetadata(line.metadata ?? original.metadata, {
            ...workspaceSource,
            splitParentId: original.id,
            splitIndex: lineIndex,
            splitTotal: lines.length
          })
        };

        const auditEntries: { field: string; previous?: string | null; next?: string | null }[] = [
          {
            field: 'split',
            previous: original.amount.toString(),
            next: line.amount.toString()
          }
        ];

        if (line.categoryId !== undefined || line.subCategoryId !== undefined) {
          auditEntries.push({
            field: 'category',
            previous: original.categoryId ?? null,
            next: child.categoryId ?? null
          });
          if (child.subCategoryId || original.subCategoryId) {
            auditEntries.push({
              field: 'subCategory',
              previous: original.subCategoryId ?? null,
              next: child.subCategoryId ?? null
            });
          }
        }

        if (line.payeeId !== undefined) {
          auditEntries.push({
            field: 'payee',
            previous: original.payeeId ?? null,
            next: child.payeeId ?? null
          });
        }

        if (line.tags !== undefined) {
          auditEntries.push({
            field: 'tags',
            previous: original.tags.join(',') || null,
            next: child.tags.join(',') || null
          });
        }

        if (line.memo !== undefined) {
          auditEntries.push({
            field: 'memo',
            previous: original.memo ?? null,
            next: child.memo ?? null
          });
        }

        return applyManualMetadata(child, manualFields, user, auditEntries);
      });

      logInfo('Transaction split', { id, count: createdTransactions.length });

      return {
        ...prev,
        transactions: [...before, ...createdTransactions, ...after]
      };
    });

    return error;
  };

  const archiveTransaction = (id: string) => {
    updateState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((txn) => txn.id !== id)
    }));
    logInfo('Transaction removed', { id });
  };

  const updateBaseCurrency = (currency: CurrencyCode) => {
    const normalized = currency.trim().toUpperCase();
    if (!normalized) return;
    updateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        baseCurrency: normalized,
        exchangeRates: prev.settings.exchangeRates.some(
          (rate) => rate.currency.toUpperCase() === normalized
        )
          ? prev.settings.exchangeRates
          : [...prev.settings.exchangeRates, { currency: normalized, rateToBase: 1 }]
      }
    }));
    logInfo('Base currency updated', { currency: normalized });
  };

  const upsertExchangeRate = (currency: CurrencyCode, rate: number): DataActionError | null => {
    const normalized = currency.trim().toUpperCase();
    if (!normalized) {
      return { title: 'Currency required', description: 'Enter a valid currency code.' };
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      return { title: 'Invalid rate', description: 'Exchange rates must be positive numbers.' };
    }

    updateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        exchangeRates: prev.settings.exchangeRates.some(
          (entry) => entry.currency.toUpperCase() === normalized
        )
          ? prev.settings.exchangeRates.map((entry) =>
              entry.currency.toUpperCase() === normalized
                ? { currency: normalized, rateToBase: rate }
                : entry
            )
          : [...prev.settings.exchangeRates, { currency: normalized, rateToBase: rate }],
        lastExchangeRateUpdate: new Date().toISOString()
      }
    }));
    logInfo('Exchange rate saved', { currency: normalized, rate });
    return null;
  };

  const removeExchangeRate = (currency: CurrencyCode) => {
    const normalized = currency.trim().toUpperCase();
    if (!normalized) return;
    updateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        exchangeRates: prev.settings.exchangeRates.filter(
          (entry) =>
            entry.currency.toUpperCase() !== normalized ||
            normalized === prev.settings.baseCurrency
        )
      }
    }));
    logInfo('Exchange rate removed', { currency: normalized });
  };

  const updateImportDefaults = (defaults: ImportDefaults) => {
    updateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        importDefaults: { ...prev.settings.importDefaults, ...defaults }
      }
    }));
    logInfo('Import defaults updated');
  };

  const saveImportProfile = (input: SaveImportProfileInput): ImportProfile => {
    const id = input.id ?? generateId('profile');
    const profile: ImportProfile = {
      id,
      name: input.name,
      headerFingerprint: input.headerFingerprint,
      fieldMapping: input.fieldMapping,
      format: input.format,
      transforms: input.transforms ?? {},
      updatedAt: new Date().toISOString()
    };

    updateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        importProfiles: prev.settings.importProfiles.some((existing) => existing.id === id)
          ? prev.settings.importProfiles.map((existing) =>
              existing.id === id ? profile : existing
            )
          : [...prev.settings.importProfiles, profile]
      }
    }));
    logInfo('Import profile saved', { id, name: profile.name });
    return profile;
  };

  const deleteImportProfile = (id: string) => {
    updateState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        importProfiles: prev.settings.importProfiles.filter((profile) => profile.id !== id)
      }
    }));
    logInfo('Import profile removed', { id });
  };

  const createImportBatch = (input: CreateImportBatchInput): ImportBatch => {
    const batch: ImportBatch = { ...input, id: input.id ?? generateId('imp') };
    updateState((prev) => ({
      ...prev,
      importBatches: [batch, ...prev.importBatches]
    }));
    logInfo('Import batch recorded', { id: batch.id, accountId: batch.accountId });
    return batch;
  };

  const undoLastImport = () => {
    const latest = state.importBatches[0];
    if (!latest) return;
    updateState((prev) => {
      const [head, ...rest] = prev.importBatches;
      if (!head) {
        return prev;
      }
      const remainingTransactions = prev.transactions.filter(
        (txn) => txn.importBatchId !== head.id
      );
      const adjustmentByAccount = new Map<string, number>();
      prev.transactions.forEach((txn) => {
        if (txn.importBatchId === head.id) {
          const current = adjustmentByAccount.get(txn.accountId) ?? 0;
          adjustmentByAccount.set(txn.accountId, current + txn.amount);
        }
      });
      const accounts = prev.accounts.map((acct) => {
        const adjustment = adjustmentByAccount.get(acct.id);
        if (!adjustment) return acct;
        return { ...acct, currentBalance: acct.currentBalance - adjustment };
      });
      return {
        ...prev,
        transactions: remainingTransactions,
        accounts,
        importBatches: rest
      };
    });
    logInfo('Import batch undone', { id: latest.id });
  };

  const clearDemoTransactionsForAccount = (accountId: string) => {
    updateState((prev) => {
      const demoSum = prev.transactions
        .filter((txn) => txn.accountId === accountId && txn.isDemo)
        .reduce((sum, txn) => sum + txn.amount, 0);
      return {
        ...prev,
        transactions: prev.transactions.filter(
          (txn) => !(txn.accountId === accountId && txn.isDemo)
        ),
        accounts: prev.accounts.map((acct) =>
          acct.id === accountId
            ? { ...acct, currentBalance: acct.currentBalance - demoSum }
            : acct
        ),
        importBatches: prev.importBatches.filter(
          (batch) => !(batch.accountId === accountId && batch.isDemo)
        )
      };
    });
    logInfo('Demo transactions cleared', { accountId });
  };

  const loadDemoData = () => {
    const demo = buildDemoOnlyData();
    updateState((prev) => ({
      ...prev,
      masterCategories: MASTER_CATEGORIES,
      categories: [...prev.categories, ...demo.categories],
      subCategories: [...prev.subCategories, ...demo.subCategories],
      accounts: [...prev.accounts, ...demo.accounts],
      accountCollections: [...prev.accountCollections, ...demo.accountCollections],
      providerDirectory: Array.from(
        new Map(
          [...prev.providerDirectory, ...demo.providerDirectory].map((name) => [
            name.toLocaleLowerCase(),
            name
          ])
        ).values()
      ).sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())),
      payees: [...prev.payees, ...demo.payees],
      tags: [...prev.tags, ...demo.tags],
      transactions: [...demo.transactions, ...prev.transactions],
      budgets: [...prev.budgets, ...demo.budgets],
      budgetLines: [...prev.budgetLines, ...demo.budgetLines],
      settings: {
        ...prev.settings,
        exchangeRates: demo.settings.exchangeRates.reduce((acc, rate) => {
          if (!acc.some((entry) => entry.currency.toUpperCase() === rate.currency.toUpperCase())) {
            acc.push(rate);
          }
          return acc;
        }, [...prev.settings.exchangeRates]),
        importProfiles: prev.settings.importProfiles
      }
    }));
    logInfo('Demo data loaded');
  };

  const clearDemoData = () => {
    const demoProviders = new Set(
      buildDemoOnlyData()
        .providerDirectory.map((name) => name.toLocaleLowerCase())
    );
    updateState((prev) => ({
      ...prev,
      categories: prev.categories.filter((cat) => !cat.isDemo),
      subCategories: prev.subCategories.filter((sub) => !sub.isDemo),
      accountCollections: prev.accountCollections.filter((collection) => !collection.isDemo),
      accounts: prev.accounts
        .filter((acct) => !acct.isDemo)
        .map((acct) => ({
          ...acct,
          collectionIds: acct.collectionIds.filter((collectionId) =>
            prev.accountCollections.some(
              (collection) => !collection.isDemo && collection.id === collectionId
            )
          )
        })),
      providerDirectory: prev.providerDirectory.filter((name) => {
        const normalized = name.toLocaleLowerCase();
        if (!demoProviders.has(normalized)) return true;
        return prev.accounts.some(
          (acct) => !acct.isDemo && acct.provider.toLocaleLowerCase() === normalized
        );
      }),
      payees: prev.payees.filter((payee) => !payee.isDemo),
      tags: prev.tags.filter((tag) => !tag.isDemo),
      transactions: prev.transactions.filter((txn) => !txn.isDemo),
      importBatches: prev.importBatches.filter((batch) => !batch.isDemo)
    }));
    logInfo('Demo data cleared');
  };

  const value = useMemo<DataContextValue>(
    () => ({
      state,
      masterCategories: MASTER_CATEGORIES,
      recordProviderName,
      createAccount,
      updateAccount,
      archiveAccount,
      unarchiveAccount,
      setAccountInclusion,
      setCollectionsForAccount,
      createBudget,
      updateBudget,
      setPrimaryBudget,
      duplicateBudget,
      archiveBudget,
      restoreBudget,
      deleteBudget,
      createBudgetLine,
      removeBudgetLine,
      setBudgetLineMode,
      setBudgetLinePlannedAmount,
      reorderBudgetLines,
      createBudgetSubLine,
      removeBudgetSubLine,
      setBudgetSubLinePlannedAmount,
      createAccountCollection,
      updateAccountCollection,
      deleteAccountCollection,
      createCategory,
      updateCategory,
      mergeCategories,
      archiveCategory,
      createSubCategory,
      updateSubCategory,
      mergeSubCategories,
      archiveSubCategory,
      createPayee,
      updatePayee,
      archivePayee,
      createTag,
      updateTag,
      archiveTag,
      addTransaction,
      updateTransaction,
      bulkUpdateTransactions,
      splitTransaction,
      archiveTransaction,
      updateBaseCurrency,
      upsertExchangeRate,
      removeExchangeRate,
      updateImportDefaults,
      saveImportProfile,
      deleteImportProfile,
      createImportBatch,
      undoLastImport,
      clearDemoTransactionsForAccount,
      loadDemoData,
      clearDemoData,
      createRule,
      saveRule,
      duplicateRule,
      setRuleEnabled,
      archiveRule,
      restoreRule,
      previewRuleRun,
      runRules
    }),
    [state]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

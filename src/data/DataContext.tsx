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
  SettingsState,
  SubCategory,
  Tag,
  Transaction
} from './models';
import { buildDemoOnlyData, buildInitialState, MASTER_CATEGORIES } from './demoData';
import { generateId } from '../utils/id';
import { logError, logInfo } from '../utils/logger';

const STORAGE_KEY = 'sleekfinance.stage3.data';

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
      metadata: txn.metadata ?? undefined
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
    transactions,
    importBatches: state.importBatches ?? [],
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
  updateTransaction: (id: string, txn: Partial<Transaction>) => void;
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

  const addTransaction = (txn: Omit<Transaction, 'id'>): Transaction => {
    const transaction: Transaction = {
      ...txn,
      id: generateId('txn'),
      isDemo: txn.isDemo ?? false
    };
    updateState((prev) => ({ ...prev, transactions: [transaction, ...prev.transactions] }));
    logInfo('Transaction created', { id: transaction.id });
    return transaction;
  };

  const updateTransaction = (id: string, txn: Partial<Transaction>) => {
    updateState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((existing) =>
        existing.id === id ? { ...existing, ...txn } : existing
      )
    }));
    logInfo('Transaction updated', { id });
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
      clearDemoData
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

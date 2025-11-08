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
  AccountGroup,
  AccountGroupType,
  Category,
  CurrencyCode,
  DataActionError,
  DataState,
  ImportBatch,
  ImportDefaults,
  ImportFormatOptions,
  ImportProfile,
  InclusionMode,
  Institution,
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

  const accounts = state.accounts.map((account) => ({
    ...account,
    currency: account.currency ?? mergedSettings.baseCurrency
  }));

  const accountCurrency = new Map<string, CurrencyCode>(
    accounts.map((account) => [account.id, account.currency])
  );

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

  return {
    ...state,
    accounts,
    transactions,
    importBatches: state.importBatches ?? [],
    settings: mergedSettings
  };
};

type CreateInstitutionInput = {
  name: string;
  type: Institution['type'];
  website?: string;
};

type UpdateInstitutionInput = Partial<CreateInstitutionInput>;

type CreateAccountInput = {
  institutionId: string;
  name: string;
  type: Account['type'];
  currency: CurrencyCode;
  openingBalance: number;
  openingBalanceDate: string;
  includeInTotals: boolean;
  includeOnlyGroupIds: string[];
  excludeGroupId: string | null;
  notes?: string;
  currentBalance?: number;
};

type UpdateAccountInput = Partial<CreateAccountInput> & {
  includeInTotals?: boolean;
};

type CreateAccountGroupInput = {
  name: string;
  type: AccountGroupType;
  description?: string;
  color?: string;
  accountIds: string[];
};

type UpdateAccountGroupInput = Partial<CreateAccountGroupInput>;

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
  createInstitution: (input: CreateInstitutionInput) => DataActionError | null;
  updateInstitution: (id: string, input: UpdateInstitutionInput) => DataActionError | null;
  archiveInstitution: (id: string) => void;
  createAccount: (input: CreateAccountInput) => DataActionError | null;
  updateAccount: (id: string, input: UpdateAccountInput) => DataActionError | null;
  archiveAccount: (id: string) => void;
  setAccountInclusion: (id: string, mode: InclusionMode) => DataActionError | null;
  updateAccountGroupsForAccount: (
    accountId: string,
    includeOnlyGroupIds: string[],
    excludeGroupId: string | null
  ) => DataActionError | null;
  createAccountGroup: (input: CreateAccountGroupInput) => DataActionError | null;
  updateAccountGroup: (id: string, input: UpdateAccountGroupInput) => DataActionError | null;
  archiveAccountGroup: (id: string) => void;
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

  const createInstitution = (input: CreateInstitutionInput): DataActionError | null => {
    if (!input.name.trim()) {
      return { title: 'Institution name required', description: 'Provide a unique name.' };
    }

    const duplicate = state.institutions.find(
      (inst) => inst.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate institution',
        description: 'Another institution already uses that name.'
      };
    }

    const institution: Institution = {
      id: generateId('inst'),
      name: input.name.trim(),
      type: input.type,
      website: input.website,
      archived: false,
      createdAt: new Date().toISOString(),
      isDemo: false
    };

    updateState((prev) => ({ ...prev, institutions: [...prev.institutions, institution] }));
    logInfo('Institution created', { id: institution.id, name: institution.name });
    return null;
  };

  const updateInstitution = (
    id: string,
    input: UpdateInstitutionInput
  ): DataActionError | null => {
    const institution = state.institutions.find((inst) => inst.id === id);
    if (!institution) {
      return { title: 'Institution not found', description: 'Refresh and try again.' };
    }
    if (input.name) {
      const duplicate = state.institutions.find(
        (inst) =>
          inst.id !== id && inst.name.toLocaleLowerCase() === input.name?.trim().toLocaleLowerCase()
      );
      if (duplicate) {
        return {
          title: 'Duplicate institution',
          description: 'Another institution already uses that name.'
        };
      }
    }

    updateState((prev) => ({
      ...prev,
      institutions: prev.institutions.map((inst) =>
        inst.id === id
          ? {
              ...inst,
              name: input.name ? input.name.trim() : inst.name,
              type: input.type ?? inst.type,
              website: input.website ?? inst.website
            }
          : inst
      )
    }));
    logInfo('Institution updated', { id });
    return null;
  };

  const archiveInstitution = (id: string) => {
    updateState((prev) => ({
      ...prev,
      institutions: prev.institutions.map((inst) =>
        inst.id === id ? { ...inst, archived: true } : inst
      ),
      accounts: prev.accounts.map((acct) =>
        acct.institutionId === id ? { ...acct, archived: true } : acct
      )
    }));
    logInfo('Institution archived', { id });
  };

  const createAccount = (input: CreateAccountInput): DataActionError | null => {
    const institution = state.institutions.find((inst) => inst.id === input.institutionId);
    if (!institution) {
      return { title: 'Institution missing', description: 'Select a valid institution first.' };
    }

    if (!input.currency.trim()) {
      return { title: 'Currency required', description: 'Choose a currency for the account.' };
    }

    const duplicate = state.accounts.find(
      (acct) =>
        acct.institutionId === input.institutionId &&
        acct.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return {
        title: 'Duplicate account',
        description: 'Another account at this institution uses that name.'
      };
    }

    const dateError = validateOpeningBalanceDate(input.openingBalanceDate);
    if (dateError) return dateError;

    if (!input.includeInTotals && input.includeOnlyGroupIds.length > 0) {
      return {
        title: 'Invalid inclusion configuration',
        description: 'Excluded accounts cannot belong to include-only groups.'
      };
    }

    if (input.excludeGroupId && input.includeOnlyGroupIds.length > 0) {
      return {
        title: 'Conflicting groups',
        description: 'Accounts cannot be in include-only and exclude groups at the same time.'
      };
    }

    const account: Account = {
      id: generateId('acct'),
      institutionId: input.institutionId,
      name: input.name.trim(),
      type: input.type,
      currency: input.currency.trim().toUpperCase(),
      includeInTotals: input.includeInTotals,
      includeOnlyGroupIds: [...input.includeOnlyGroupIds],
      excludeGroupId: input.excludeGroupId,
      openingBalance: input.openingBalance,
      openingBalanceDate: input.openingBalanceDate,
      currentBalance: input.currentBalance ?? input.openingBalance,
      archived: false,
      notes: input.notes,
      isDemo: false
    };

    updateState((prev) => ({
      ...prev,
      accounts: [...prev.accounts, account],
      accountGroups: prev.accountGroups.map((group) =>
        group.accountIds.includes(account.id)
          ? group
          : {
              ...group,
              accountIds:
                input.excludeGroupId === group.id || input.includeOnlyGroupIds.includes(group.id)
                  ? [...group.accountIds, account.id]
                  : group.accountIds
            }
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

    logInfo('Account created', { id: account.id, institutionId: account.institutionId });
    return null;
  };

  const updateAccount = (id: string, input: UpdateAccountInput): DataActionError | null => {
    const account = state.accounts.find((acct) => acct.id === id);
    if (!account) {
      return { title: 'Account missing', description: 'The referenced account no longer exists.' };
    }

    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.accounts.find(
        (acct) =>
          acct.id !== id &&
          acct.institutionId === (input.institutionId ?? account.institutionId) &&
          acct.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return { title: 'Duplicate account', description: 'Pick a unique name for this institution.' };
      }
    }

    if (input.openingBalanceDate) {
      const dateError = validateOpeningBalanceDate(input.openingBalanceDate);
      if (dateError) return dateError;
    }

    const includeOnlyGroupIds = input.includeOnlyGroupIds ?? account.includeOnlyGroupIds;
    const excludeGroupId =
      input.excludeGroupId !== undefined ? input.excludeGroupId : account.excludeGroupId;
    const includeInTotals = input.includeInTotals ?? account.includeInTotals;

    if (!includeInTotals && includeOnlyGroupIds.length > 0) {
      return {
        title: 'Invalid inclusion configuration',
        description: 'Excluded accounts cannot belong to include-only groups.'
      };
    }

    if (excludeGroupId && includeOnlyGroupIds.length > 0) {
      return {
        title: 'Conflicting groups',
        description: 'Accounts cannot be in include-only and exclude groups simultaneously.'
      };
    }

    const currency = input.currency ? input.currency.trim().toUpperCase() : account.currency;

    updateState((prev) => {
      const updatedAccounts = prev.accounts.map((acct) =>
        acct.id === id
          ? {
              ...acct,
              ...input,
              currency,
              name: trimmedName ?? acct.name,
              includeOnlyGroupIds,
              excludeGroupId,
              includeInTotals,
              openingBalanceDate: input.openingBalanceDate ?? acct.openingBalanceDate,
              currentBalance: input.currentBalance ?? acct.currentBalance
            }
          : acct
      );

      const accountGroups = prev.accountGroups.map((group) => {
        if (group.type === 'include') {
          const shouldContain = includeOnlyGroupIds.includes(group.id);
          const hasAccount = group.accountIds.includes(id);
          if (shouldContain && !hasAccount) {
            return { ...group, accountIds: [...group.accountIds, id] };
          }
          if (!shouldContain && hasAccount) {
            return { ...group, accountIds: group.accountIds.filter((acctId) => acctId !== id) };
          }
        }
        if (group.type === 'exclude') {
          const shouldContain = excludeGroupId === group.id;
          const hasAccount = group.accountIds.includes(id);
          if (shouldContain && !hasAccount) {
            return { ...group, accountIds: [...group.accountIds, id] };
          }
          if (!shouldContain && hasAccount) {
            return { ...group, accountIds: group.accountIds.filter((acctId) => acctId !== id) };
          }
        }
        return group;
      });

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

      return {
        ...prev,
        accounts: updatedAccounts,
        accountGroups,
        transactions,
        settings: { ...prev.settings, exchangeRates }
      };
    });
    logInfo('Account updated', { id });
    return null;
  };

  const archiveAccount = (id: string) => {
    updateState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acct) => (acct.id === id ? { ...acct, archived: true } : acct)),
      accountGroups: prev.accountGroups.map((group) => ({
        ...group,
        accountIds: group.accountIds.filter((acctId) => acctId !== id)
      }))
    }));
    logInfo('Account archived', { id });
  };

  const setAccountInclusion = (id: string, mode: InclusionMode): DataActionError | null => {
    const account = state.accounts.find((acct) => acct.id === id);
    if (!account) {
      return { title: 'Account missing', description: 'Select a valid account.' };
    }
    if (mode === 'excluded' && account.includeOnlyGroupIds.length > 0) {
      return {
        title: 'Cannot exclude',
        description: 'Remove the account from include-only groups before excluding totals.'
      };
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

  const updateAccountGroupsForAccount = (
    accountId: string,
    includeOnlyGroupIds: string[],
    excludeGroupId: string | null
  ): DataActionError | null => {
    const account = state.accounts.find((acct) => acct.id === accountId);
    if (!account) {
      return { title: 'Account missing', description: 'Select a valid account first.' };
    }
    if (!account.includeInTotals && includeOnlyGroupIds.length > 0) {
      return {
        title: 'Invalid configuration',
        description: 'Excluded accounts cannot belong to include-only groups.'
      };
    }
    if (excludeGroupId && includeOnlyGroupIds.length > 0) {
      return {
        title: 'Conflicting groups',
        description: 'Accounts cannot belong to include and exclude groups simultaneously.'
      };
    }

    updateState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acct) =>
        acct.id === accountId
          ? { ...acct, includeOnlyGroupIds: [...includeOnlyGroupIds], excludeGroupId }
          : acct
      ),
      accountGroups: prev.accountGroups.map((group) => {
        const shouldContain =
          group.type === 'include'
            ? includeOnlyGroupIds.includes(group.id)
            : excludeGroupId === group.id;
        const hasAccount = group.accountIds.includes(accountId);
        if (shouldContain && !hasAccount) {
          return { ...group, accountIds: [...group.accountIds, accountId] };
        }
        if (!shouldContain && hasAccount) {
          return { ...group, accountIds: group.accountIds.filter((idValue) => idValue !== accountId) };
        }
        return group;
      })
    }));
    logInfo('Account group membership updated', { accountId });
    return null;
  };

  const createAccountGroup = (input: CreateAccountGroupInput): DataActionError | null => {
    if (!input.name.trim()) {
      return { title: 'Name required', description: 'Provide a group name.' };
    }
    const duplicate = state.accountGroups.find(
      (group) => group.name.toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
    );
    if (duplicate) {
      return { title: 'Duplicate group', description: 'Account group names must be unique.' };
    }
    if (input.type === 'exclude' && input.accountIds.length > 1) {
      const invalid = input.accountIds.some((accountId) => {
        const account = state.accounts.find((acct) => acct.id === accountId);
        return account?.includeOnlyGroupIds.length;
      });
      if (invalid) {
        return {
          title: 'Conflicting membership',
          description: 'Remove include-only memberships before assigning to an exclude group.'
        };
      }
    }

    const group: AccountGroup = {
      id: generateId('grp'),
      name: input.name.trim(),
      type: input.type,
      description: input.description,
      color: input.color ?? (input.type === 'include' ? '#2563eb' : '#dc2626'),
      accountIds: [...input.accountIds],
      archived: false,
      isDemo: false
    };

    updateState((prev) => ({
      ...prev,
      accountGroups: [...prev.accountGroups, group],
      accounts: prev.accounts.map((acct) => {
        if (!group.accountIds.includes(acct.id)) return acct;
        if (group.type === 'include') {
          return {
            ...acct,
            includeOnlyGroupIds: Array.from(new Set([...acct.includeOnlyGroupIds, group.id]))
          };
        }
        return {
          ...acct,
          excludeGroupId: group.id
        };
      })
    }));
    logInfo('Account group created', { id: group.id, type: group.type });
    return null;
  };

  const updateAccountGroup = (
    id: string,
    input: UpdateAccountGroupInput
  ): DataActionError | null => {
    const group = state.accountGroups.find((g) => g.id === id);
    if (!group) {
      return { title: 'Group missing', description: 'Select a valid account group.' };
    }
    const trimmedName = input.name?.trim();
    if (trimmedName) {
      const duplicate = state.accountGroups.find(
        (g) => g.id !== id && g.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()
      );
      if (duplicate) {
        return { title: 'Duplicate group', description: 'Choose a unique group name.' };
      }
    }

    if (group.type === 'exclude' && input.accountIds) {
      const invalid = input.accountIds.some((accountId) => {
        const account = state.accounts.find((acct) => acct.id === accountId);
        return (account?.includeOnlyGroupIds.length ?? 0) > 0;
      });
      if (invalid) {
        return {
          title: 'Conflicting membership',
          description: 'Remove include-only memberships before assigning accounts to an exclude group.'
        };
      }
    }

    if (group.type === 'include' && input.accountIds) {
      const invalid = input.accountIds.some((accountId) => {
        const account = state.accounts.find((acct) => acct.id === accountId);
        return account ? !account.includeInTotals : false;
      });
      if (invalid) {
        return {
          title: 'Excluded account',
          description: 'Only accounts included in totals can be part of include-only groups.'
        };
      }
    }

    updateState((prev) => {
      const nextAccountIds = input.accountIds ? [...input.accountIds] : group.accountIds;
      const nextGroups = prev.accountGroups.map((existing) =>
        existing.id === id
          ? {
              ...existing,
              name: trimmedName ?? existing.name,
              description: input.description ?? existing.description,
              color: input.color ?? existing.color,
              accountIds: nextAccountIds
            }
          : existing
      );

      const nextAccounts = prev.accounts.map((acct) => {
        if (group.type === 'include') {
          const shouldContain = nextAccountIds.includes(acct.id);
          const has = acct.includeOnlyGroupIds.includes(id);
          if (shouldContain && !has) {
            return {
              ...acct,
              includeOnlyGroupIds: [...acct.includeOnlyGroupIds, id],
              excludeGroupId: acct.excludeGroupId === id ? null : acct.excludeGroupId
            };
          }
          if (!shouldContain && has) {
            return {
              ...acct,
              includeOnlyGroupIds: acct.includeOnlyGroupIds.filter((groupId) => groupId !== id)
            };
          }
        } else {
          const shouldContain = nextAccountIds.includes(acct.id);
          if (shouldContain && acct.excludeGroupId !== id) {
            return {
              ...acct,
              excludeGroupId: id,
              includeOnlyGroupIds: acct.includeOnlyGroupIds.filter((groupId) => groupId !== id)
            };
          }
          if (!shouldContain && acct.excludeGroupId === id) {
            return { ...acct, excludeGroupId: null };
          }
        }
        return acct;
      });

      const synchronizedGroups = nextGroups.map((existing) => {
        if (existing.type === 'include') {
          return {
            ...existing,
            accountIds: existing.accountIds.filter((acctId) => {
              const account = nextAccounts.find((acct) => acct.id === acctId);
              return account ? account.includeOnlyGroupIds.includes(existing.id) : false;
            })
          };
        }
        return {
          ...existing,
          accountIds: existing.accountIds.filter((acctId) => {
            const account = nextAccounts.find((acct) => acct.id === acctId);
            return account ? account.excludeGroupId === existing.id : false;
          })
        };
      });

      return { ...prev, accountGroups: synchronizedGroups, accounts: nextAccounts };
    });
    logInfo('Account group updated', { id });
    return null;
  };

  const archiveAccountGroup = (id: string) => {
    updateState((prev) => ({
      ...prev,
      accountGroups: prev.accountGroups.map((group) =>
        group.id === id ? { ...group, archived: true, accountIds: [] } : group
      ),
      accounts: prev.accounts.map((acct) => {
        if (acct.includeOnlyGroupIds.includes(id)) {
          return {
            ...acct,
            includeOnlyGroupIds: acct.includeOnlyGroupIds.filter((groupId) => groupId !== id)
          };
        }
        if (acct.excludeGroupId === id) {
          return { ...acct, excludeGroupId: null };
        }
        return acct;
      })
    }));
    logInfo('Account group archived', { id });
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
      institutions: [...prev.institutions, ...demo.institutions],
      accounts: [...prev.accounts, ...demo.accounts],
      accountGroups: [...prev.accountGroups, ...demo.accountGroups],
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
    updateState((prev) => ({
      ...prev,
      categories: prev.categories.filter((cat) => !cat.isDemo),
      subCategories: prev.subCategories.filter((sub) => !sub.isDemo),
      institutions: prev.institutions.filter((inst) => !inst.isDemo),
      accounts: prev.accounts.filter((acct) => !acct.isDemo),
      accountGroups: prev.accountGroups.filter((group) => !group.isDemo),
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
      createInstitution,
      updateInstitution,
      archiveInstitution,
      createAccount,
      updateAccount,
      archiveAccount,
      setAccountInclusion,
      updateAccountGroupsForAccount,
      createAccountGroup,
      updateAccountGroup,
      archiveAccountGroup,
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

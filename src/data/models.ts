export type InclusionMode = 'included' | 'excluded';

export type CurrencyCode = string;

export type MasterCategory = {
  id: string;
  name: string;
  description: string;
};

export type Category = {
  id: string;
  masterCategoryId: string;
  name: string;
  archived: boolean;
  previousNames: string[];
  mergedIntoId: string | null;
  isDemo: boolean;
};

export type SubCategory = {
  id: string;
  categoryId: string;
  name: string;
  archived: boolean;
  previousNames: string[];
  mergedIntoId: string | null;
  isDemo: boolean;
};

export type Account = {
  id: string;
  provider: string;
  name: string;
  accountNumber?: string;
  type: 'checking' | 'savings' | 'credit' | 'loan' | 'investment' | 'cash';
  currency: CurrencyCode;
  includeInTotals: boolean;
  collectionIds: string[];
  openingBalance: number;
  openingBalanceDate: string;
  currentBalance: number;
  archived: boolean;
  notes?: string;
  isDemo: boolean;
};

export type AccountCollection = {
  id: string;
  name: string;
  description?: string;
  color: string;
  isDemo: boolean;
};

export type BudgetPeriodType = 'weekly' | 'monthly' | 'annual' | 'uk-fiscal';

export type BudgetInclusionMode = 'all' | 'collections';

export type Budget = {
  id: string;
  name: string;
  periodType: BudgetPeriodType;
  anchorDate: string;
  startMonth?: number;
  startYear?: number;
  startDayOfWeek?: number;
  includeMode: BudgetInclusionMode;
  collectionIds: string[];
  rolloverEnabled: boolean;
  isPrimary: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BudgetLineMode = 'single' | 'breakdown';

export type BudgetLineSubLine = {
  id: string;
  subCategoryId: string;
  plannedAmounts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

export type BudgetLine = {
  id: string;
  budgetId: string;
  categoryId: string;
  mode: BudgetLineMode;
  plannedAmounts: Record<string, number>;
  subLines: BudgetLineSubLine[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type Payee = {
  id: string;
  name: string;
  defaultCategoryId: string | null;
  defaultSubCategoryId: string | null;
  archived: boolean;
  isDemo: boolean;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  isDemo: boolean;
};

export type Transaction = {
  id: string;
  accountId: string;
  payeeId: string | null;
  date: string;
  amount: number;
  currency: CurrencyCode;
  nativeAmount?: number | null;
  nativeCurrency?: CurrencyCode | null;
  fxRate?: number | null;
  needsFx?: boolean;
  flowOverride?: RuleFlowType | null;
  description?: string;
  rawDescription?: string;
  memo?: string;
  categoryId: string | null;
  subCategoryId: string | null;
  tags: string[];
  importBatchId?: string | null;
  metadata?: Record<string, unknown>;
  isDemo: boolean;
};

export type ImportSignConvention = 'positive-credit' | 'explicit-columns';

export type ImportFormatOptions = {
  dateFormat: string;
  decimalSeparator: ',' | '.';
  thousandsSeparator: ',' | '.' | ' ';
  signConvention: ImportSignConvention;
};

export type ImportField =
  | 'date'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'description'
  | 'payee'
  | 'counterparty'
  | 'currency'
  | 'balance'
  | 'externalId'
  | 'categoryPath'
  | 'notes';

export type ImportColumnMapping = Partial<Record<ImportField, string[]>>;

export type ImportProfile = {
  id: string;
  name: string;
  headerFingerprint: string;
  fieldMapping: ImportColumnMapping;
  format: ImportFormatOptions;
  transforms: Record<string, string>;
  updatedAt: string;
};

export type ImportFxMode = 'single-rate' | 'rate-column' | 'skip';

export type ImportBatchSummary = {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  fxAppliedCount: number;
  needsFxCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  totalsByCurrency: Record<CurrencyCode, { debit: number; credit: number }>;
};

export type ImportBatch = {
  id: string;
  accountId: string;
  profileId: string | null;
  profileName: string | null;
  createdAt: string;
  sourceFileName: string;
  headerFingerprint: string;
  options: ImportFormatOptions & {
    rememberProfile: boolean;
    fxMode: ImportFxMode;
    fxRate?: number;
    fxRateColumn?: string;
    includeDuplicates: boolean;
    autoMarkTransfers: boolean;
    defaultCategoryId?: string | null;
    defaultSubCategoryId?: string | null;
  };
  summary: ImportBatchSummary;
  transactionIds: string[];
  log: HistoryEntry[];
  isDemo: boolean;
};

export type ExchangeRate = {
  currency: CurrencyCode;
  rateToBase: number;
};

export type ImportDefaults = ImportFormatOptions;

export type SettingsState = {
  baseCurrency: CurrencyCode;
  exchangeRates: ExchangeRate[];
  lastExchangeRateUpdate: string | null;
  importDefaults: ImportDefaults;
  importProfiles: ImportProfile[];
};

export type DataState = {
  masterCategories: MasterCategory[];
  categories: Category[];
  subCategories: SubCategory[];
  accounts: Account[];
  providerDirectory: string[];
  accountCollections: AccountCollection[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  payees: Payee[];
  tags: Tag[];
  transactions: Transaction[];
  importBatches: ImportBatch[];
  rules: Rule[];
  ruleLogs: RuleRunLogEntry[];
  settings: SettingsState;
  lastUpdated: string | null;
};

export type HistoryEntry = {
  timestamp: string;
  message: string;
};

export type RuleMatchType = 'all' | 'any';

export type RuleFlowType = 'in' | 'out' | 'transfer' | 'interest' | 'fees';

export type DescriptionCondition = {
  id: string;
  type: 'description';
  operator: 'contains' | 'startsWith' | 'equals';
  value: string;
};

export type PayeeCondition = {
  id: string;
  type: 'payee';
  operator: 'contains' | 'equals';
  value: string;
};

export type AmountCondition = {
  id: string;
  type: 'amount';
  operator: 'equals' | 'greaterThan' | 'lessThan' | 'between';
  value: number;
  secondaryValue?: number;
};

export type DateRangeCondition = {
  id: string;
  type: 'dateRange';
  start?: string | null;
  end?: string | null;
};

export type AccountCondition = {
  id: string;
  type: 'account';
  accountIds: string[];
};

export type ProviderCondition = {
  id: string;
  type: 'provider';
  providers: string[];
};

export type CategoryEmptyCondition = {
  id: string;
  type: 'category-empty';
  level: 'category' | 'sub-category';
};

export type CategoryEqualsCondition = {
  id: string;
  type: 'category';
  categoryId: string;
  subCategoryId?: string | null;
};

export type FlowCondition = {
  id: string;
  type: 'flow';
  flow: RuleFlowType;
};

export type TagCondition = {
  id: string;
  type: 'tag';
  tagId: string;
};

export type RuleCondition =
  | DescriptionCondition
  | PayeeCondition
  | AmountCondition
  | DateRangeCondition
  | AccountCondition
  | ProviderCondition
  | CategoryEmptyCondition
  | CategoryEqualsCondition
  | FlowCondition
  | TagCondition;

export type SetCategoryAction = {
  id: string;
  type: 'set-category';
  categoryId: string;
  subCategoryId?: string | null;
};

export type AddTagsAction = {
  id: string;
  type: 'add-tags';
  tagIds: string[];
};

export type SetPayeeAction = {
  id: string;
  type: 'set-payee';
  payeeName: string;
};

export type MarkTransferAction = {
  id: string;
  type: 'mark-transfer';
};

export type PrependMemoAction = {
  id: string;
  type: 'prepend-memo';
  prefix: string;
};

export type ClearNeedsFxAction = {
  id: string;
  type: 'clear-needs-fx';
};

export type RuleAction =
  | SetCategoryAction
  | AddTagsAction
  | SetPayeeAction
  | MarkTransferAction
  | PrependMemoAction
  | ClearNeedsFxAction;

export type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: RuleMatchType;
  conditions: RuleCondition[];
  actions: RuleAction[];
  archived: boolean;
};

export type RuleActionField = 'category' | 'tags' | 'payee' | 'memo' | 'needsFx' | 'flow';

export type RuleRunSummary = {
  ruleId: string;
  ruleName: string;
  matched: number;
  actionFields: RuleActionField[];
};

export type RuleRunLogEntry = {
  id: string;
  runAt: string;
  mode: 'auto' | 'manual';
  source?: string;
  transactionCount: number;
  summaries: RuleRunSummary[];
};

export type RuleRunPreview = {
  transactionCount: number;
  summaries: RuleRunSummary[];
};

export type DataActionError = {
  title: string;
  description: string;
};

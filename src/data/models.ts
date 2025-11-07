export type InclusionMode = 'included' | 'excluded';

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

export type Institution = {
  id: string;
  name: string;
  type: 'bank' | 'card' | 'brokerage' | 'cash' | 'other';
  website?: string;
  archived: boolean;
  createdAt: string;
  isDemo: boolean;
};

export type Account = {
  id: string;
  institutionId: string;
  name: string;
  accountNumber?: string;
  type: 'checking' | 'savings' | 'credit' | 'loan' | 'investment' | 'cash';
  includeInTotals: boolean;
  includeOnlyGroupIds: string[];
  excludeGroupId: string | null;
  openingBalance: number;
  openingBalanceDate: string;
  currentBalance: number;
  archived: boolean;
  notes?: string;
  isDemo: boolean;
};

export type AccountGroupType = 'include' | 'exclude';

export type AccountGroup = {
  id: string;
  name: string;
  type: AccountGroupType;
  description?: string;
  color: string;
  accountIds: string[];
  archived: boolean;
  isDemo: boolean;
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
  memo?: string;
  categoryId: string | null;
  subCategoryId: string | null;
  tags: string[];
  isDemo: boolean;
};

export type DataState = {
  masterCategories: MasterCategory[];
  categories: Category[];
  subCategories: SubCategory[];
  institutions: Institution[];
  accounts: Account[];
  accountGroups: AccountGroup[];
  payees: Payee[];
  tags: Tag[];
  transactions: Transaction[];
  lastUpdated: string | null;
};

export type HistoryEntry = {
  timestamp: string;
  message: string;
};

export type DataActionError = {
  title: string;
  description: string;
};

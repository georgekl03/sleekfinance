import {
  Account,
  AccountGroup,
  Category,
  CurrencyCode,
  DataState,
  ImportDefaults,
  Institution,
  MasterCategory,
  Payee,
  SettingsState,
  SubCategory,
  Tag,
  Transaction
} from './models';
import { generateId } from '../utils/id';

const today = new Date();

export const MASTER_CATEGORIES: MasterCategory[] = [
  {
    id: 'mc_income',
    name: 'Income',
    description: 'Salary, reimbursements, and other inflows.'
  },
  {
    id: 'mc_essential',
    name: 'Essentials',
    description: 'Housing, utilities, food and transport.'
  },
  {
    id: 'mc_growth',
    name: 'Growth',
    description: 'Savings and investments for future goals.'
  },
  {
    id: 'mc_discretionary',
    name: 'Discretionary',
    description: 'Lifestyle and nice-to-have purchases.'
  }
];

type DemoBuildResult = {
  masterCategories: MasterCategory[];
  categories: Category[];
  subCategories: SubCategory[];
  institutions: Institution[];
  accounts: Account[];
  accountGroups: AccountGroup[];
  payees: Payee[];
  tags: Tag[];
  transactions: Transaction[];
  settings: SettingsState;
};

const addMonths = (base: Date, delta: number) => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + delta);
  return d;
};

const buildDemoData = (): DemoBuildResult => {
  const masterCategories = MASTER_CATEGORIES;

  const categories: Category[] = [
    {
      id: generateId('cat'),
      masterCategoryId: 'mc_income',
      name: 'Primary Income',
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: true
    },
    {
      id: generateId('cat'),
      masterCategoryId: 'mc_essential',
      name: 'Housing',
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: true
    },
    {
      id: generateId('cat'),
      masterCategoryId: 'mc_essential',
      name: 'Groceries',
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: true
    },
    {
      id: generateId('cat'),
      masterCategoryId: 'mc_growth',
      name: 'Transfers',
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: true
    },
    {
      id: generateId('cat'),
      masterCategoryId: 'mc_growth',
      name: 'Savings',
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: true
    },
    {
      id: generateId('cat'),
      masterCategoryId: 'mc_discretionary',
      name: 'Lifestyle',
      archived: false,
      previousNames: [],
      mergedIntoId: null,
      isDemo: true
    }
  ];

  const subCategories: SubCategory[] = categories.flatMap((category) => {
    switch (category.name) {
      case 'Primary Income':
        return [
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Payroll',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          },
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Bonus',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          }
        ];
      case 'Transfers':
        return [
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Internal Transfer',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          }
        ];
      case 'Housing':
        return [
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Rent',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          },
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Utilities',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          }
        ];
      case 'Groceries':
        return [
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Supermarket',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          },
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Farmers Market',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          }
        ];
      case 'Savings':
        return [
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Emergency Fund',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          },
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Retirement',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          }
        ];
      case 'Lifestyle':
        return [
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Dining Out',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          },
          {
            id: generateId('sub'),
            categoryId: category.id,
            name: 'Entertainment',
            archived: false,
            previousNames: [],
            mergedIntoId: null,
            isDemo: true
          }
        ];
      default:
        return [];
    }
  });

  const institutions: Institution[] = [
    {
      id: generateId('inst'),
      name: 'Modern Bank',
      type: 'bank',
      website: 'https://modernbank.example',
      archived: false,
      createdAt: today.toISOString(),
      isDemo: true
    },
    {
      id: generateId('inst'),
      name: 'Global Credit',
      type: 'card',
      archived: false,
      createdAt: today.toISOString(),
      isDemo: true
    }
  ];

  const defaultCurrency: CurrencyCode = 'GBP';

  const accounts: Account[] = [
    {
      id: generateId('acct'),
      institutionId: institutions[0].id,
      name: 'Everyday Checking',
      type: 'checking',
      currency: defaultCurrency,
      includeInTotals: true,
      includeOnlyGroupIds: [],
      excludeGroupId: null,
      openingBalance: 4200,
      openingBalanceDate: addMonths(today, -6).toISOString(),
      currentBalance: 5120,
      archived: false,
      notes: 'Primary household account.',
      isDemo: true
    },
    {
      id: generateId('acct'),
      institutionId: institutions[0].id,
      name: 'Future Savings',
      type: 'savings',
      currency: defaultCurrency,
      includeInTotals: true,
      includeOnlyGroupIds: [],
      excludeGroupId: null,
      openingBalance: 10800,
      openingBalanceDate: addMonths(today, -6).toISOString(),
      currentBalance: 12550,
      archived: false,
      isDemo: true
    },
    {
      id: generateId('acct'),
      institutionId: institutions[1].id,
      name: 'Global Rewards Card',
      type: 'credit',
      currency: defaultCurrency,
      includeInTotals: false,
      includeOnlyGroupIds: [],
      excludeGroupId: null,
      openingBalance: -800,
      openingBalanceDate: addMonths(today, -6).toISOString(),
      currentBalance: -320,
      archived: false,
      notes: 'Reconcile weekly for travel points.',
      isDemo: true
    }
  ];

  const accountGroups: AccountGroup[] = [
    {
      id: generateId('grp'),
      name: 'Day-to-Day',
      type: 'include',
      description: 'Operational cash you want on dashboards.',
      color: '#2563eb',
      accountIds: [accounts[0].id, accounts[2].id],
      archived: false,
      isDemo: true
    },
    {
      id: generateId('grp'),
      name: 'Exclude: Credit Cycling',
      type: 'exclude',
      description: 'Short-term credit excluded from totals.',
      color: '#dc2626',
      accountIds: [accounts[2].id],
      archived: false,
      isDemo: true
    }
  ];

  accounts[0].includeOnlyGroupIds.push(accountGroups[0].id);
  accounts[2].excludeGroupId = accountGroups[1].id;

  const payees: Payee[] = [
    {
      id: generateId('payee'),
      name: 'Employer Ltd',
      defaultCategoryId: categories.find((c) => c.masterCategoryId === 'mc_income')?.id ?? null,
      defaultSubCategoryId: subCategories.find((s) => s.name === 'Payroll')?.id ?? null,
      archived: false,
      isDemo: true
    },
    {
      id: generateId('payee'),
      name: 'Fresh Foods Market',
      defaultCategoryId: categories.find((c) => c.name === 'Groceries')?.id ?? null,
      defaultSubCategoryId: subCategories.find((s) => s.name === 'Supermarket')?.id ?? null,
      archived: false,
      isDemo: true
    },
    {
      id: generateId('payee'),
      name: 'City Utilities',
      defaultCategoryId: categories.find((c) => c.name === 'Housing')?.id ?? null,
      defaultSubCategoryId: subCategories.find((s) => s.name === 'Utilities')?.id ?? null,
      archived: false,
      isDemo: true
    }
  ];

  const tags: Tag[] = [
    { id: generateId('tag'), name: 'Recurring', color: '#0891b2', archived: false, isDemo: true },
    { id: generateId('tag'), name: 'Needs Review', color: '#f97316', archived: false, isDemo: true },
    { id: generateId('tag'), name: 'Travel', color: '#a855f7', archived: false, isDemo: true }
  ];

  const transactions: Transaction[] = [];

  accounts.forEach((account) => {
    for (let monthOffset = 0; monthOffset < 6; monthOffset += 1) {
      const baseDate = addMonths(today, -monthOffset);
      const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const payroll = payees[0];
      transactions.push({
        id: generateId('txn'),
        accountId: account.id,
        payeeId: payroll.id,
        date: new Date(monthStart.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        amount: account.type === 'credit' ? -2600 : 2600,
        currency: account.currency,
        nativeAmount: account.type === 'credit' ? -2600 : 2600,
        nativeCurrency: account.currency,
        memo: 'Monthly payroll deposit',
        categoryId: payroll.defaultCategoryId,
        subCategoryId: payroll.defaultSubCategoryId,
        tags: [tags[0].id],
        importBatchId: null,
        metadata: undefined,
        isDemo: true
      });

      if (account.type !== 'credit') {
        const groceryPayee = payees[1];
        transactions.push({
          id: generateId('txn'),
          accountId: account.id,
          payeeId: groceryPayee.id,
          date: new Date(monthStart.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          amount: -180,
          currency: account.currency,
          nativeAmount: -180,
          nativeCurrency: account.currency,
          memo: 'Weekly groceries',
          categoryId: groceryPayee.defaultCategoryId,
          subCategoryId: groceryPayee.defaultSubCategoryId,
          tags: [tags[0].id],
          importBatchId: null,
          metadata: undefined,
          isDemo: true
        });
        transactions.push({
          id: generateId('txn'),
          accountId: account.id,
          payeeId: groceryPayee.id,
          date: new Date(monthStart.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          amount: -165,
          currency: account.currency,
          nativeAmount: -165,
          nativeCurrency: account.currency,
          memo: 'Weekly groceries',
          categoryId: groceryPayee.defaultCategoryId,
          subCategoryId: groceryPayee.defaultSubCategoryId,
          tags: [],
          importBatchId: null,
          metadata: undefined,
          isDemo: true
        });
      }

      const utilitiesPayee = payees[2];
      transactions.push({
        id: generateId('txn'),
        accountId: account.id,
        payeeId: utilitiesPayee.id,
        date: new Date(monthStart.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        amount: -220,
        currency: account.currency,
        nativeAmount: -220,
        nativeCurrency: account.currency,
        memo: 'Monthly utilities',
        categoryId: utilitiesPayee.defaultCategoryId,
        subCategoryId: utilitiesPayee.defaultSubCategoryId,
        tags: [tags[1].id],
        importBatchId: null,
        metadata: undefined,
        isDemo: true
      });
    }
  });

  const importDefaults: ImportDefaults = {
    dateFormat: 'YYYY-MM-DD',
    decimalSeparator: '.',
    thousandsSeparator: ',',
    signConvention: 'positive-credit'
  };

  const settings: SettingsState = {
    baseCurrency: defaultCurrency,
    exchangeRates: [{ currency: defaultCurrency, rateToBase: 1 }],
    lastExchangeRateUpdate: new Date().toISOString(),
    importDefaults,
    importProfiles: []
  };

  return {
    masterCategories,
    categories,
    subCategories,
    institutions,
    accounts,
    accountGroups,
    payees,
    tags,
    transactions,
    settings
  };
};

export const buildInitialState = (): DataState => {
  const demo = buildDemoData();
  return {
    masterCategories: MASTER_CATEGORIES,
    categories: demo.categories,
    subCategories: demo.subCategories,
    institutions: demo.institutions,
    accounts: demo.accounts,
    accountGroups: demo.accountGroups,
    payees: demo.payees,
    tags: demo.tags,
    transactions: demo.transactions,
    importBatches: [],
    settings: demo.settings,
    lastUpdated: new Date().toISOString()
  };
};

export const buildDemoOnlyData = () => buildDemoData();

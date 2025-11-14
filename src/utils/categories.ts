import {
  Category,
  MasterCategory,
  SubCategory,
  Transaction
} from '../data/models';

export type FlowType = 'in' | 'interest' | 'out' | 'transfers' | 'other';

export type CategoryTree = {
  master: MasterCategory;
  flowType: FlowType;
  categories: {
    category: Category;
    subCategories: SubCategory[];
  }[];
};

export type CategoryRollup = {
  master: MasterCategory;
  flowType: FlowType;
  total: number;
  categories: {
    category: Category;
    total: number;
    subCategories: {
      subCategory: SubCategory;
      total: number;
    }[];
  }[];
};

export type CategoryRollupSummary = {
  rollups: CategoryRollup[];
  uncategorisedTotal: number;
};

const FLOW_KEYWORDS: Record<Exclude<FlowType, 'other'>, string[]> = {
  interest: ['interest', 'yield', 'dividend'],
  in: ['income', 'inflow', 'gain', 'earning'],
  out: ['expense', 'spend', 'cost', 'fee', 'fees', 'essential', 'discretionary'],
  transfers: ['transfer', 'movement', 'move', 'rebalanc', 'growth']
};

const normalise = (value: string) => value.trim().toLocaleLowerCase();

export const getFlowTypeForMaster = (master: MasterCategory): FlowType => {
  const name = normalise(master.name);
  if (FLOW_KEYWORDS.interest.some((keyword) => name.includes(keyword))) {
    return 'interest';
  }
  if (FLOW_KEYWORDS.in.some((keyword) => name.includes(keyword))) {
    return 'in';
  }
  if (FLOW_KEYWORDS.out.some((keyword) => name.includes(keyword))) {
    return 'out';
  }
  if (FLOW_KEYWORDS.transfers.some((keyword) => name.includes(keyword))) {
    return 'transfers';
  }
  return 'other';
};

export const buildCategoryTree = (
  masterCategories: MasterCategory[],
  categories: Category[],
  subCategories: SubCategory[]
): CategoryTree[] => {
  const subsByCategory = new Map<string, SubCategory[]>(
    categories.map((category) => [
      category.id,
      subCategories
        .filter((sub) => sub.categoryId === category.id && !sub.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
    ])
  );

  return masterCategories
    .map((master) => ({
      master,
      flowType: getFlowTypeForMaster(master),
      categories: categories
        .filter(
          (category) =>
            category.masterCategoryId === master.id && !category.archived && !category.mergedIntoId
        )
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((category) => ({
          category,
          subCategories: subsByCategory.get(category.id) ?? []
        }))
    }))
    .sort((a, b) => a.master.name.localeCompare(b.master.name));
};

export const buildCategoryRollups = (
  transactions: Transaction[],
  masterCategories: MasterCategory[],
  categories: Category[],
  subCategories: SubCategory[],
  amountSelector: (transaction: Transaction) => number
): CategoryRollupSummary => {
  const masterById = new Map(masterCategories.map((master) => [master.id, master]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const subById = new Map(subCategories.map((sub) => [sub.id, sub]));

  const rollupMap = new Map<
    string,
    {
      master: MasterCategory;
      flowType: FlowType;
      total: number;
      categories: Map<
        string,
        {
          category: Category;
          total: number;
          subCategories: Map<string, { subCategory: SubCategory; total: number }>;
        }
      >;
    }
  >();

  let uncategorisedTotal = 0;

  transactions.forEach((transaction) => {
    const amount = amountSelector(transaction);
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }

    if (!transaction.categoryId) {
      uncategorisedTotal += amount;
      return;
    }

    const category = categoryById.get(transaction.categoryId);
    if (!category) {
      uncategorisedTotal += amount;
      return;
    }

    const master = masterById.get(category.masterCategoryId);
    if (!master) {
      uncategorisedTotal += amount;
      return;
    }

    const masterEntry = rollupMap.get(master.id) ?? {
      master,
      flowType: getFlowTypeForMaster(master),
      total: 0,
      categories: new Map()
    };

    masterEntry.total += amount;

    const categoryEntry = masterEntry.categories.get(category.id) ?? {
      category,
      total: 0,
      subCategories: new Map<string, { subCategory: SubCategory; total: number }>()
    };

    categoryEntry.total += amount;

    if (transaction.subCategoryId) {
      const subCategory = subById.get(transaction.subCategoryId);
      if (subCategory) {
        const subEntry = categoryEntry.subCategories.get(subCategory.id) ?? {
          subCategory,
          total: 0
        };
        subEntry.total += amount;
        categoryEntry.subCategories.set(subCategory.id, subEntry);
      }
    }

    masterEntry.categories.set(category.id, categoryEntry);
    rollupMap.set(master.id, masterEntry);
  });

  const rollups: CategoryRollup[] = Array.from(rollupMap.values())
    .map((entry) => ({
      master: entry.master,
      flowType: entry.flowType,
      total: entry.total,
      categories: Array.from(entry.categories.values())
        .map((categoryEntry) => ({
          category: categoryEntry.category,
          total: categoryEntry.total,
          subCategories: Array.from(categoryEntry.subCategories.values()).sort(
            (a, b) => b.total - a.total
          )
        }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  return { rollups, uncategorisedTotal };
};

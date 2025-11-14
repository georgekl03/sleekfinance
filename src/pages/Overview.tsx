import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, Transaction } from '../data/models';
import { formatCurrency, formatDate } from '../utils/format';
import {
  buildCategoryRollups,
  buildCategoryTree,
  FlowType,
  getFlowTypeForMaster
} from '../utils/categories';
import { calculateBudgetPeriod } from '../utils/budgetCalculations';
import '../styles/overview.css';

const buildDefaultStartDate = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date.toISOString().slice(0, 10);
};

const buildDefaultEndDate = () => new Date().toISOString().slice(0, 10);

type FlowFilter = 'all' | FlowType;

type RateMeta = {
  rate: number;
  source: 'base' | 'settings' | 'implied';
};

const Overview = () => {
  const { state } = useData();
  const navigate = useNavigate();
  const accounts = useMemo(
    () => state.accounts.filter((account) => !account.archived),
    [state.accounts]
  );
  const collections = useMemo(
    () => state.accountCollections,
    [state.accountCollections]
  );
  const [selectedCollection, setSelectedCollection] = useState<string>('totals');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<FlowFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>(() => buildDefaultStartDate());
  const [dateTo, setDateTo] = useState<string>(() => buildDefaultEndDate());
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string | null>(null);
  const [showNativeBalances, setShowNativeBalances] = useState(false);

  const baseCurrency = state.settings.baseCurrency;

  const exchangeRateMeta = useMemo(() => {
    const baseKey = baseCurrency.toUpperCase();
    const map = new Map<string, RateMeta>();
    state.settings.exchangeRates.forEach((entry) => {
      const key = entry.currency.toUpperCase();
      map.set(key, {
        rate: entry.rateToBase,
        source: key === baseKey ? 'base' : 'settings'
      });
    });
    if (!map.has(baseKey)) {
      map.set(baseKey, { rate: 1, source: 'base' });
    }
    return map;
  }, [baseCurrency, state.settings.exchangeRates]);

  const getRateInfo = useCallback(
    (currency: string): RateMeta => {
      const key = currency.toUpperCase();
      return exchangeRateMeta.get(key) ?? { rate: 1, source: 'implied' };
    },
    [exchangeRateMeta]
  );

  const convertToBase = useCallback(
    (amount: number, currency: string) => {
      const { rate } = getRateInfo(currency);
      return amount * rate;
    },
    [getRateInfo]
  );

  const categoryTree = useMemo(
    () => buildCategoryTree(state.masterCategories, state.categories, state.subCategories),
    [state.categories, state.masterCategories, state.subCategories]
  );

  const parseDate = useCallback((value: string) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, []);

  const startDate = useMemo(() => parseDate(dateFrom), [dateFrom, parseDate]);
  const endDate = useMemo(() => parseDate(dateTo), [dateTo, parseDate]);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const accountsByCollection = useMemo(() => {
    if (selectedCollection === 'all') return accounts;
    if (selectedCollection === 'totals') {
      return accounts.filter((account) => account.includeInTotals);
    }
    const collection = collections.find((item) => item.id === selectedCollection);
    if (!collection) return accounts;
    return accounts.filter((account) => account.collectionIds.includes(collection.id));
  }, [accounts, collections, selectedCollection]);

  useEffect(() => {
    if (selectedAccountId === 'all') return;
    const present = accountsByCollection.some((account) => account.id === selectedAccountId);
    if (!present) {
      setSelectedAccountId('all');
    }
  }, [accountsByCollection, selectedAccountId]);

  useEffect(() => {
    if (flowFilter === 'in' || flowFilter === 'out' || flowFilter === 'interest') return;
    setSelectedCategoryId(null);
    setSelectedSubCategoryId(null);
    setExpandedCategoryId(null);
  }, [flowFilter]);

  const activeCategoryGroups = useMemo(() => {
    if (flowFilter !== 'in' && flowFilter !== 'out' && flowFilter !== 'interest') {
      return [];
    }
    return categoryTree.filter((group) => group.flowType === flowFilter);
  }, [categoryTree, flowFilter]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    const stillVisible = activeCategoryGroups.some((group) =>
      group.categories.some((item) => item.category.id === selectedCategoryId)
    );
    if (!stillVisible) {
      setSelectedCategoryId(null);
      setSelectedSubCategoryId(null);
      setExpandedCategoryId(null);
    }
  }, [activeCategoryGroups, selectedCategoryId]);

  useEffect(() => {
    if (!selectedSubCategoryId) return;
    const stillVisible = activeCategoryGroups.some((group) =>
      group.categories.some((item) =>
        item.subCategories.some((sub) => sub.id === selectedSubCategoryId)
      )
    );
    if (!stillVisible) {
      setSelectedSubCategoryId(null);
    }
  }, [activeCategoryGroups, selectedSubCategoryId]);

  const filteredAccounts = useMemo(() => {
    if (selectedAccountId === 'all') {
      return accountsByCollection;
    }
    return accountsByCollection.filter((account) => account.id === selectedAccountId);
  }, [accountsByCollection, selectedAccountId]);

  const accountIdSet = useMemo(
    () => new Set(filteredAccounts.map((account) => account.id)),
    [filteredAccounts]
  );

  const primaryBudget = useMemo(() => {
    const active = state.budgets.filter((budget) => !budget.archived);
    const explicit = active.find((budget) => budget.isPrimary);
    return explicit ?? active[0] ?? null;
  }, [state.budgets]);

  const primaryBudgetLines = useMemo(() => {
    if (!primaryBudget) return [];
    return state.budgetLines.filter((line) => line.budgetId === primaryBudget.id);
  }, [primaryBudget, state.budgetLines]);

  const primaryBudgetComputation = useMemo(() => {
    if (!primaryBudget) return null;
    return calculateBudgetPeriod({
      budget: primaryBudget,
      lines: primaryBudgetLines,
      accounts: state.accounts,
      transactions: state.transactions,
      categories: state.categories,
      subCategories: state.subCategories,
      masterCategories: state.masterCategories,
      settings: state.settings
    });
  }, [
    primaryBudget,
    primaryBudgetLines,
    state.accounts,
    state.transactions,
    state.categories,
    state.subCategories,
    state.masterCategories,
    state.settings
  ]);

  const budgetAttentionLines = useMemo(() => {
    if (!primaryBudgetComputation) return [];
    return primaryBudgetComputation.lines
      .filter((line) => line.status === 'over' || line.status === 'near')
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
      .slice(0, 3);
  }, [primaryBudgetComputation]);

  const snapshotTotals = primaryBudgetComputation?.summary.totals;
  const snapshotPeriodRange = primaryBudgetComputation
    ? `${formatDate(primaryBudgetComputation.period.start.toISOString())} → ${formatDate(primaryBudgetComputation.period.end.toISOString())}`
    : '';

  const masterById = useMemo(
    () => new Map(state.masterCategories.map((master) => [master.id, master])),
    [state.masterCategories]
  );
  const categoryById = useMemo(
    () => new Map(state.categories.map((category) => [category.id, category])),
    [state.categories]
  );

  const resolveTransactionFlow = useCallback(
    (transaction: Transaction, account: Account | undefined): FlowType => {
      if (transaction.flowOverride) {
        switch (transaction.flowOverride) {
          case 'transfer':
            return 'transfers';
          case 'interest':
            return 'interest';
          case 'fees':
            return 'out';
          case 'in':
            return 'in';
          case 'out':
            return 'out';
          default:
            break;
        }
      }
      if (transaction.categoryId) {
        const category = categoryById.get(transaction.categoryId);
        if (category) {
          const master = masterById.get(category.masterCategoryId);
          if (master) {
            return getFlowTypeForMaster(master);
          }
        }
      }
      if (transaction.amount >= 0) return 'in';
      if (transaction.amount < 0) return 'out';
      return account?.includeInTotals ? 'in' : 'other';
    },
    [categoryById, masterById]
  );

  const filteredTransactions = useMemo(() => {
    return state.transactions.filter((transaction) => {
      if (!accountIdSet.has(transaction.accountId)) {
        return false;
      }
      const transactionDate = new Date(transaction.date);
      if (Number.isNaN(transactionDate.getTime())) {
        return false;
      }
      if (startDate && transactionDate < startDate) {
        return false;
      }
      if (endDate && transactionDate > endDate) {
        return false;
      }
      const account = accountById.get(transaction.accountId);
      const flow = resolveTransactionFlow(transaction, account);
      if (flowFilter !== 'all' && flow !== flowFilter) {
        return false;
      }
      if (selectedSubCategoryId && transaction.subCategoryId !== selectedSubCategoryId) {
        return false;
      }
      if (
        selectedCategoryId &&
        transaction.categoryId !== selectedCategoryId &&
        !selectedSubCategoryId
      ) {
        return false;
      }
      return true;
    });
  }, [
    accountIdSet,
    accounts,
    endDate,
    flowFilter,
    resolveTransactionFlow,
    selectedCategoryId,
    selectedSubCategoryId,
    startDate,
    state.transactions
  ]);

  const sortedTransactions = useMemo(
    () =>
      [...filteredTransactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [filteredTransactions]
  );

  const transactionsWithBase = useMemo(
    () =>
      sortedTransactions.map((transaction) => ({
        transaction,
        baseAmount: convertToBase(transaction.amount, transaction.currency)
      })),
    [convertToBase, sortedTransactions]
  );

  const totals = useMemo(() => {
    return transactionsWithBase.reduce(
      (acc, item) => {
        if (item.baseAmount >= 0) {
          acc.inflow += item.baseAmount;
        } else {
          acc.outflow += item.baseAmount;
        }
        return acc;
      },
      { inflow: 0, outflow: 0 }
    );
  }, [transactionsWithBase]);

  const netFlow = totals.inflow + totals.outflow;

  const totalBalance = useMemo(
    () =>
      filteredAccounts.reduce(
        (sum, account) => sum + convertToBase(account.currentBalance, account.currency),
        0
      ),
    [convertToBase, filteredAccounts]
  );

  const rollupSummary = useMemo(
    () =>
      buildCategoryRollups(
        filteredTransactions,
        state.masterCategories,
        state.categories,
        state.subCategories,
        (transaction) => convertToBase(transaction.amount, transaction.currency)
      ),
    [
      convertToBase,
      filteredTransactions,
      state.categories,
      state.masterCategories,
      state.subCategories
    ]
  );

  const categoryTotals = useMemo(() => {
    const categoryTotalMap = new Map<string, number>();
    const subCategoryTotalMap = new Map<string, number>();
    rollupSummary.rollups.forEach((rollup) => {
      rollup.categories.forEach((categoryEntry) => {
        categoryTotalMap.set(categoryEntry.category.id, categoryEntry.total);
        categoryEntry.subCategories.forEach((subEntry) => {
          subCategoryTotalMap.set(subEntry.subCategory.id, subEntry.total);
        });
      });
    });
    return { categoryTotalMap, subCategoryTotalMap };
  }, [rollupSummary.rollups]);

  const flowOptions: { id: FlowFilter; label: string; tooltip: string }[] = [
    {
      id: 'all',
      label: 'All',
      tooltip: 'Show every transaction regardless of direction.'
    },
    {
      id: 'in',
      label: 'In',
      tooltip: 'Focus on inflows such as salary, grants, and reimbursements.'
    },
    {
      id: 'out',
      label: 'Out',
      tooltip: 'Highlight outflows including groceries, rent, and card spending.'
    },
    {
      id: 'transfers',
      label: 'Transfers',
      tooltip: 'Review internal account movements and balance shuffles.'
    },
    {
      id: 'interest',
      label: 'Interest',
      tooltip: 'Inspect earned interest across savings, investments, and cash sweep balances.'
    }
  ];

  const handleCategoryChipClick = (categoryId: string) => {
    setExpandedCategoryId((current) => (current === categoryId ? null : categoryId));
    setSelectedCategoryId((current) => (current === categoryId ? null : categoryId));
    setSelectedSubCategoryId(null);
  };

  const handleSubCategoryClick = (subCategoryId: string) => {
    setSelectedSubCategoryId((current) => (current === subCategoryId ? null : subCategoryId));
  };

  const handleClearCategories = () => {
    setSelectedCategoryId(null);
    setSelectedSubCategoryId(null);
    setExpandedCategoryId(null);
  };

  const formatSignedCurrency = (value: number) =>
    `${value < 0 ? '-' : ''}${formatCurrency(Math.abs(value), baseCurrency)}`;

  const formatBudgetDifference = (value: number) => {
    const formatted = formatCurrency(Math.abs(value), baseCurrency);
    if (value === 0) return formatted;
    return `${value > 0 ? '+' : '-'}${formatted}`;
  };

  const renderRateDetails = (account: Account) => {
    const rateInfo = getRateInfo(account.currency);
    if (rateInfo.source === 'base') {
      return `Base currency ${account.currency.toUpperCase()} – no conversion applied.`;
    }
    if (rateInfo.source === 'settings') {
      return `Manual rate: 1 ${account.currency.toUpperCase()} → ${formatCurrency(
        rateInfo.rate,
        baseCurrency
      )} (Settings table).`;
    }
    return `Fallback rate: 1 ${account.currency.toUpperCase()} → ${formatCurrency(
      rateInfo.rate,
      baseCurrency
    )} (defaulted to 1).`;
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Overview"
        description="Bank-style filters, category roll-ups, and currency-aware balances for a consolidated health check."
      />
      {primaryBudget && primaryBudgetComputation ? (
        <button
          type="button"
          className="budget-snapshot-card"
          onClick={() => navigate('/budgets', { state: { budgetId: primaryBudget.id } })}
        >
          <div className="budget-snapshot-card__header">
            <div>
              <span className="budget-snapshot-card__eyebrow">Primary budget</span>
              <h3>{primaryBudget.name}</h3>
            </div>
            <div className="budget-snapshot-card__period">
              <span>{primaryBudgetComputation.period.label}</span>
              <span className="budget-snapshot-card__range">{snapshotPeriodRange}</span>
            </div>
          </div>
          <div className="budget-snapshot-card__totals">
            <div>
              <span className="budget-snapshot-card__label">Income</span>
              <div className="budget-snapshot-card__metric-row">
                <span>Planned</span>
                <strong>{formatCurrency(snapshotTotals?.incomePlanned ?? 0, baseCurrency)}</strong>
              </div>
              <div className="budget-snapshot-card__metric-row">
                <span>Actual</span>
                <strong>{formatCurrency(snapshotTotals?.incomeActual ?? 0, baseCurrency)}</strong>
              </div>
              <div className="budget-snapshot-card__metric-row">
                <span>Difference</span>
                <strong>
                  {formatBudgetDifference(
                    (snapshotTotals?.incomePlanned ?? 0) - (snapshotTotals?.incomeActual ?? 0)
                  )}
                </strong>
              </div>
            </div>
            <div>
              <span className="budget-snapshot-card__label">Expenses</span>
              <div className="budget-snapshot-card__metric-row">
                <span>Planned</span>
                <strong>{formatCurrency(snapshotTotals?.expensePlanned ?? 0, baseCurrency)}</strong>
              </div>
              <div className="budget-snapshot-card__metric-row">
                <span>Actual</span>
                <strong>{formatCurrency(snapshotTotals?.expenseActual ?? 0, baseCurrency)}</strong>
              </div>
              <div className="budget-snapshot-card__metric-row">
                <span>Difference</span>
                <strong>
                  {formatBudgetDifference(
                    (snapshotTotals?.expensePlanned ?? 0) - (snapshotTotals?.expenseActual ?? 0)
                  )}
                </strong>
              </div>
            </div>
          </div>
          <div className="budget-snapshot-card__attention">
            <span className="budget-snapshot-card__label">Attention</span>
            {primaryBudgetLines.length === 0 ? (
              <p className="muted-text">Add budget lines to begin tracking this budget.</p>
            ) : budgetAttentionLines.length === 0 ? (
              <p className="muted-text">All tracked categories are within plan.</p>
            ) : (
              budgetAttentionLines.map((line) => (
                <div
                  key={line.line.id}
                  className={`budget-snapshot-card__attention-row budget-status--${line.status}`}
                >
                  <span>{line.category?.name ?? 'Category'}</span>
                  <span>{formatBudgetDifference(line.difference)}</span>
                </div>
              ))
            )}
          </div>
        </button>
      ) : null}
      <div className="form-card">
        <h3>Flow filters</h3>
        <div className="flow-filter-bar" role="toolbar" aria-label="Flow filter options">
          {flowOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip-button ${flowFilter === option.id ? 'active' : ''}`}
              aria-pressed={flowFilter === option.id}
              onClick={() => setFlowFilter(option.id)}
            >
              <span>{option.label}</span>
              <Tooltip label={option.tooltip} />
            </button>
          ))}
        </div>
        <div className="filter-toolbar">
          <div className="field">
            <label htmlFor="overview-date-from">
              From
              <Tooltip label="Lower bound for the transaction filter. Leave blank for no start date." />
            </label>
            <input
              id="overview-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="overview-date-to">
              To
              <Tooltip label="Upper bound for the transaction filter. Leave blank for today." />
            </label>
            <input
              id="overview-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="overview-account">
              Account
              <Tooltip label="Limit the view to a specific account or keep all filtered accounts." />
            </label>
            <select
              id="overview-account"
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
            >
              <option value="all">All accounts</option>
              {accountsByCollection.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              Collections
              <Tooltip label="Toggle collections to pivot accounts used across the overview." />
            </label>
            <div className="chip-list inline">
              <button
                type="button"
                className={`chip-button ${selectedCollection === 'totals' ? 'active' : ''}`}
                onClick={() => setSelectedCollection('totals')}
              >
                Included in totals
              </button>
              <button
                type="button"
                className={`chip-button ${selectedCollection === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCollection('all')}
              >
                All accounts
              </button>
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={`chip-button ${selectedCollection === collection.id ? 'active' : ''}`}
                  onClick={() => setSelectedCollection(collection.id)}
                >
                  {collection.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        {activeCategoryGroups.length > 0 && (
          <div className="category-chip-panel">
            <div className="panel-header">
              <h4>Categories</h4>
              <button
                type="button"
                className="link-button"
                onClick={handleClearCategories}
                disabled={!selectedCategoryId && !selectedSubCategoryId}
              >
                Clear selection
              </button>
            </div>
            <div className="category-chip-groups">
              {activeCategoryGroups.map((group) => (
                <div key={group.master.id} className="category-group">
                  <h5>{group.master.name}</h5>
                  <div className="chip-list wrap">
                    {group.categories.map((entry) => {
                      const isActive = selectedCategoryId === entry.category.id;
                      const displayAmount = categoryTotals.categoryTotalMap.get(entry.category.id) ?? 0;
                      return (
                        <button
                          key={entry.category.id}
                          type="button"
                          className={`chip-button category-chip ${isActive ? 'active' : ''}`}
                          aria-pressed={isActive}
                          onClick={() => handleCategoryChipClick(entry.category.id)}
                        >
                          <span>{entry.category.name}</span>
                          <span className="chip-amount">{formatSignedCurrency(displayAmount)}</span>
                          <Tooltip label={`Filter by ${entry.category.name} including its sub-categories.`} />
                        </button>
                      );
                    })}
                  </div>
                  {group.categories.map((entry) => {
                    const expanded = expandedCategoryId === entry.category.id;
                    if (!expanded || entry.subCategories.length === 0) {
                      return null;
                    }
                    return (
                      <div key={`${entry.category.id}-subs`} className="sub-category-chips">
                        <div className="chip-list wrap">
                          {entry.subCategories.map((sub) => {
                            const isSubActive = selectedSubCategoryId === sub.id;
                            const displayAmount =
                              categoryTotals.subCategoryTotalMap.get(sub.id) ?? 0;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                className={`chip-button sub-chip ${isSubActive ? 'active' : ''}`}
                                aria-pressed={isSubActive}
                                onClick={() => handleSubCategoryClick(sub.id)}
                              >
                                <span>{sub.name}</span>
                                <span className="chip-amount">{formatSignedCurrency(displayAmount)}</span>
                                <Tooltip label={`Focus on the ${sub.name} sub-category only.`} />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="content-card">
        <h3>Snapshot</h3>
        <div className="placeholder-grid" aria-label="Overview metrics">
          <div className="placeholder-tile">
            <h3>Total balance</h3>
            <p>{formatCurrency(totalBalance, baseCurrency)}</p>
            <Tooltip label="Sum of current balances for the filtered accounts converted to the base currency." />
          </div>
          <div className="placeholder-tile">
            <h3>Inflow</h3>
            <p>{formatCurrency(totals.inflow, baseCurrency)}</p>
            <Tooltip label="Positive amounts within the active filters." />
          </div>
          <div className="placeholder-tile">
            <h3>Outflow</h3>
            <p>{formatCurrency(Math.abs(totals.outflow), baseCurrency)}</p>
            <Tooltip label="Absolute value of negative amounts within the filters." />
          </div>
          <div className="placeholder-tile">
            <h3>Net cash flow</h3>
            <p>{formatCurrency(netFlow, baseCurrency)}</p>
            <Tooltip label="Inflows plus outflows using the base currency conversion." />
          </div>
        </div>
      </div>
      <div className="content-card">
        <div className="section-title">
          <h3>Accounts ({filteredAccounts.length})</h3>
          <span className="muted-text">
            Last updated {state.lastUpdated ? formatDate(state.lastUpdated) : 'recently'}
          </span>
        </div>
        <div className="accounts-toggle">
          <span className="muted-text">Display</span>
          <div className="toggle-group" role="group" aria-label="Currency display mode">
            <button
              type="button"
              className={`chip-button ${!showNativeBalances ? 'active' : ''}`}
              aria-pressed={!showNativeBalances}
              onClick={() => setShowNativeBalances(false)}
            >
              Base currency
              <Tooltip label="Show balances converted using the manual exchange table." />
            </button>
            <button
              type="button"
              className={`chip-button ${showNativeBalances ? 'active' : ''}`}
              aria-pressed={showNativeBalances}
              onClick={() => setShowNativeBalances(true)}
            >
              Native currency
              <Tooltip label="Show balances in each account's currency alongside conversion details." />
            </button>
          </div>
        </div>
        <div className="account-grid">
          {filteredAccounts.map((account) => {
            const baseAmount = convertToBase(account.currentBalance, account.currency);
            return (
              <div key={account.id} className="account-card">
                <div className="section-title">
                  <h4>{account.name}</h4>
                  <span className={`badge ${account.includeInTotals ? 'included' : 'excluded'}`}>
                    {account.includeInTotals ? 'Included' : 'Excluded'}
                  </span>
                </div>
                <p className="muted-text">
                  {account.type.toUpperCase()} • {account.currency} • Opened {formatDate(account.openingBalanceDate)}
                </p>
                <p>
                  <strong>
                    {showNativeBalances
                      ? formatCurrency(account.currentBalance, account.currency)
                      : formatCurrency(baseAmount, baseCurrency)}
                  </strong>
                </p>
                <p className="muted-text small">{renderRateDetails(account)}</p>
                {showNativeBalances && (
                  <p className="muted-text small">
                    Base equivalent {formatCurrency(baseAmount, baseCurrency)}
                  </p>
                )}
                {account.collectionIds.length > 0 && (
                  <div className="chip-list">
                    {account.collectionIds.map((collectionId) => {
                      const collection = collections.find((item) => item.id === collectionId);
                      if (!collection) return null;
                      return (
                        <span key={collectionId} className="pill pill-muted">
                          {collection.name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {filteredAccounts.length === 0 && <p className="muted-text">No accounts in this focus.</p>}
        </div>
      </div>
      <div className="content-card">
        <div className="section-title">
          <h3>Category roll-up</h3>
          <span className="muted-text">
            {filteredTransactions.length.toLocaleString()} transactions in view •{' '}
            {rollupSummary.uncategorisedTotal === 0
              ? 'No uncategorised amounts'
              : `${formatSignedCurrency(rollupSummary.uncategorisedTotal)} uncategorised`}
          </span>
        </div>
        <div className="rollup-grid">
          {rollupSummary.rollups.length === 0 && (
            <p className="muted-text">No category totals available for the current filters.</p>
          )}
          {rollupSummary.rollups.map((rollup) => (
            <div key={rollup.master.id} className="rollup-card">
              <div className="rollup-header">
                <h4>{rollup.master.name}</h4>
                <span className="rollup-total">{formatSignedCurrency(rollup.total)}</span>
              </div>
              <ul>
                {rollup.categories.map((entry) => (
                  <li key={entry.category.id}>
                    <div className="rollup-row">
                      <span>{entry.category.name}</span>
                      <span>{formatSignedCurrency(entry.total)}</span>
                    </div>
                    {entry.subCategories.length > 0 && (
                      <ul className="sub-rollup">
                        {entry.subCategories.map((sub) => (
                          <li key={sub.subCategory.id}>
                            <div className="rollup-row sub">
                              <span>{sub.subCategory.name}</span>
                              <span>{formatSignedCurrency(sub.total)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Overview;

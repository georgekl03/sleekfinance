import { useCallback, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { formatCurrency, formatDate } from '../utils/format';

const Overview = () => {
  const { state } = useData();
  const accounts = useMemo(
    () => state.accounts.filter((account) => !account.archived),
    [state.accounts]
  );
  const accountGroups = useMemo(
    () => state.accountGroups.filter((group) => !group.archived),
    [state.accountGroups]
  );
  const [selectedGroup, setSelectedGroup] = useState<string>('totals');

  const rateLookup = useMemo(() => {
    const map = new Map<string, number>();
    state.settings.exchangeRates.forEach((rate) => {
      map.set(rate.currency.toUpperCase(), rate.rateToBase);
    });
    if (!map.has(state.settings.baseCurrency.toUpperCase())) {
      map.set(state.settings.baseCurrency.toUpperCase(), 1);
    }
    return map;
  }, [state.settings.baseCurrency, state.settings.exchangeRates]);

  const convertToBase = useCallback(
    (amount: number, currency: string) => {
      const rate = rateLookup.get(currency.toUpperCase()) ?? 1;
      return amount * rate;
    },
    [rateLookup]
  );

  const filteredAccounts = useMemo(() => {
    if (selectedGroup === 'all') return accounts;
    if (selectedGroup === 'totals') {
      return accounts.filter((account) => account.includeInTotals);
    }
    const group = accountGroups.find((item) => item.id === selectedGroup);
    if (!group) return accounts;
    return accounts.filter((account) => group.accountIds.includes(account.id));
  }, [accounts, accountGroups, selectedGroup]);

  const totalBalance = useMemo(
    () =>
      filteredAccounts.reduce(
        (sum, account) => sum + convertToBase(account.currentBalance, account.currency),
        0
      ),
    [convertToBase, filteredAccounts]
  );

  const sixMonthAgo = useMemo(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    return date;
  }, []);

  const income = useMemo(() => {
    return state.transactions
      .filter((transaction) => new Date(transaction.date) >= sixMonthAgo)
      .filter((transaction) => transaction.amount > 0)
      .reduce((sum, transaction) => sum + convertToBase(transaction.amount, transaction.currency), 0);
  }, [convertToBase, state.transactions, sixMonthAgo]);

  const spending = useMemo(() => {
    return state.transactions
      .filter((transaction) => new Date(transaction.date) >= sixMonthAgo)
      .filter((transaction) => transaction.amount < 0)
      .reduce((sum, transaction) => sum + convertToBase(transaction.amount, transaction.currency), 0);
  }, [convertToBase, state.transactions, sixMonthAgo]);

  const netFlow = income + spending;

  return (
    <div className="content-stack">
      <PageHeader
        title="Overview"
        description="High-level health of your finances with account group filters and rolling metrics."
      />
      <div className="form-card">
        <h3>Focus</h3>
        <div className="chip-list">
          <button
            type="button"
            className={`chip-button ${selectedGroup === 'totals' ? 'active' : ''}`}
            onClick={() => setSelectedGroup('totals')}
          >
            Included in totals
          </button>
          <button
            type="button"
            className={`chip-button ${selectedGroup === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedGroup('all')}
          >
            All accounts
          </button>
          {accountGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`chip-button ${selectedGroup === group.id ? 'active' : ''}`}
              onClick={() => setSelectedGroup(group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      </div>
      <div className="content-card">
        <h3>Snapshot</h3>
        <div className="placeholder-grid" aria-label="Overview metrics">
          <div className="placeholder-tile">
            <h3>Total balance</h3>
            <p>{formatCurrency(totalBalance, state.settings.baseCurrency)}</p>
            <Tooltip label="Sum of current balances for the filtered accounts." />
          </div>
          <div className="placeholder-tile">
            <h3>6 month income</h3>
            <p>{formatCurrency(income, state.settings.baseCurrency)}</p>
            <Tooltip label="Positive transactions from the last six months." />
          </div>
          <div className="placeholder-tile">
            <h3>6 month spending</h3>
            <p>{formatCurrency(spending, state.settings.baseCurrency)}</p>
            <Tooltip label="Negative transactions from the last six months." />
          </div>
          <div className="placeholder-tile">
            <h3>Net cash flow</h3>
            <p>{formatCurrency(netFlow, state.settings.baseCurrency)}</p>
            <Tooltip label="Income plus spending across the same period." />
          </div>
        </div>
      </div>
      <div className="content-card">
        <div className="section-title">
          <h3>Accounts ({filteredAccounts.length})</h3>
          <span className="muted-text">Last updated {state.lastUpdated ? formatDate(state.lastUpdated) : 'recently'}</span>
        </div>
        <div className="account-grid">
          {filteredAccounts.map((account) => (
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
                <strong>{formatCurrency(account.currentBalance, account.currency)}</strong>
              </p>
              {account.includeOnlyGroupIds.length > 0 && (
                <div className="chip-list">
                  {account.includeOnlyGroupIds.map((groupId) => {
                    const group = accountGroups.find((item) => item.id === groupId);
                    if (!group) return null;
                    return (
                      <span key={groupId} className="pill pill-muted">
                        {group.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {filteredAccounts.length === 0 && <p className="muted-text">No accounts in this focus.</p>}
        </div>
      </div>
    </div>
  );
};

export default Overview;

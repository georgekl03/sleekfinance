import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, DataActionError, Payee, Tag, Transaction } from '../data/models';
import { formatCurrency, formatDate } from '../utils/format';

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type TransactionRowProps = {
  transaction: Transaction;
  accounts: Account[];
  payees: Payee[];
  tags: Tag[];
};

const TransactionRow = ({ transaction, accounts, payees, tags }: TransactionRowProps) => {
  const { updateTransaction, archiveTransaction } = useData();
  const account = accounts.find((item) => item.id === transaction.accountId);
  const payee = payees.find((item) => item.id === transaction.payeeId);

  const handleTagChange = (selected: string[]) => {
    updateTransaction(transaction.id, { tags: selected });
  };

  const handleArchive = () => {
    if (window.confirm('Archive this transaction?')) {
      archiveTransaction(transaction.id);
    }
  };

  return (
    <tr>
      <td>{formatDate(transaction.date)}</td>
      <td>{account ? account.name : 'Unknown account'}</td>
      <td>{payee ? payee.name : 'Unassigned'}</td>
      <td>{formatCurrency(transaction.amount)}</td>
      <td>{transaction.memo ?? '—'}</td>
      <td>
        <select
          multiple
          value={transaction.tags}
          onChange={(event) =>
            handleTagChange(Array.from(event.target.selectedOptions, (option) => option.value))
          }
        >
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        {transaction.tags.length === 0 && <span className="muted-text">No tags</span>}
      </td>
      <td>
        <button type="button" className="secondary-button" onClick={handleArchive}>
          Archive
        </button>
      </td>
    </tr>
  );
};

const Transactions = () => {
  const { state, addTransaction } = useData();
  const accounts = useMemo(() => state.accounts.filter((account) => !account.archived), [state.accounts]);
  const payees = useMemo(() => state.payees.filter((payee) => !payee.archived), [state.payees]);
  const tags = useMemo(() => state.tags.filter((tag) => !tag.archived), [state.tags]);
  const accountGroups = useMemo(
    () => state.accountGroups.filter((group) => !group.archived),
    [state.accountGroups]
  );
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [transactionError, setTransactionError] = useState<DataActionError | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    accountId: accounts[0]?.id ?? '',
    payeeId: '',
    amount: '',
    memo: '',
    tags: [] as string[]
  });

  useEffect(() => {
    if (!accounts.find((account) => account.id === form.accountId) && accounts[0]) {
      setForm((current) => ({ ...current, accountId: accounts[0].id }));
    }
  }, [accounts, form.accountId]);

  const filteredAccounts = useMemo(() => {
    if (selectedGroup === 'all') return accounts;
    if (selectedGroup === 'totals') {
      return accounts.filter((account) => account.includeInTotals);
    }
    const group = accountGroups.find((item) => item.id === selectedGroup);
    if (!group) return accounts;
    return accounts.filter((account) => group.accountIds.includes(account.id));
  }, [accounts, accountGroups, selectedGroup]);

  const visibleTransactions = useMemo(() => {
    const relevantAccountIds = new Set(filteredAccounts.map((account) => account.id));
    return [...state.transactions]
      .filter((transaction) => relevantAccountIds.has(transaction.accountId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredAccounts, state.transactions]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number.parseFloat(form.amount);
    if (!form.accountId || Number.isNaN(amount)) {
      setTransactionError({
        title: 'Missing details',
        description: 'Account and a valid numeric amount are required.'
      });
      return;
    }
    addTransaction({
      accountId: form.accountId,
      payeeId: form.payeeId || null,
      date: new Date(form.date).toISOString(),
      amount,
      memo: form.memo,
      categoryId: null,
      subCategoryId: null,
      tags: form.tags
    });
    setTransactionError(null);
    setForm({
      date: new Date().toISOString().slice(0, 10),
      accountId: form.accountId,
      payeeId: '',
      amount: '',
      memo: '',
      tags: []
    });
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Transactions"
        description="Review activity, assign tags, and filter by account group focus chips."
      />
      <div className="form-card">
        <h3>Filter</h3>
        <div className="chip-list">
          <button
            type="button"
            className={`chip-button ${selectedGroup === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedGroup('all')}
          >
            All accounts
          </button>
          <button
            type="button"
            className={`chip-button ${selectedGroup === 'totals' ? 'active' : ''}`}
            onClick={() => setSelectedGroup('totals')}
          >
            Included in totals
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
      <div className="form-card">
        <h3>Add transaction</h3>
        <form onSubmit={handleSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="transaction-date">
              Date
              <Tooltip label="Transaction posting date." />
            </label>
            <input
              id="transaction-date"
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="transaction-account">
              Account
              <Tooltip label="The account where the transaction belongs." />
            </label>
            <select
              id="transaction-account"
              value={form.accountId}
              onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-payee">
              Payee
              <Tooltip label="Pick a payee to apply default categories and notes." />
            </label>
            <select
              id="transaction-payee"
              value={form.payeeId}
              onChange={(event) => setForm((current) => ({ ...current, payeeId: event.target.value }))}
            >
              <option value="">Unassigned</option>
              {payees.map((payee) => (
                <option key={payee.id} value={payee.id}>
                  {payee.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-amount">
              Amount
              <Tooltip label="Negative for spending, positive for inflows." />
            </label>
            <input
              id="transaction-amount"
              type="number"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="transaction-tags">
              Tags
              <Tooltip label="Attach tags for reporting." />
            </label>
            <select
              id="transaction-tags"
              multiple
              value={form.tags}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tags: Array.from(event.target.selectedOptions, (option) => option.value)
                }))
              }
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="transaction-memo">
              Memo
              <Tooltip label="Optional note describing the transaction." />
            </label>
            <textarea
              id="transaction-memo"
              value={form.memo}
              onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add transaction
            </button>
          </div>
          {renderError(transactionError)}
        </form>
      </div>
      <div className="content-card">
        <h3>Transactions ({visibleTransactions.length})</h3>
        <div className="muted-text">Filtered to {filteredAccounts.length} account(s).</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Account</th>
                <th scope="col">Payee</th>
                <th scope="col">Amount</th>
                <th scope="col">Memo</th>
                <th scope="col">Tags</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  accounts={accounts}
                  payees={payees}
                  tags={tags}
                />
              ))}
              {visibleTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-text">
                    No transactions for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Transactions;

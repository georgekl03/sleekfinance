import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import {
  Account,
  DataActionError,
  Payee,
  RuleActionField,
  RuleRunPreview,
  Tag,
  Transaction
} from '../data/models';
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
  baseCurrency: string;
  selected: boolean;
  onToggleSelect: (id: string) => void;
};

const TransactionRow = ({
  transaction,
  accounts,
  payees,
  tags,
  baseCurrency,
  selected,
  onToggleSelect
}: TransactionRowProps) => {
  const { updateTransaction, archiveTransaction } = useData();
  const account = accounts.find((item) => item.id === transaction.accountId);
  const payee = payees.find((item) => item.id === transaction.payeeId);
  const currency = account?.currency ?? transaction.currency ?? baseCurrency;

  const showFxDetails =
    transaction.nativeCurrency &&
    transaction.nativeCurrency !== currency &&
    typeof transaction.nativeAmount === 'number';

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
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(transaction.id)}
          aria-label="Select transaction"
        />
      </td>
      <td>{formatDate(transaction.date)}</td>
      <td>{account ? account.name : 'Unknown account'}</td>
      <td>{payee ? payee.name : 'Unassigned'}</td>
      <td>
        {formatCurrency(transaction.amount, currency)}
        {showFxDetails && (
          <div className="muted-text" style={{ fontSize: '0.75rem' }}>
            {formatCurrency(transaction.nativeAmount ?? 0, transaction.nativeCurrency ?? currency)}
            {transaction.fxRate && (
              <>
                {' '}
                (rate {transaction.fxRate.toFixed(4)})
              </>
            )}
            {transaction.needsFx && <span className="badge" style={{ marginLeft: '0.5rem' }}>Needs FX</span>}
          </div>
        )}
      </td>
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
  const { state, addTransaction, previewRuleRun, runRules } = useData();
  const accounts = useMemo(() => state.accounts.filter((account) => !account.archived), [state.accounts]);
  const payees = useMemo(() => state.payees.filter((payee) => !payee.archived), [state.payees]);
  const tags = useMemo(() => state.tags.filter((tag) => !tag.archived), [state.tags]);
  const collections = useMemo(() => state.accountCollections, [state.accountCollections]);
  const [selectedCollection, setSelectedCollection] = useState<string>('all');
  const [transactionError, setTransactionError] = useState<DataActionError | null>(null);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [runPreview, setRunPreview] = useState<RuleRunPreview | null>(null);
  const [previewContext, setPreviewContext] = useState<{ transactionIds: string[]; description: string } | null>(null);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualAccountId, setManualAccountId] = useState<string>('all');
  const [runMessage, setRunMessage] = useState<string | null>(null);
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

  useEffect(() => {
    setSelectedTransactionIds((current) =>
      current.filter((id) => state.transactions.some((txn) => txn.id === id))
    );
  }, [state.transactions]);

  const filteredAccounts = useMemo(() => {
    if (selectedCollection === 'all') return accounts;
    if (selectedCollection === 'totals') {
      return accounts.filter((account) => account.includeInTotals);
    }
    const collection = collections.find((item) => item.id === selectedCollection);
    if (!collection) return accounts;
    return accounts.filter((account) => account.collectionIds.includes(collection.id));
  }, [accounts, collections, selectedCollection]);

  const visibleTransactions = useMemo(() => {
    const relevantAccountIds = new Set(filteredAccounts.map((account) => account.id));
    return [...state.transactions]
      .filter((transaction) => relevantAccountIds.has(transaction.accountId))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredAccounts, state.transactions]);

  const toggleTransactionSelection = (id: string) => {
    setSelectedTransactionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const allVisibleSelected =
    visibleTransactions.length > 0 &&
    visibleTransactions.every((transaction) => selectedTransactionIds.includes(transaction.id));

  const toggleSelectAllVisible = () => {
    setSelectedTransactionIds((current) => {
      if (allVisibleSelected) {
        const visibleIds = new Set(visibleTransactions.map((txn) => txn.id));
        return current.filter((id) => !visibleIds.has(id));
      }
      const combined = new Set([...current, ...visibleTransactions.map((txn) => txn.id)]);
      return Array.from(combined);
    });
  };

  const handlePreviewSelected = () => {
    if (selectedTransactionIds.length === 0) return;
    const preview = previewRuleRun(selectedTransactionIds);
    setRunPreview(preview);
    setPreviewContext({
      transactionIds: selectedTransactionIds,
      description: `${selectedTransactionIds.length} selected transaction${selectedTransactionIds.length === 1 ? '' : 's'}`
    });
    setRunMessage(null);
  };

  const handlePreviewFiltered = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startDate = manualStart ? new Date(manualStart) : null;
    const endDate = manualEnd ? new Date(manualEnd) : null;
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }
    const filteredIds = state.transactions
      .filter((transaction) => {
        if (manualAccountId !== 'all' && transaction.accountId !== manualAccountId) {
          return false;
        }
        const dateValue = new Date(transaction.date);
        if (Number.isNaN(dateValue.getTime())) return false;
        if (startDate && dateValue < startDate) return false;
        if (endDate && dateValue > endDate) return false;
        return true;
      })
      .map((transaction) => transaction.id);
    const descriptionParts: string[] = [];
    if (manualStart || manualEnd) {
      descriptionParts.push(`${manualStart || 'any'} to ${manualEnd || 'any'}`);
    } else {
      descriptionParts.push('all dates');
    }
    if (manualAccountId !== 'all') {
      const account = accounts.find((acct) => acct.id === manualAccountId);
      descriptionParts.push(account ? account.name : 'selected account');
    } else {
      descriptionParts.push('all accounts');
    }
    const preview = previewRuleRun(filteredIds);
    setRunPreview(preview);
    setPreviewContext({
      transactionIds: filteredIds,
      description: `Transactions (${descriptionParts.join(', ')})`
    });
    setRunMessage(null);
  };

  const handleConfirmRun = () => {
    if (!previewContext) return;
    const logEntry = runRules(previewContext.transactionIds, 'manual', previewContext.description);
    if (logEntry) {
      setRunMessage(
        `Rules ran on ${logEntry.transactionCount} transaction${logEntry.transactionCount === 1 ? '' : 's'}.`
      );
    }
    setRunPreview(null);
    setPreviewContext(null);
    setSelectedTransactionIds([]);
  };

  const handleCancelPreview = () => {
    setRunPreview(null);
    setPreviewContext(null);
  };

  const actionLabels: Record<RuleActionField, string> = {
    category: 'Set category',
    tags: 'Add tags',
    payee: 'Set payee',
    memo: 'Update notes',
    needsFx: 'Clear FX flag',
    flow: 'Mark transfer'
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number.parseFloat(form.amount);
    const account = accounts.find((acct) => acct.id === form.accountId);
    if (!account || Number.isNaN(amount)) {
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
      currency: account.currency,
      nativeAmount: amount,
      nativeCurrency: account.currency,
      needsFx: false,
      memo: form.memo,
      categoryId: null,
      subCategoryId: null,
      tags: form.tags,
      importBatchId: null,
      metadata: undefined,
      isDemo: false
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
        description="Review activity, assign tags, and filter by account collections."
      />
      <div className="content-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3>Run rules manually</h3>
        <p className="muted-text">
          Preview before applying. Rules never change amounts, currencies, accounts, or dates.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handlePreviewSelected}
              disabled={selectedTransactionIds.length === 0}
            >
              Preview on selected ({selectedTransactionIds.length})
            </button>
            <form
              onSubmit={handlePreviewFiltered}
              style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}
            >
              <label>
                Start date
                <input type="date" value={manualStart} onChange={(event) => setManualStart(event.target.value)} />
              </label>
              <label>
                End date
                <input type="date" value={manualEnd} onChange={(event) => setManualEnd(event.target.value)} />
              </label>
              <label>
                Account
                <select value={manualAccountId} onChange={(event) => setManualAccountId(event.target.value)}>
                  <option value="all">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="secondary-button">
                Preview range
              </button>
            </form>
          </div>
          {runPreview && previewContext && (
            <div style={{ border: '1px solid var(--border-muted)', borderRadius: '0.5rem', padding: '1rem' }}>
              <h4 style={{ marginTop: 0 }}>Preview summary</h4>
              <p className="muted-text" style={{ marginTop: 0 }}>
                {previewContext.description} — {runPreview.transactionCount} transaction
                {runPreview.transactionCount === 1 ? '' : 's'}.
              </p>
              {runPreview.summaries.length === 0 ? (
                <p>No enabled rules will run for this selection.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rule</th>
                      <th>Matches</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runPreview.summaries.map((summary) => (
                      <tr key={summary.ruleId}>
                        <td>{summary.ruleName}</td>
                        <td>{summary.matched}</td>
                        <td>
                          {summary.actionFields.length === 0
                            ? 'No actions'
                            : summary.actionFields.map((field) => actionLabels[field]).join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button type="button" className="primary-button" onClick={handleConfirmRun}>
                  Apply rules
                </button>
                <button type="button" className="secondary-button" onClick={handleCancelPreview}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {runMessage && <p className="muted-text">{runMessage}</p>}
        </div>
      </div>
      <div className="form-card">
        <h3>Filter</h3>
        <div className="chip-list">
          <button
            type="button"
            className={`chip-button ${selectedCollection === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCollection('all')}
          >
            All accounts
          </button>
          <button
            type="button"
            className={`chip-button ${selectedCollection === 'totals' ? 'active' : ''}`}
            onClick={() => setSelectedCollection('totals')}
          >
            Included in totals
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
                <th scope="col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible transactions"
                  />
                </th>
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
                  baseCurrency={state.settings.baseCurrency}
                  selected={selectedTransactionIds.includes(transaction.id)}
                  onToggleSelect={toggleTransactionSelection}
                />
              ))}
              {visibleTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted-text">
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

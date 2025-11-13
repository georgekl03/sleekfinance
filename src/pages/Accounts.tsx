import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, AccountCollection, DataActionError } from '../data/models';
import { formatCurrency } from '../utils/format';

const ACCOUNT_TYPE_OPTIONS: { label: string; value: Account['type'] }[] = [
  { label: 'Current', value: 'checking' },
  { label: 'Savings', value: 'savings' },
  { label: 'Credit card', value: 'credit' },
  { label: 'ISA / Brokerage', value: 'investment' },
  { label: 'Cash', value: 'cash' },
  { label: 'Loan', value: 'loan' }
];

const TYPE_LABEL: Record<Account['type'], string> = {
  checking: 'Current',
  savings: 'Savings',
  credit: 'Credit card',
  loan: 'Loan',
  investment: 'ISA / Brokerage',
  cash: 'Cash'
};

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type AccountListItemProps = {
  account: Account;
  providerLabel: string;
  isSelected: boolean;
  onSelect: () => void;
};

const AccountListItem = ({ account, providerLabel, isSelected, onSelect }: AccountListItemProps) => {
  return (
    <button
      type="button"
      className={`account-list-item${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <div className="account-list-item__top">
        <div>
          <p className="account-list-item__name">{account.name}</p>
          <div className="account-list-item__meta">
            <span className="provider-pill">{providerLabel || 'No provider'}</span>
            <span>{TYPE_LABEL[account.type] ?? account.type}</span>
            <span>{account.currency}</span>
            <span>{formatCurrency(account.currentBalance, account.currency)}</span>
          </div>
        </div>
        <div className="account-status-icons" aria-hidden="true">
          {account.archived && <span title="Hidden from lists">🙈</span>}
          {!account.includeInTotals && <span title="Excluded from net worth">∅</span>}
        </div>
      </div>
    </button>
  );
};

type AccountEditorProps = {
  account: Account;
  providerDirectory: string[];
  collections: AccountCollection[];
  onArchive: () => void;
  onRestore: () => void;
};

const AccountEditor = ({
  account,
  providerDirectory,
  collections,
  onArchive,
  onRestore
}: AccountEditorProps) => {
  const { updateAccount, setAccountInclusion, recordProviderName } = useData();
  const providerOptions = useMemo(
    () => providerDirectory.slice().sort((a, b) => a.localeCompare(b)),
    [providerDirectory]
  );
  const [basicForm, setBasicForm] = useState({
    name: account.name,
    provider: account.provider,
    type: account.type,
    currency: account.currency,
    openingBalance: account.openingBalance.toString(),
    openingBalanceDate: account.openingBalanceDate.slice(0, 10)
  });
  const [advancedForm, setAdvancedForm] = useState({
    currentBalance: account.currentBalance.toString(),
    accountNumber: account.accountNumber ?? '',
    notes: account.notes ?? '',
    collectionIds: account.collectionIds
  });
  const [basicError, setBasicError] = useState<DataActionError | null>(null);
  const [advancedError, setAdvancedError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setBasicForm({
      name: account.name,
      provider: account.provider,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
      openingBalanceDate: account.openingBalanceDate.slice(0, 10)
    });
    setAdvancedForm({
      currentBalance: account.currentBalance.toString(),
      accountNumber: account.accountNumber ?? '',
      notes: account.notes ?? '',
      collectionIds: account.collectionIds
    });
    setBasicError(null);
    setAdvancedError(null);
  }, [account]);

  const handleBasicSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    recordProviderName(basicForm.provider);
    const result = updateAccount(account.id, {
      name: basicForm.name,
      provider: basicForm.provider,
      type: basicForm.type,
      currency: basicForm.currency,
      openingBalance: Number.parseFloat(basicForm.openingBalance || '0'),
      openingBalanceDate: basicForm.openingBalanceDate
    });
    setBasicError(result);
  };

  const handleNetWorthToggle = (checked: boolean) => {
    const result = setAccountInclusion(account.id, checked ? 'included' : 'excluded');
    setBasicError(result);
  };

  const handleShowInListsToggle = (checked: boolean) => {
    if (checked) {
      onRestore();
    } else {
      onArchive();
    }
  };

  const handleArchiveClick = () => {
    if (window.confirm(`Archive ${account.name}? This hides the account but keeps history.`)) {
      onArchive();
    }
  };

  const handleAdvancedSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedBalance = Number.parseFloat(advancedForm.currentBalance || '0');
    const result = updateAccount(account.id, {
      currentBalance: Number.isNaN(parsedBalance) ? account.currentBalance : parsedBalance,
      accountNumber: advancedForm.accountNumber.trim() ? advancedForm.accountNumber.trim() : undefined,
      notes: advancedForm.notes ? advancedForm.notes : undefined,
      collectionIds: advancedForm.collectionIds
    });
    setAdvancedError(result);
  };

  return (
    <div className="account-editor">
      <header className="account-editor__header">
        <h3>{account.name}</h3>
      </header>

      <form className="form-grid" onSubmit={handleBasicSubmit}>
        <div className="field">
          <label htmlFor="account-name">
            Account name
            <Tooltip label="Displayed across the workspace." />
          </label>
          <input
            id="account-name"
            value={basicForm.name}
            onChange={(event) =>
              setBasicForm((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
        </div>
        <div className="field">
          <label htmlFor="account-provider">
            Provider
            <Tooltip label="Select or type who holds this account." />
          </label>
          <input
            id="account-provider"
            list="provider-suggestions"
            value={basicForm.provider}
            onChange={(event) =>
              setBasicForm((current) => ({ ...current, provider: event.target.value }))
            }
            onBlur={(event) => recordProviderName(event.target.value)}
            placeholder="e.g. Barclays"
            required
          />
          <datalist id="provider-suggestions">
            {providerOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="account-type">
            Account type
            <Tooltip label="Choose the closest type for this account." />
          </label>
          <select
            id="account-type"
            value={basicForm.type}
            onChange={(event) =>
              setBasicForm((current) => ({
                ...current,
                type: event.target.value as Account['type']
              }))
            }
          >
            {ACCOUNT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="account-currency">
            Currency
            <Tooltip label="Native currency for this account." />
          </label>
          <input
            id="account-currency"
            value={basicForm.currency}
            onChange={(event) =>
              setBasicForm((current) => ({
                ...current,
                currency: event.target.value.toUpperCase()
              }))
            }
            maxLength={3}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="opening-balance">
            Opening balance
            <Tooltip label="Starting balance for reconciliation." />
          </label>
          <input
            id="opening-balance"
            type="number"
            value={basicForm.openingBalance}
            onChange={(event) =>
              setBasicForm((current) => ({
                ...current,
                openingBalance: event.target.value
              }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="opening-date">
            Opening balance date
            <Tooltip label="Must not be in the future." />
          </label>
          <input
            id="opening-date"
            type="date"
            value={basicForm.openingBalanceDate}
            onChange={(event) =>
              setBasicForm((current) => ({
                ...current,
                openingBalanceDate: event.target.value
              }))
            }
          />
        </div>
        <div className="toggle-row">
          <label htmlFor="show-in-lists">
            Show in lists
            <Tooltip label="Hide or reveal this account in pickers without archiving history." />
          </label>
          <input
            id="show-in-lists"
            type="checkbox"
            checked={!account.archived}
            onChange={(event) => handleShowInListsToggle(event.target.checked)}
          />
        </div>
        <div className="toggle-row">
          <label htmlFor="count-in-net-worth">
            Count in Net Worth
            <Tooltip label="Toggle whether this account contributes to overview totals." />
          </label>
          <input
            id="count-in-net-worth"
            type="checkbox"
            checked={account.includeInTotals}
            onChange={(event) => handleNetWorthToggle(event.target.checked)}
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button">
            Save basic details
          </button>
        </div>
        {renderError(basicError)}
      </form>
      <details className="advanced-section">
        <summary>Advanced settings</summary>
        <form className="form-grid" onSubmit={handleAdvancedSubmit}>
          <div className="field">
            <label htmlFor="current-balance">
              Current balance
              <Tooltip label="Manually update for offline reconciliation." />
            </label>
            <input
              id="current-balance"
              type="number"
              value={advancedForm.currentBalance}
              onChange={(event) =>
                setAdvancedForm((current) => ({
                  ...current,
                  currentBalance: event.target.value
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="account-number">
              Account reference
              <Tooltip label="Optional account number or identifier." />
            </label>
            <input
              id="account-number"
              value={advancedForm.accountNumber}
              onChange={(event) =>
                setAdvancedForm((current) => ({
                  ...current,
                  accountNumber: event.target.value
                }))
              }
            />
          </div>
          <div className="field full-width">
            <label htmlFor="account-notes">
              Notes
              <Tooltip label="Capture context, service quirks, or reconciliation reminders." />
            </label>
            <textarea
              id="account-notes"
              value={advancedForm.notes}
              onChange={(event) =>
                setAdvancedForm((current) => ({
                  ...current,
                  notes: event.target.value
                }))
              }
              rows={4}
            />
          </div>
          <div className="field">
            <label htmlFor="account-collections">
              Collections
              <Tooltip label="Assign this account to one or more collections for filtering." />
            </label>
            <select
              id="account-collections"
              multiple
              value={advancedForm.collectionIds}
              onChange={(event) =>
                setAdvancedForm((current) => ({
                  ...current,
                  collectionIds: Array.from(event.target.selectedOptions, (option) => option.value)
                }))
              }
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <p className="muted-text small">Hold Ctrl/Cmd to select multiple.</p>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Save advanced details
            </button>
            <button type="button" className="danger-button" onClick={handleArchiveClick}>
              Archive account
            </button>
          </div>
          {renderError(advancedError)}
        </form>
      </details>
    </div>
  );
};

type PanelMode = 'view' | 'create-account';

const Accounts = () => {
  const {
    state,
    recordProviderName,
    createAccount,
    archiveAccount,
    unarchiveAccount
  } = useData();
  const providerDirectory = useMemo(() => [...state.providerDirectory], [state.providerDirectory]);
  const collections = useMemo(() => [...state.accountCollections], [state.accountCollections]);
  const accounts = useMemo(() => [...state.accounts], [state.accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('view');
  const [newAccountForm, setNewAccountForm] = useState({
    provider: '',
    name: '',
    type: 'checking' as Account['type'],
    currency: state.settings.baseCurrency,
    openingBalance: '0',
    openingBalanceDate: new Date().toISOString().slice(0, 10),
    includeInTotals: true,
    collectionIds: [] as string[],
    accountNumber: ''
  });
  const [newAccountError, setNewAccountError] = useState<DataActionError | null>(null);
  const [pendingSelection, setPendingSelection] = useState<
    { name: string; provider: string } | null
  >(null);

  useEffect(() => {
    if (panelMode !== 'view') return;
    if (pendingSelection) {
      const match = accounts.find(
        (acct) =>
          acct.provider.toLocaleLowerCase() === pendingSelection.provider.toLocaleLowerCase() &&
          acct.name === pendingSelection.name
      );
      if (match) {
        setSelectedAccountId(match.id);
        setPendingSelection(null);
        return;
      }
    }
    if (selectedAccountId && accounts.some((acct) => acct.id === selectedAccountId)) {
      return;
    }
    const fallback = accounts.find((acct) => !acct.archived) ?? accounts[0] ?? null;
    setSelectedAccountId(fallback ? fallback.id : null);
  }, [accounts, panelMode, pendingSelection, selectedAccountId]);

  const handleSelectAccount = (accountId: string) => {
    setPanelMode('view');
    setSelectedAccountId(accountId);
  };

  const handleNewAccountSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    recordProviderName(newAccountForm.provider);
    const parsedOpeningBalance = Number.parseFloat(newAccountForm.openingBalance || '0');
    const result = createAccount({
      provider: newAccountForm.provider,
      name: newAccountForm.name,
      type: newAccountForm.type,
      currency: newAccountForm.currency,
      openingBalance: Number.isNaN(parsedOpeningBalance) ? 0 : parsedOpeningBalance,
      openingBalanceDate: newAccountForm.openingBalanceDate,
      includeInTotals: newAccountForm.includeInTotals,
      collectionIds: newAccountForm.collectionIds,
      accountNumber: newAccountForm.accountNumber || undefined,
      notes: undefined
    });
    setNewAccountError(result);
    if (!result) {
      setNewAccountForm({
        provider: '',
        name: '',
        type: 'checking',
        currency: state.settings.baseCurrency,
        openingBalance: '0',
        openingBalanceDate: new Date().toISOString().slice(0, 10),
        includeInTotals: true,
        collectionIds: [],
        accountNumber: ''
      });
      setPendingSelection({ name: newAccountForm.name, provider: newAccountForm.provider });
      setPanelMode('view');
    }
  };

  const selectedAccount = panelMode === 'view'
    ? accounts.find((account) => account.id === selectedAccountId) ?? null
    : null;

  return (
    <div className="content-stack">
      <PageHeader
        title="Accounts"
        description="Browse all accounts on the left, then adjust settings in the editor."
      />
      <div className="accounts-layout">
        <aside className="accounts-list">
          <div className="accounts-list__actions">
            <button type="button" className="secondary-button" onClick={() => setPanelMode('create-account')}>
              New account
            </button>
          </div>
          <div className="accounts-list__items">
            {accounts.length === 0 && (
              <p className="muted-text">No accounts yet. Create one to get started.</p>
            )}
            {accounts
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((account) => (
                <AccountListItem
                  key={account.id}
                  account={account}
                  providerLabel={account.provider}
                  isSelected={panelMode === 'view' && selectedAccountId === account.id}
                  onSelect={() => handleSelectAccount(account.id)}
                />
              ))}
          </div>
        </aside>
        <section className="accounts-panel">
          {panelMode === 'create-account' ? (
            <div className="form-card">
              <h3>New account</h3>
              <form onSubmit={handleNewAccountSubmit} className="form-grid two-column">
                <div className="field">
                  <label htmlFor="new-account-provider">
                    Provider
                    <Tooltip label="Choose or type who holds this account." />
                  </label>
                  <input
                    id="new-account-provider"
                    list="provider-directory"
                    value={newAccountForm.provider}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({ ...current, provider: event.target.value }))
                    }
                    onBlur={(event) => recordProviderName(event.target.value)}
                    required
                  />
                  <datalist id="provider-directory">
                    {providerDirectory.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor="new-account-name">
                    Account name
                    <Tooltip label="Friendly name shown across the app." />
                  </label>
                  <input
                    id="new-account-name"
                    value={newAccountForm.name}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-account-type">
                    Account type
                    <Tooltip label="Pick the closest fit." />
                  </label>
                  <select
                    id="new-account-type"
                    value={newAccountForm.type}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        type: event.target.value as Account['type']
                      }))
                    }
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="new-account-currency">
                    Currency
                    <Tooltip label="Native currency for this account." />
                  </label>
                  <input
                    id="new-account-currency"
                    value={newAccountForm.currency}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase()
                      }))
                    }
                    maxLength={3}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-account-opening-balance">
                    Opening balance
                    <Tooltip label="Starting balance for reconciliation." />
                  </label>
                  <input
                    id="new-account-opening-balance"
                    value={newAccountForm.openingBalance}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        openingBalance: event.target.value
                      }))
                    }
                    type="number"
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-account-opening-date">
                    Opening balance date
                    <Tooltip label="Must not be in the future." />
                  </label>
                  <input
                    id="new-account-opening-date"
                    type="date"
                    value={newAccountForm.openingBalanceDate}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        openingBalanceDate: event.target.value
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-account-number">
                    Account reference
                    <Tooltip label="Optional account number." />
                  </label>
                  <input
                    id="new-account-number"
                    value={newAccountForm.accountNumber}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        accountNumber: event.target.value
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-account-inclusion">
                    Count in Net Worth
                    <Tooltip label="Toggle whether this account contributes to overview totals." />
                  </label>
                  <select
                    id="new-account-inclusion"
                    value={newAccountForm.includeInTotals ? 'yes' : 'no'}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        includeInTotals: event.target.value === 'yes'
                      }))
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="new-account-collections">
                    Collections
                    <Tooltip label="Add this account to any collections for filtering." />
                  </label>
                  <select
                    id="new-account-collections"
                    multiple
                    value={newAccountForm.collectionIds}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        collectionIds: Array.from(event.target.selectedOptions, (option) => option.value)
                      }))
                    }
                  >
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                  <p className="muted-text small">Hold Ctrl/Cmd to select multiple.</p>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    Create account
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setPanelMode('view')}>
                    Cancel
                  </button>
                </div>
                {renderError(newAccountError)}
              </form>
            </div>
          ) : selectedAccount ? (
            <AccountEditor
              account={selectedAccount}
              providerDirectory={providerDirectory}
              collections={collections}
              onArchive={() => archiveAccount(selectedAccount.id)}
              onRestore={() => unarchiveAccount(selectedAccount.id)}
            />
          ) : (
            <div className="content-card">
              <h3>Select an account</h3>
              <p className="muted-text">
                Choose an account from the list to edit its settings, or create a new one to begin.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Accounts;

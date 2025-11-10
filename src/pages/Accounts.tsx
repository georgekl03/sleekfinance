import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, AccountGroup, DataActionError, Institution } from '../data/models';
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
  provider?: Institution;
  isSelected: boolean;
  onSelect: () => void;
};

const AccountListItem = ({ account, provider, isSelected, onSelect }: AccountListItemProps) => {
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
            <span className="provider-pill">{provider ? provider.name : 'No provider'}</span>
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
  providers: Institution[];
  includeGroups: AccountGroup[];
  excludeGroups: AccountGroup[];
  activeTab: 'basic' | 'advanced';
  onTabChange: (tab: 'basic' | 'advanced') => void;
  onArchive: () => void;
  onRestore: () => void;
};

const AccountEditor = ({
  account,
  providers,
  includeGroups,
  excludeGroups,
  activeTab,
  onTabChange,
  onArchive,
  onRestore
}: AccountEditorProps) => {
  const { updateAccount, setAccountInclusion, updateAccountGroupsForAccount } = useData();
  const providerOptions = useMemo(
    () => providers.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [providers]
  );
  const [basicForm, setBasicForm] = useState({
    name: account.name,
    institutionId: account.institutionId,
    type: account.type,
    currency: account.currency,
    openingBalance: account.openingBalance.toString(),
    openingBalanceDate: account.openingBalanceDate.slice(0, 10)
  });
  const [advancedForm, setAdvancedForm] = useState({
    currentBalance: account.currentBalance.toString(),
    accountNumber: account.accountNumber ?? '',
    notes: account.notes ?? ''
  });
  const [basicError, setBasicError] = useState<DataActionError | null>(null);
  const [advancedError, setAdvancedError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setBasicForm({
      name: account.name,
      institutionId: account.institutionId,
      type: account.type,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
      openingBalanceDate: account.openingBalanceDate.slice(0, 10)
    });
    setAdvancedForm({
      currentBalance: account.currentBalance.toString(),
      accountNumber: account.accountNumber ?? '',
      notes: account.notes ?? ''
    });
    setBasicError(null);
    setAdvancedError(null);
  }, [account]);

  const handleBasicSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedOpeningBalance = Number.parseFloat(basicForm.openingBalance || '0');
    const result = updateAccount(account.id, {
      name: basicForm.name,
      institutionId: basicForm.institutionId,
      type: basicForm.type,
      currency: basicForm.currency.trim().toUpperCase(),
      openingBalance: Number.isNaN(parsedOpeningBalance)
        ? account.openingBalance
        : parsedOpeningBalance,
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
      notes: advancedForm.notes ? advancedForm.notes : undefined
    });
    setAdvancedError(result);
  };

  const handleIncludeGroupChange = (groupIds: string[]) => {
    const result = updateAccountGroupsForAccount(account.id, groupIds, account.excludeGroupId);
    setAdvancedError(result);
  };

  const handleExcludeGroupChange = (groupId: string | null) => {
    const result = updateAccountGroupsForAccount(account.id, account.includeOnlyGroupIds, groupId);
    setAdvancedError(result);
  };

  return (
    <div className="account-editor">
      <header className="account-editor__header">
        <h3>{account.name}</h3>
        <div className="account-editor__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'basic'}
            className={activeTab === 'basic' ? 'active' : ''}
            onClick={() => onTabChange('basic')}
          >
            Basic
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'advanced'}
            className={activeTab === 'advanced' ? 'active' : ''}
            onClick={() => onTabChange('advanced')}
          >
            Advanced
          </button>
        </div>
      </header>

      {activeTab === 'basic' ? (
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
              <Tooltip label="Select the bank or provider for this account." />
            </label>
            <select
              id="account-provider"
              value={basicForm.institutionId}
              onChange={(event) =>
                setBasicForm((current) => ({ ...current, institutionId: event.target.value }))
              }
              required
            >
              <option value="">Select a provider</option>
              {providerOptions.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
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
      ) : (
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
              <Tooltip label="Store reference notes, statement reminders, or owner details." />
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
            <label htmlFor="include-groups">
              Include-only groups
              <Tooltip label="Collections that always reveal this account when active." />
            </label>
            <select
              id="include-groups"
              multiple
              value={account.includeOnlyGroupIds}
              onChange={(event) =>
                handleIncludeGroupChange(
                  Array.from(event.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {includeGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="muted-text small">Hold Ctrl/Cmd to select multiple collections.</p>
          </div>
          <div className="field">
            <label htmlFor="exclude-group">
              Exclude group
              <Tooltip label="Move the account into a single exclude collection." />
            </label>
            <select
              id="exclude-group"
              value={account.excludeGroupId ?? ''}
              onChange={(event) =>
                handleExcludeGroupChange(event.target.value ? event.target.value : null)
              }
            >
              <option value="">None</option>
              {excludeGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
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
      )}
    </div>
  );
};

type PanelMode = 'view' | 'create-account' | 'create-provider';

const Accounts = () => {
  const {
    state,
    createInstitution,
    createAccount,
    archiveAccount,
    unarchiveAccount
  } = useData();
  const providers = useMemo(() => [...state.institutions], [state.institutions]);
  const activeProviders = useMemo(
    () => providers.filter((provider) => !provider.archived),
    [providers]
  );
  const includeGroups = useMemo(
    () => state.accountGroups.filter((group) => group.type === 'include' && !group.archived),
    [state.accountGroups]
  );
  const excludeGroups = useMemo(
    () => state.accountGroups.filter((group) => group.type === 'exclude' && !group.archived),
    [state.accountGroups]
  );
  const accounts = useMemo(() => [...state.accounts], [state.accounts]);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>('view');
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');
  const [providerForm, setProviderForm] = useState({
    name: '',
    type: 'bank' as Institution['type'],
    website: ''
  });
  const [newAccountForm, setNewAccountForm] = useState({
    institutionId: '',
    name: '',
    type: 'checking' as Account['type'],
    currency: state.settings.baseCurrency,
    openingBalance: '0',
    openingBalanceDate: new Date().toISOString().slice(0, 10),
    includeInTotals: true,
    includeOnlyGroupIds: [] as string[],
    excludeGroupId: '',
    accountNumber: ''
  });
  const [providerError, setProviderError] = useState<DataActionError | null>(null);
  const [newAccountError, setNewAccountError] = useState<DataActionError | null>(null);
  const [pendingSelection, setPendingSelection] = useState<
    { name: string; institutionId: string } | null
  >(null);

  useEffect(() => {
    if (panelMode !== 'view') return;
    if (pendingSelection) {
      const match = accounts.find(
        (acct) =>
          acct.institutionId === pendingSelection.institutionId &&
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
    setActiveTab('basic');
  };

  const handleProviderSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createInstitution({
      name: providerForm.name,
      type: providerForm.type,
      website: providerForm.website
    });
    setProviderError(result);
    if (!result) {
      setProviderForm({ name: '', type: 'bank', website: '' });
      setPanelMode('view');
    }
  };

  const handleNewAccountSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pendingKey = {
      name: newAccountForm.name,
      institutionId: newAccountForm.institutionId
    };
    const includeOnlyGroupIds = newAccountForm.includeInTotals
      ? newAccountForm.includeOnlyGroupIds
      : [];
    const result = createAccount({
      institutionId: newAccountForm.institutionId,
      name: newAccountForm.name,
      type: newAccountForm.type,
      currency: newAccountForm.currency,
      openingBalance: Number.parseFloat(newAccountForm.openingBalance || '0'),
      openingBalanceDate: newAccountForm.openingBalanceDate,
      includeInTotals: newAccountForm.includeInTotals,
      includeOnlyGroupIds,
      excludeGroupId: newAccountForm.excludeGroupId || null,
      accountNumber: newAccountForm.accountNumber || undefined,
      notes: undefined
    });
    setNewAccountError(result);
    if (!result) {
      setNewAccountForm({
        institutionId: '',
        name: '',
        type: 'checking',
        currency: state.settings.baseCurrency,
        openingBalance: '0',
        openingBalanceDate: new Date().toISOString().slice(0, 10),
        includeInTotals: true,
        includeOnlyGroupIds: [],
        excludeGroupId: '',
        accountNumber: ''
      });
      setPendingSelection(pendingKey);
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
        description="Browse all accounts on the left, then adjust settings in the editor tabs."
      />
      <div className="accounts-layout">
        <aside className="accounts-list">
          <div className="accounts-list__actions">
            <button type="button" className="secondary-button" onClick={() => setPanelMode('create-account')}>
              New account
            </button>
            <button type="button" className="secondary-button" onClick={() => setPanelMode('create-provider')}>
              New provider
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
                  provider={providers.find((provider) => provider.id === account.institutionId)}
                  isSelected={panelMode === 'view' && selectedAccountId === account.id}
                  onSelect={() => handleSelectAccount(account.id)}
                />
              ))}
          </div>
        </aside>
        <section className="accounts-panel">
          {panelMode === 'create-provider' ? (
            <div className="form-card">
              <h3>New provider</h3>
              <form onSubmit={handleProviderSubmit} className="form-grid two-column">
                <div className="field">
                  <label htmlFor="provider-name">
                    Provider name
                    <Tooltip label="Bank, card issuer, or brokerage label." />
                  </label>
                  <input
                    id="provider-name"
                    value={providerForm.name}
                    onChange={(event) =>
                      setProviderForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="provider-type">
                    Type
                    <Tooltip label="Used for icon hints and import defaults." />
                  </label>
                  <select
                    id="provider-type"
                    value={providerForm.type}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        type: event.target.value as Institution['type']
                      }))
                    }
                  >
                    <option value="bank">Bank</option>
                    <option value="card">Card</option>
                    <option value="brokerage">Brokerage</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="field full-width">
                  <label htmlFor="provider-website">
                    Website
                    <Tooltip label="Optional URL for quick access." />
                  </label>
                  <input
                    id="provider-website"
                    value={providerForm.website}
                    onChange={(event) =>
                      setProviderForm((current) => ({ ...current, website: event.target.value }))
                    }
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    Create provider
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setPanelMode('view')}>
                    Cancel
                  </button>
                </div>
                {renderError(providerError)}
              </form>
            </div>
          ) : panelMode === 'create-account' ? (
            <div className="form-card">
              <h3>New account</h3>
              <form onSubmit={handleNewAccountSubmit} className="form-grid two-column">
                <div className="field">
                  <label htmlFor="new-account-provider">
                    Provider
                    <Tooltip label="Choose the provider this account belongs to." />
                  </label>
                  <select
                    id="new-account-provider"
                    value={newAccountForm.institutionId}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        institutionId: event.target.value
                      }))
                    }
                    required
                  >
                    <option value="">Select a provider</option>
                    {activeProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
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
                        includeInTotals: event.target.value === 'yes',
                        includeOnlyGroupIds:
                          event.target.value === 'yes' ? current.includeOnlyGroupIds : [],
                        excludeGroupId: event.target.value === 'yes' ? current.excludeGroupId : ''
                      }))
                    }
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="new-account-include-groups">
                    Include-only groups
                    <Tooltip label="Collections that always reveal the account." />
                  </label>
                  <select
                    id="new-account-include-groups"
                    multiple
                    value={newAccountForm.includeOnlyGroupIds}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        includeOnlyGroupIds: Array.from(
                          event.target.selectedOptions,
                          (option) => option.value
                        )
                      }))
                    }
                    disabled={!newAccountForm.includeInTotals}
                  >
                    {includeGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                  <p className="muted-text small">Hold Ctrl/Cmd to select multiple.</p>
                </div>
                <div className="field">
                  <label htmlFor="new-account-exclude-group">
                    Exclude group
                    <Tooltip label="Optional collection that hides the account from dashboards." />
                  </label>
                  <select
                    id="new-account-exclude-group"
                    value={newAccountForm.excludeGroupId}
                    onChange={(event) =>
                      setNewAccountForm((current) => ({
                        ...current,
                        excludeGroupId: event.target.value
                      }))
                    }
                  >
                    <option value="">None</option>
                    {excludeGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
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
              providers={providers}
              includeGroups={includeGroups}
              excludeGroups={excludeGroups}
              activeTab={activeTab}
              onTabChange={setActiveTab}
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

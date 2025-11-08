import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, AccountGroup, DataActionError, Institution } from '../data/models';
import { formatCurrency, formatDate } from '../utils/format';

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type AccountRowProps = {
  account: Account;
  includeGroups: AccountGroup[];
  excludeGroups: AccountGroup[];
};

const AccountRow = ({ account, includeGroups, excludeGroups }: AccountRowProps) => {
  const { updateAccount, archiveAccount, setAccountInclusion, updateAccountGroupsForAccount } = useData();
  const [name, setName] = useState(account.name);
  const [notes, setNotes] = useState(account.notes ?? '');
  const [currentBalance, setCurrentBalance] = useState(account.currentBalance.toString());
  const [currency, setCurrency] = useState(account.currency);
  const [error, setError] = useState<DataActionError | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(account.name);
    setNotes(account.notes ?? '');
    setCurrentBalance(account.currentBalance.toString());
    setCurrency(account.currency);
  }, [account.id, account.name, account.notes, account.currentBalance, account.currency]);

  const handleSave = () => {
    setSaving(true);
    const numericBalance = Number.parseFloat(currentBalance);
    const result = updateAccount(account.id, {
      name,
      notes,
      currentBalance: Number.isNaN(numericBalance) ? account.currentBalance : numericBalance,
      includeOnlyGroupIds: account.includeOnlyGroupIds,
      excludeGroupId: account.excludeGroupId,
      includeInTotals: account.includeInTotals,
      currency
    });
    setSaving(false);
    setError(result);
  };

  const handleInclusionToggle = (mode: 'included' | 'excluded') => {
    const result = setAccountInclusion(account.id, mode);
    setError(result);
  };

  const handleGroupMembership = (groupIds: string[], excludeGroupId: string | null) => {
    const result = updateAccountGroupsForAccount(account.id, groupIds, excludeGroupId);
    setError(result);
  };

  const handleArchive = () => {
    if (window.confirm(`Archive ${account.name}? This hides the account but keeps history.`)) {
      archiveAccount(account.id);
    }
  };

  return (
    <div className="account-card">
      <header>
        <div>
          <h4>{name}</h4>
          <p className="muted-text">
            {account.type.toUpperCase()} • {account.currency} • Opening balance{' '}
            {formatCurrency(account.openingBalance, account.currency)} on {formatDate(account.openingBalanceDate)}
          </p>
        </div>
        <div className="chip-list">
          <span className={`badge ${account.includeInTotals ? 'included' : 'excluded'}`}>
            {account.includeInTotals ? 'Included in totals' : 'Excluded from totals'}
          </span>
          {account.archived && <span className="badge archived">Archived</span>}
        </div>
      </header>
      <div className="form-grid two-column">
        <div className="field">
          <label htmlFor={`name-${account.id}`}>
            Account name
            <Tooltip label="Rename the account as it should appear on dashboards." />
          </label>
          <input
            id={`name-${account.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleSave}
            placeholder="e.g. Everyday Checking"
          />
        </div>
        <div className="field">
          <label htmlFor={`currency-${account.id}`}>
            Currency
            <Tooltip label="Native currency for this account. Imports default to this unless overridden by a file column." />
          </label>
          <input
            id={`currency-${account.id}`}
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            onBlur={handleSave}
            placeholder="GBP"
            maxLength={3}
            style={{ textTransform: 'uppercase' }}
          />
        </div>
        <div className="field">
          <label htmlFor={`balance-${account.id}`}>
            Current balance
            <Tooltip label="Manually update the balance for offline reconciliation." />
          </label>
          <input
            id={`balance-${account.id}`}
            type="number"
            step="0.01"
            value={currentBalance}
            onChange={(event) => setCurrentBalance(event.target.value)}
            onBlur={handleSave}
          />
        </div>
        <div className="field">
          <label htmlFor={`notes-${account.id}`}>
            Notes
            <Tooltip label="Store reconciliation tips, ownership info, or sync reminders." />
          </label>
          <textarea
            id={`notes-${account.id}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={handleSave}
            placeholder="Optional context for teammates"
          />
        </div>
        <div className="field">
          <label htmlFor={`include-${account.id}`}>
            Totals mode
            <Tooltip label="Toggle whether the account contributes to Overview totals." />
          </label>
          <div className="chip-list" id={`include-${account.id}`}>
            <button
              type="button"
              className={`chip-button ${account.includeInTotals ? 'active' : ''}`}
              onClick={() => handleInclusionToggle('included')}
            >
              Included
            </button>
            <button
              type="button"
              className={`chip-button ${!account.includeInTotals ? 'active' : ''}`}
              onClick={() => handleInclusionToggle('excluded')}
            >
              Excluded
            </button>
          </div>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`include-groups-${account.id}`}>
            Include-only groups
            <Tooltip label="Select all focus groups that should show this account even if totals are filtered." />
          </label>
          <select
            multiple
            id={`include-groups-${account.id}`}
            value={account.includeOnlyGroupIds}
            onChange={(event) =>
              handleGroupMembership(
                Array.from(event.target.selectedOptions, (option) => option.value),
                account.excludeGroupId
              )
            }
          >
            {includeGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <p className="muted-text">Hold Ctrl or Cmd to select multiple groups.</p>
        </div>
        <div className="field">
          <label htmlFor={`exclude-group-${account.id}`}>
            Exclude group
            <Tooltip label="Move the account into a single exclusion group for dashboards." />
          </label>
          <select
            id={`exclude-group-${account.id}`}
            value={account.excludeGroupId ?? ''}
            onChange={(event) =>
              handleGroupMembership(
                account.includeOnlyGroupIds,
                event.target.value ? event.target.value : null
              )
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
      </div>
      <div className="chip-list">
        {account.includeOnlyGroupIds.map((groupId) => {
          const group = includeGroups.find((item) => item.id === groupId);
          if (!group) return null;
          return (
            <span key={group.id} className="pill pill-muted" style={{ borderColor: group.color }}>
              {group.name}
            </span>
          );
        })}
        {account.excludeGroupId && (
          <span className="pill" style={{ background: 'rgba(220,38,38,0.2)', color: '#fca5a5' }}>
            Excluded via {excludeGroups.find((g) => g.id === account.excludeGroupId)?.name ?? 'Group'}
          </span>
        )}
      </div>
      {renderError(error)}
      <div className="form-actions">
        <button
          type="button"
          className="danger-button"
          onClick={handleArchive}
          aria-label={`Archive ${account.name}`}
        >
          Archive account
        </button>
        {saving && <span className="muted-text">Saving…</span>}
      </div>
    </div>
  );
};

const Accounts = () => {
  const {
    state,
    createInstitution,
    createAccount,
    archiveInstitution
  } = useData();
  const institutions = useMemo(
    () => state.institutions.filter((institution) => !institution.archived),
    [state.institutions]
  );
  const includeGroups = state.accountGroups.filter((group) => group.type === 'include' && !group.archived);
  const excludeGroups = state.accountGroups.filter((group) => group.type === 'exclude' && !group.archived);
  const [institutionForm, setInstitutionForm] = useState({ name: '', type: 'bank' as Institution['type'], website: '' });
  const [institutionError, setInstitutionError] = useState<DataActionError | null>(null);
  const [accountError, setAccountError] = useState<DataActionError | null>(null);
  const [accountForm, setAccountForm] = useState(() => ({
    institutionId: '',
    name: '',
    type: 'checking' as Account['type'],
    currency: state.settings.baseCurrency,
    openingBalance: '0',
    openingBalanceDate: new Date().toISOString().slice(0, 10),
    includeInTotals: true,
    includeOnlyGroupIds: [] as string[],
    excludeGroupId: ''
  }));

  const handleInstitutionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createInstitution({
      name: institutionForm.name,
      type: institutionForm.type,
      website: institutionForm.website
    });
    setInstitutionError(result);
    if (!result) {
      setInstitutionForm({ name: '', type: 'bank', website: '' });
    }
  };

  const handleAccountSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const includeOnlyGroupIds = accountForm.includeInTotals
      ? accountForm.includeOnlyGroupIds
      : [];
    const result = createAccount({
      institutionId: accountForm.institutionId,
      name: accountForm.name,
      type: accountForm.type,
      currency: accountForm.currency,
      openingBalance: Number.parseFloat(accountForm.openingBalance || '0'),
      openingBalanceDate: accountForm.openingBalanceDate,
      includeInTotals: accountForm.includeInTotals,
      includeOnlyGroupIds,
      excludeGroupId: accountForm.excludeGroupId || null,
      notes: undefined
    });
    setAccountError(result);
    if (!result) {
      setAccountForm({
        institutionId: '',
        name: '',
        type: 'checking',
        currency: state.settings.baseCurrency,
        openingBalance: '0',
        openingBalanceDate: new Date().toISOString().slice(0, 10),
        includeInTotals: true,
        includeOnlyGroupIds: [],
        excludeGroupId: ''
      });
    }
  };

  const accountsByInstitution = useMemo(() => {
    return institutions.map((institution) => ({
      institution,
      accounts: state.accounts.filter(
        (account) => account.institutionId === institution.id && !account.archived
      )
    }));
  }, [institutions, state.accounts]);

  const handleArchiveInstitution = (institution: Institution) => {
    if (
      window.confirm(
        `Archive ${institution.name}? All accounts under this institution will be archived too.`
      )
    ) {
      archiveInstitution(institution.id);
    }
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Accounts"
        description="Organise institutions, configure inclusion rules, and keep account metadata consistent."
      />
      <div className="form-card">
        <h3>New institution</h3>
        <form onSubmit={handleInstitutionSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="institution-name">
              Institution name
              <Tooltip label="The bank, card provider, or brokerage that owns the accounts." />
            </label>
            <input
              id="institution-name"
              value={institutionForm.name}
              onChange={(event) =>
                setInstitutionForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Modern Bank"
            />
          </div>
          <div className="field">
            <label htmlFor="institution-type">
              Type
              <Tooltip label="Used to group similar institutions and drive reporting rules." />
            </label>
            <select
              id="institution-type"
              value={institutionForm.type}
              onChange={(event) =>
                setInstitutionForm((current) => ({
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
          <div className="field">
            <label htmlFor="institution-website">
              Website
              <Tooltip label="Optional URL for quick access to statements." />
            </label>
            <input
              id="institution-website"
              value={institutionForm.website}
              onChange={(event) =>
                setInstitutionForm((current) => ({ ...current, website: event.target.value }))
              }
              placeholder="https://"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Create institution
            </button>
          </div>
          {renderError(institutionError)}
        </form>
      </div>
      <div className="form-card">
        <h3>New account</h3>
        <form onSubmit={handleAccountSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="account-institution">
              Institution
              <Tooltip label="Accounts inherit statement cadence and authentication from the institution." />
            </label>
            <select
              id="account-institution"
              value={accountForm.institutionId}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, institutionId: event.target.value }))
              }
              required
            >
              <option value="">Select an institution</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="account-name">
              Account name
              <Tooltip label="Friendly name for statements and dashboards." />
            </label>
            <input
              id="account-name"
              value={accountForm.name}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Everyday Checking"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="account-type">
              Account type
              <Tooltip label="Used to pick icons and default reporting rules." />
            </label>
            <select
              id="account-type"
              value={accountForm.type}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  type: event.target.value as Account['type']
                }))
              }
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit</option>
              <option value="loan">Loan</option>
              <option value="investment">Investment</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="account-currency">
              Currency
              <Tooltip label="Currency of statements for this account." />
            </label>
            <input
              id="account-currency"
              value={accountForm.currency}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase()
                }))
              }
              placeholder={state.settings.baseCurrency}
              maxLength={3}
              style={{ textTransform: 'uppercase' }}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="account-opening-balance">
              Opening balance
              <Tooltip label="Starting point for reconciliation and performance tracking." />
            </label>
            <input
              id="account-opening-balance"
              value={accountForm.openingBalance}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  openingBalance: event.target.value
                }))
              }
              type="number"
            />
          </div>
          <div className="field">
            <label htmlFor="account-opening-date">
              Opening balance date
              <Tooltip label="Must not be in the future. Used to limit historical reporting." />
            </label>
            <input
              id="account-opening-date"
              type="date"
              value={accountForm.openingBalanceDate}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  openingBalanceDate: event.target.value
                }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="account-inclusion">
              Include in totals
              <Tooltip label="If disabled the account will be hidden from high-level totals." />
            </label>
            <select
              id="account-inclusion"
              value={accountForm.includeInTotals ? 'yes' : 'no'}
              onChange={(event) =>
                setAccountForm((current) => ({
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
            <label htmlFor="account-include-groups">
              Include-only groups
              <Tooltip label="Optional chips that surface the account in specific dashboards." />
            </label>
            <select
              id="account-include-groups"
              multiple
              value={accountForm.includeOnlyGroupIds}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  includeOnlyGroupIds: Array.from(event.target.selectedOptions, (option) => option.value)
                }))
              }
              disabled={!accountForm.includeInTotals}
            >
              {includeGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <p className="muted-text">Hold Ctrl/Cmd to select multiple.</p>
          </div>
          <div className="field">
            <label htmlFor="account-exclude-group">
              Exclude group
              <Tooltip label="Optional container to explicitly remove an account from dashboards." />
            </label>
            <select
              id="account-exclude-group"
              value={accountForm.excludeGroupId}
              onChange={(event) =>
                setAccountForm((current) => ({
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
          </div>
          {renderError(accountError)}
        </form>
      </div>
      {accountsByInstitution.map(({ institution, accounts }) => (
        <div key={institution.id} className="content-card">
          <div className="section-title">
            <div>
              <h3>{institution.name}</h3>
              <p className="muted-text">
                {institution.type.toUpperCase()} • Onboarded {formatDate(institution.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => handleArchiveInstitution(institution)}
            >
              Archive institution
            </button>
          </div>
          {institution.website && (
            <p className="muted-text">{institution.website}</p>
          )}
          <div className="account-grid">
            {accounts.length === 0 && (
              <p className="muted-text">No active accounts. Archive history remains searchable.</p>
            )}
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                includeGroups={includeGroups}
                excludeGroups={excludeGroups}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Accounts;

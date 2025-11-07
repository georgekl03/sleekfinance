import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, AccountGroup, AccountGroupType, DataActionError } from '../data/models';
import { formatCurrency } from '../utils/format';

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type GroupCardProps = {
  group: AccountGroup;
  accounts: Account[];
};

const GroupCard = ({ group, accounts }: GroupCardProps) => {
  const { updateAccountGroup, archiveAccountGroup } = useData();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [color, setColor] = useState(group.color);
  const [selectedAccounts, setSelectedAccounts] = useState(group.accountIds);
  const [error, setError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setName(group.name);
    setDescription(group.description ?? '');
    setColor(group.color);
    setSelectedAccounts(group.accountIds.filter((id) => accounts.some((acct) => acct.id === id)));
  }, [group.id, group.name, group.description, group.color, group.accountIds, accounts]);

  const commitUpdate = (next: Partial<AccountGroup>) => {
    const result = updateAccountGroup(group.id, {
      name,
      description,
      color,
      accountIds: selectedAccounts,
      ...next
    });
    setError(result);
  };

  const handleMembershipChange = (accountIds: string[]) => {
    setSelectedAccounts(accountIds);
    commitUpdate({ accountIds });
  };

  const handleSave = () => {
    commitUpdate({});
  };

  const handleArchive = () => {
    if (
      window.confirm(
        `Archive ${group.name}? It will be hidden from filters and accounts will be detached.`
      )
    ) {
      archiveAccountGroup(group.id);
    }
  };

  const groupAccounts = accounts.filter((account) => group.accountIds.includes(account.id));

  return (
    <div className="content-card">
      <div className="section-title">
        <h3>{group.name}</h3>
        <button type="button" className="secondary-button" onClick={handleArchive}>
          Archive group
        </button>
      </div>
      <div className="form-grid two-column">
        <div className="field">
          <label htmlFor={`group-name-${group.id}`}>
            Name
            <Tooltip label="Rename the group. Historical transactions reference the old name." />
          </label>
          <input
            id={`group-name-${group.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleSave}
          />
        </div>
        <div className="field">
          <label htmlFor={`group-color-${group.id}`}>
            Badge color
            <Tooltip label="Colour used when rendering chips on Overview and Transactions." />
          </label>
          <input
            id={`group-color-${group.id}`}
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              commitUpdate({ color: event.target.value });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`group-description-${group.id}`}>
            Description
            <Tooltip label="Explain why this grouping exists for other collaborators." />
          </label>
          <textarea
            id={`group-description-${group.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={handleSave}
          />
        </div>
        <div className="field">
          <label htmlFor={`group-accounts-${group.id}`}>
            Accounts
            <Tooltip label="Hold Ctrl/Cmd to multi-select accounts that participate in this group." />
          </label>
          <select
            id={`group-accounts-${group.id}`}
            multiple
            value={selectedAccounts}
            onChange={(event) =>
              handleMembershipChange(
                Array.from(event.target.selectedOptions, (option) => option.value)
              )
            }
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="chip-list">
        {groupAccounts.map((account) => (
          <span key={account.id} className="pill pill-muted">
            {account.name} • {formatCurrency(account.currentBalance)}
          </span>
        ))}
        {groupAccounts.length === 0 && <span className="muted-text">No linked accounts yet.</span>}
      </div>
      {renderError(error)}
    </div>
  );
};

const AccountGroups = () => {
  const { state, createAccountGroup } = useData();
  const accounts = useMemo(
    () => state.accounts.filter((account) => !account.archived),
    [state.accounts]
  );
  const groups = useMemo(
    () => state.accountGroups.filter((group) => !group.archived),
    [state.accountGroups]
  );
  const [form, setForm] = useState({
    name: '',
    type: 'include' as AccountGroupType,
    description: '',
    color: '#2563eb',
    accountIds: [] as string[]
  });
  const [error, setError] = useState<DataActionError | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createAccountGroup({
      name: form.name,
      type: form.type,
      description: form.description,
      color: form.color,
      accountIds: form.accountIds
    });
    setError(result);
    if (!result) {
      setForm({ name: '', type: 'include', description: '', color: '#2563eb', accountIds: [] });
    }
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Account Groups"
        description="Create include-only and exclude groups to drive reporting filters and totals."
      />
      <div className="form-card">
        <h3>New group</h3>
        <form onSubmit={handleSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="group-name">
              Group name
              <Tooltip label="Choose something short and descriptive." />
            </label>
            <input
              id="group-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Day-to-Day"
            />
          </div>
          <div className="field">
            <label htmlFor="group-type">
              Group type
              <Tooltip label="Include groups surface accounts on dashboards. Exclude groups hide balances." />
            </label>
            <select
              id="group-type"
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value as AccountGroupType
                }))
              }
            >
              <option value="include">Include</option>
              <option value="exclude">Exclude</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="group-color">
              Badge colour
              <Tooltip label="Used for chips and list badges. Stick to high-contrast colours." />
            </label>
            <input
              id="group-color"
              type="color"
              value={form.color}
              onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="group-description">
              Description
              <Tooltip label="Explain how this group should be used when filtering dashboards." />
            </label>
            <textarea
              id="group-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="group-accounts">
              Accounts
              <Tooltip label="Select accounts that should belong to this group immediately." />
            </label>
            <select
              id="group-accounts"
              multiple
              value={form.accountIds}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  accountIds: Array.from(event.target.selectedOptions, (option) => option.value)
                }))
              }
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <p className="muted-text">Hold Ctrl/Cmd to select multiple accounts.</p>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Create group
            </button>
          </div>
          {renderError(error)}
        </form>
      </div>
      {groups.length === 0 && (
        <div className="content-card">
          <p className="muted-text">
            No account groups yet. Use them to build curated dashboards or exclude temporary balances.
          </p>
        </div>
      )}
      {groups.map((group) => (
        <GroupCard key={group.id} group={group} accounts={accounts} />
      ))}
    </div>
  );
};

export default AccountGroups;

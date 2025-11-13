import { FormEvent, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Account, AccountCollection, DataActionError } from '../data/models';

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type CollectionCardProps = {
  collection: AccountCollection;
  accounts: Account[];
};

const CollectionCard = ({ collection, accounts }: CollectionCardProps) => {
  const { updateAccountCollection, deleteAccountCollection } = useData();
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [color, setColor] = useState(collection.color);
  const [error, setError] = useState<DataActionError | null>(null);

  const memberAccounts = useMemo(
    () => accounts.filter((account) => account.collectionIds.includes(collection.id)),
    [accounts, collection.id]
  );

  const handleSave = () => {
    const result = updateAccountCollection(collection.id, {
      name,
      description,
      color
    });
    setError(result);
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Delete ${collection.name}? Accounts remain intact but will be detached from this collection.`
      )
    ) {
      deleteAccountCollection(collection.id);
    }
  };

  return (
    <div className="content-card">
      <div className="section-title">
        <h3>{collection.name}</h3>
        <button type="button" className="danger-button" onClick={handleDelete}>
          Delete
        </button>
      </div>
      <div className="form-grid two-column">
        <div className="field">
          <label htmlFor={`collection-name-${collection.id}`}>
            Name
            <Tooltip label="Rename the collection. Existing accounts keep their membership." />
          </label>
          <input
            id={`collection-name-${collection.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleSave}
          />
        </div>
        <div className="field">
          <label htmlFor={`collection-color-${collection.id}`}>
            Badge colour
            <Tooltip label="Used when displaying collection chips." />
          </label>
          <input
            id={`collection-color-${collection.id}`}
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              updateAccountCollection(collection.id, { color: event.target.value });
            }}
          />
        </div>
        <div className="field full-width">
          <label htmlFor={`collection-description-${collection.id}`}>
            Description
            <Tooltip label="Optional note explaining how to use this collection." />
          </label>
          <textarea
            id={`collection-description-${collection.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={handleSave}
            rows={3}
          />
        </div>
      </div>
      <div className="chip-list">
        {memberAccounts.map((account) => (
          <span key={account.id} className="pill pill-muted">
            {account.name}
          </span>
        ))}
        {memberAccounts.length === 0 && <span className="muted-text">No accounts assigned.</span>}
      </div>
      {renderError(error)}
    </div>
  );
};

const Collections = () => {
  const { state, createAccountCollection } = useData();
  const accounts = useMemo(
    () => state.accounts.filter((account) => !account.archived),
    [state.accounts]
  );
  const collections = useMemo(() => state.accountCollections, [state.accountCollections]);
  const [form, setForm] = useState({ name: '', description: '', color: '#2563eb' });
  const [error, setError] = useState<DataActionError | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createAccountCollection({
      name: form.name,
      description: form.description,
      color: form.color
    });
    setError(result);
    if (!result) {
      setForm({ name: '', description: '', color: '#2563eb' });
    }
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Collections"
        description="Group accounts into reusable filters for overview and reporting."
      />
      <div className="form-card">
        <h3>New collection</h3>
        <form onSubmit={handleSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="collection-name">
              Collection name
              <Tooltip label="Choose something meaningful like Savings or Core Spending." />
            </label>
            <input
              id="collection-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Savings"
            />
          </div>
          <div className="field">
            <label htmlFor="collection-color">
              Badge colour
              <Tooltip label="Used when rendering collection chips." />
            </label>
            <input
              id="collection-color"
              type="color"
              value={form.color}
              onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
            />
          </div>
          <div className="field full-width">
            <label htmlFor="collection-description">
              Description
              <Tooltip label="Optional context for collaborators." />
            </label>
            <textarea
              id="collection-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Create collection
            </button>
          </div>
          {renderError(error)}
        </form>
      </div>
      {collections.length === 0 ? (
        <div className="content-card">
          <h3>No collections yet</h3>
          <p className="muted-text">
            Create collections to quickly filter Overview and Reports. Accounts can belong to multiple
            collections at once.
          </p>
        </div>
      ) : (
        <div className="content-stack">
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} accounts={accounts} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Collections;

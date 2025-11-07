import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Category, DataActionError, Payee, SubCategory, Tag } from '../data/models';

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type PayeeRowProps = {
  payee: Payee;
  categories: Category[];
  subCategories: SubCategory[];
};

const PayeeRow = ({ payee, categories, subCategories }: PayeeRowProps) => {
  const { updatePayee, archivePayee } = useData();
  const [name, setName] = useState(payee.name);
  const [categoryId, setCategoryId] = useState(payee.defaultCategoryId ?? '');
  const [subCategoryId, setSubCategoryId] = useState(payee.defaultSubCategoryId ?? '');
  const [error, setError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setName(payee.name);
    setCategoryId(payee.defaultCategoryId ?? '');
    setSubCategoryId(payee.defaultSubCategoryId ?? '');
  }, [payee.id, payee.name, payee.defaultCategoryId, payee.defaultSubCategoryId]);

  const availableSubCategories = useMemo(
    () => subCategories.filter((sub) => sub.categoryId === categoryId),
    [subCategories, categoryId]
  );

  const handleSave = () => {
    const result = updatePayee(payee.id, {
      name,
      defaultCategoryId: categoryId || null,
      defaultSubCategoryId: subCategoryId || null
    });
    setError(result);
  };

  const handleArchive = () => {
    if (window.confirm(`Archive ${payee.name}?`)) {
      archivePayee(payee.id);
    }
  };

  return (
    <div className="account-card">
      <div className="field">
        <label htmlFor={`payee-name-${payee.id}`}>
          Payee name
          <Tooltip label="Update the merchant name shown on transactions." />
        </label>
        <input
          id={`payee-name-${payee.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleSave}
        />
      </div>
      <div className="form-grid two-column">
        <div className="field">
          <label htmlFor={`payee-category-${payee.id}`}>
            Default category
            <Tooltip label="New transactions from this payee will auto-categorise here." />
          </label>
          <select
            id={`payee-category-${payee.id}`}
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setSubCategoryId('');
              updatePayee(payee.id, {
                name,
                defaultCategoryId: event.target.value || null,
                defaultSubCategoryId: null
              });
            }}
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`payee-sub-${payee.id}`}>
            Default sub-category
            <Tooltip label="Optional finer-grain mapping for budgeting." />
          </label>
          <select
            id={`payee-sub-${payee.id}`}
            value={subCategoryId}
            onChange={(event) => {
              setSubCategoryId(event.target.value);
              updatePayee(payee.id, {
                name,
                defaultCategoryId: categoryId || null,
                defaultSubCategoryId: event.target.value || null
              });
            }}
          >
            <option value="">None</option>
            {availableSubCategories.map((subCategory) => (
              <option key={subCategory.id} value={subCategory.id}>
                {subCategory.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="danger-button" onClick={handleArchive}>
          Archive
        </button>
        {payee.archived && <span className="badge archived">Archived</span>}
      </div>
      {renderError(error)}
    </div>
  );
};

type TagRowProps = {
  tag: Tag;
};

const TagRow = ({ tag }: TagRowProps) => {
  const { updateTag, archiveTag } = useData();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [error, setError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setName(tag.name);
    setColor(tag.color);
  }, [tag.id, tag.name, tag.color]);

  const handleSave = () => {
    const result = updateTag(tag.id, { name, color });
    setError(result);
  };

  const handleArchive = () => {
    if (window.confirm(`Archive tag ${tag.name}?`)) {
      archiveTag(tag.id);
    }
  };

  return (
    <div className="account-card">
      <div className="form-grid two-column">
        <div className="field">
          <label htmlFor={`tag-name-${tag.id}`}>
            Tag name
            <Tooltip label="Short memorable word to attach to transactions." />
          </label>
          <input
            id={`tag-name-${tag.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={handleSave}
          />
        </div>
        <div className="field">
          <label htmlFor={`tag-color-${tag.id}`}>
            Tag colour
            <Tooltip label="Used for badges in the transactions table." />
          </label>
          <input
            id={`tag-color-${tag.id}`}
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              updateTag(tag.id, { name, color: event.target.value });
            }}
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="danger-button" onClick={handleArchive}>
          Archive tag
        </button>
        {tag.archived && <span className="badge archived">Archived</span>}
      </div>
      {renderError(error)}
    </div>
  );
};

const Payees = () => {
  const { state, createPayee, createTag } = useData();
  const categories = useMemo(
    () => state.categories.filter((category) => !category.archived),
    [state.categories]
  );
  const subCategories = useMemo(
    () => state.subCategories.filter((subCategory) => !subCategory.archived),
    [state.subCategories]
  );
  const payees = useMemo(
    () => [...state.payees].sort((a, b) => a.name.localeCompare(b.name)),
    [state.payees]
  );
  const tags = useMemo(
    () => [...state.tags].sort((a, b) => a.name.localeCompare(b.name)),
    [state.tags]
  );
  const [payeeForm, setPayeeForm] = useState({
    name: '',
    categoryId: '',
    subCategoryId: ''
  });
  const [payeeError, setPayeeError] = useState<DataActionError | null>(null);
  const [tagForm, setTagForm] = useState({ name: '', color: '#0891b2' });
  const [tagError, setTagError] = useState<DataActionError | null>(null);

  const availableSubCategories = useMemo(
    () => subCategories.filter((sub) => sub.categoryId === payeeForm.categoryId),
    [subCategories, payeeForm.categoryId]
  );

  const handlePayeeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createPayee({
      name: payeeForm.name,
      defaultCategoryId: payeeForm.categoryId || null,
      defaultSubCategoryId: payeeForm.subCategoryId || null
    });
    setPayeeError(result);
    if (!result) {
      setPayeeForm({ name: '', categoryId: '', subCategoryId: '' });
    }
  };

  const handleTagSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = createTag({ name: tagForm.name, color: tagForm.color });
    setTagError(result);
    if (!result) {
      setTagForm({ name: '', color: '#0891b2' });
    }
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Payees"
        description="Maintain merchant defaults, automate categorisation, and curate transaction tags."
      />
      <div className="form-card">
        <h3>Add payee</h3>
        <form onSubmit={handlePayeeSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="payee-name">
              Payee name
              <Tooltip label="The merchant or payer name to recognise automatically." />
            </label>
            <input
              id="payee-name"
              value={payeeForm.name}
              onChange={(event) => setPayeeForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Fresh Foods Market"
            />
          </div>
          <div className="field">
            <label htmlFor="payee-category">
              Default category
              <Tooltip label="Optional category automatically applied to new transactions." />
            </label>
            <select
              id="payee-category"
              value={payeeForm.categoryId}
              onChange={(event) =>
                setPayeeForm((current) => ({
                  ...current,
                  categoryId: event.target.value,
                  subCategoryId: ''
                }))
              }
            >
              <option value="">None</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="payee-subcategory">
              Default sub-category
              <Tooltip label="Refine default mapping to a specific bucket." />
            </label>
            <select
              id="payee-subcategory"
              value={payeeForm.subCategoryId}
              onChange={(event) =>
                setPayeeForm((current) => ({ ...current, subCategoryId: event.target.value }))
              }
            >
              <option value="">None</option>
              {availableSubCategories.map((subCategory) => (
                <option key={subCategory.id} value={subCategory.id}>
                  {subCategory.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add payee
            </button>
          </div>
          {renderError(payeeError)}
        </form>
      </div>
      <div className="content-card">
        <h3>Payee directory</h3>
        <div className="account-grid">
          {payees.map((payee) => (
            <PayeeRow
              key={payee.id}
              payee={payee}
              categories={categories}
              subCategories={subCategories}
            />
          ))}
          {payees.length === 0 && <p className="muted-text">No payees yet.</p>}
        </div>
      </div>
      <div className="form-card">
        <h3>Add tag</h3>
        <form onSubmit={handleTagSubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="tag-name">
              Tag name
              <Tooltip label="Short label such as 'Recurring' or 'Gift'." />
            </label>
            <input
              id="tag-name"
              value={tagForm.name}
              onChange={(event) => setTagForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="tag-color">
              Tag colour
              <Tooltip label="Pick a badge colour for the tag." />
            </label>
            <input
              id="tag-color"
              type="color"
              value={tagForm.color}
              onChange={(event) => setTagForm((current) => ({ ...current, color: event.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add tag
            </button>
          </div>
          {renderError(tagError)}
        </form>
      </div>
      <div className="content-card">
        <h3>Tags</h3>
        <div className="account-grid">
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
          {tags.length === 0 && <p className="muted-text">No tags yet.</p>}
        </div>
      </div>
    </div>
  );
};

export default Payees;

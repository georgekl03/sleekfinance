import { FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { Category, DataActionError, SubCategory } from '../data/models';

const renderError = (error: DataActionError | null) =>
  error ? (
    <p role="alert" className="muted-text">
      <strong>{error.title}:</strong> {error.description}
    </p>
  ) : null;

type CategoryCardProps = {
  category: Category;
  onSelect: () => void;
  isSelected: boolean;
};

const CategoryCard = ({ category, onSelect, isSelected }: CategoryCardProps) => {
  const { updateCategory, archiveCategory } = useData();
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setName(category.name);
  }, [category.id, category.name]);

  const handleSave = () => {
    const result = updateCategory(category.id, { name });
    setError(result);
  };

  const handleArchive = () => {
    if (window.confirm(`Archive ${category.name}? It will remain available for history.`)) {
      archiveCategory(category.id);
    }
  };

  return (
    <div className={`account-card ${isSelected ? 'selected' : ''}`} style={{ textAlign: 'left' }}>
      <div className="section-title">
        <h4>{category.name}</h4>
        <button type="button" className="secondary-button" onClick={onSelect}>
          {isSelected ? 'Selected' : 'Select'}
        </button>
      </div>
      <div className="field">
        <label htmlFor={`category-${category.id}`}>
          Category name
          <Tooltip label="Rename without breaking transaction history." />
        </label>
        <input
          id={`category-${category.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleSave}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="danger-button" onClick={handleArchive}>
          Archive
        </button>
        {category.archived && <span className="badge archived">Archived</span>}
      </div>
      {renderError(error)}
    </div>
  );
};

type SubCategoryCardProps = {
  subCategory: SubCategory;
};

const SubCategoryCard = ({ subCategory }: SubCategoryCardProps) => {
  const { updateSubCategory, archiveSubCategory } = useData();
  const [name, setName] = useState(subCategory.name);
  const [error, setError] = useState<DataActionError | null>(null);

  useEffect(() => {
    setName(subCategory.name);
  }, [subCategory.id, subCategory.name]);

  const handleSave = () => {
    const result = updateSubCategory(subCategory.id, { name });
    setError(result);
  };

  const handleArchive = () => {
    if (window.confirm(`Archive ${subCategory.name}?`)) {
      archiveSubCategory(subCategory.id);
    }
  };

  return (
    <div className="account-card">
      <div className="field">
        <label htmlFor={`sub-${subCategory.id}`}>
          Sub-category name
          <Tooltip label="Rename while preserving transaction associations." />
        </label>
        <input
          id={`sub-${subCategory.id}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={handleSave}
        />
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={handleArchive}>
          Archive
        </button>
        {subCategory.archived && <span className="badge archived">Archived</span>}
      </div>
      {renderError(error)}
    </div>
  );
};

const Categories = () => {
  const {
    masterCategories,
    state,
    createCategory,
    mergeCategories,
    createSubCategory,
    mergeSubCategories
  } = useData();
  const [selectedMasterId, setSelectedMasterId] = useState(masterCategories[0]?.id ?? '');
  const categories = useMemo(
    () =>
      state.categories
        .filter((category) => category.masterCategoryId === selectedMasterId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.categories, selectedMasterId]
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null
  );
  useEffect(() => {
    setSelectedCategoryId(categories[0]?.id ?? null);
  }, [categories]);

  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [categoryError, setCategoryError] = useState<DataActionError | null>(null);
  const [subCategoryForm, setSubCategoryForm] = useState({ name: '' });
  const [subCategoryError, setSubCategoryError] = useState<DataActionError | null>(null);
  const [mergeCategory, setMergeCategory] = useState({ from: '', to: '' });
  const [mergeCategoryError, setMergeCategoryError] = useState<DataActionError | null>(null);
  const [mergeSub, setMergeSub] = useState({ from: '', to: '' });
  const [mergeSubError, setMergeSubError] = useState<DataActionError | null>(null);

  const subCategories = useMemo(
    () =>
      state.subCategories
        .filter((sub) => sub.categoryId === selectedCategoryId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.subCategories, selectedCategoryId]
  );

  const handleCategorySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMasterId) return;
    const result = createCategory({ masterCategoryId: selectedMasterId, name: categoryForm.name });
    setCategoryError(result);
    if (!result) {
      setCategoryForm({ name: '' });
    }
  };

  const handleSubCategorySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCategoryId) return;
    const result = createSubCategory({ categoryId: selectedCategoryId, name: subCategoryForm.name });
    setSubCategoryError(result);
    if (!result) {
      setSubCategoryForm({ name: '' });
    }
  };

  const handleMergeCategories = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = mergeCategories(mergeCategory.from, mergeCategory.to);
    setMergeCategoryError(result);
    if (!result) {
      setMergeCategory({ from: '', to: '' });
    }
  };

  const handleMergeSub = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = mergeSubCategories(mergeSub.from, mergeSub.to);
    setMergeSubError(result);
    if (!result) {
      setMergeSub({ from: '', to: '' });
    }
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Categories"
        description="Manage the three-level budget hierarchy with merge tools and archival safeguards."
      />
      <div className="content-card">
        <h3>Master categories</h3>
        <p className="muted-text">
          Master categories are fixed anchors. Choose one to view and maintain its categories.
        </p>
        <div className="chip-list">
          {masterCategories.map((master) => (
            <button
              key={master.id}
              type="button"
              className={`chip-button ${master.id === selectedMasterId ? 'active' : ''}`}
              onClick={() => setSelectedMasterId(master.id)}
            >
              {master.name}
            </button>
          ))}
        </div>
      </div>
      <div className="form-card">
        <h3>Add category</h3>
        <form onSubmit={handleCategorySubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="category-name">
              Category name
              <Tooltip label="Create a new category under the selected master category." />
            </label>
            <input
              id="category-name"
              value={categoryForm.name}
              onChange={(event) => setCategoryForm({ name: event.target.value })}
              placeholder="Housing"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add category
            </button>
          </div>
          {renderError(categoryError)}
        </form>
      </div>
      <div className="content-card">
        <h3>Categories within {masterCategories.find((master) => master.id === selectedMasterId)?.name}</h3>
        <div className="account-grid">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onSelect={() => setSelectedCategoryId(category.id)}
              isSelected={selectedCategoryId === category.id}
            />
          ))}
          {categories.length === 0 && <p className="muted-text">No categories yet.</p>}
        </div>
      </div>
      <div className="form-card">
        <h3>Add sub-category</h3>
        <form onSubmit={handleSubCategorySubmit} className="form-grid two-column">
          <div className="field">
            <label htmlFor="sub-category-name">
              Sub-category name
              <Tooltip label="Adds a detail layer inside the selected category." />
            </label>
            <input
              id="sub-category-name"
              value={subCategoryForm.name}
              onChange={(event) => setSubCategoryForm({ name: event.target.value })}
              placeholder="Rent"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={!selectedCategoryId}>
              Add sub-category
            </button>
          </div>
          {renderError(subCategoryError)}
        </form>
      </div>
      <div className="content-card">
        <h3>Sub-categories</h3>
        <div className="account-grid">
          {subCategories.map((subCategory) => (
            <SubCategoryCard key={subCategory.id} subCategory={subCategory} />
          ))}
          {subCategories.length === 0 && <p className="muted-text">No sub-categories selected.</p>}
        </div>
      </div>
      <div className="form-card">
        <h3>Merge tools</h3>
        <div className="form-grid two-column">
          <form onSubmit={handleMergeCategories} className="form-grid">
            <div className="field">
              <label htmlFor="merge-category-from">
                Merge category
                <Tooltip label="Choose the category that will be archived and merged into another." />
              </label>
              <select
                id="merge-category-from"
                value={mergeCategory.from}
                onChange={(event) => setMergeCategory((current) => ({ ...current, from: event.target.value }))}
              >
                <option value="">Select source</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="merge-category-to">
                Into category
                <Tooltip label="Transactions and sub-categories will move to this category." />
              </label>
              <select
                id="merge-category-to"
                value={mergeCategory.to}
                onChange={(event) => setMergeCategory((current) => ({ ...current, to: event.target.value }))}
              >
                <option value="">Select destination</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="secondary-button">
                Merge categories
              </button>
            </div>
            {renderError(mergeCategoryError)}
          </form>
          <form onSubmit={handleMergeSub} className="form-grid">
            <div className="field">
              <label htmlFor="merge-sub-from">
                Merge sub-category
                <Tooltip label="Select the sub-category that will be archived." />
              </label>
              <select
                id="merge-sub-from"
                value={mergeSub.from}
                onChange={(event) => setMergeSub((current) => ({ ...current, from: event.target.value }))}
              >
                <option value="">Select source</option>
                {subCategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="merge-sub-to">
                Into sub-category
                <Tooltip label="Transactions will be reassigned to this sub-category." />
              </label>
              <select
                id="merge-sub-to"
                value={mergeSub.to}
                onChange={(event) => setMergeSub((current) => ({ ...current, to: event.target.value }))}
              >
                <option value="">Select destination</option>
                {subCategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="secondary-button">
                Merge sub-categories
              </button>
            </div>
            {renderError(mergeSubError)}
          </form>
        </div>
      </div>
    </div>
  );
};

export default Categories;

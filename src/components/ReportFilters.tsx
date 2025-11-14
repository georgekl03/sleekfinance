import { ChangeEvent, useMemo } from 'react';
import {
  ReportFilters,
  getPresetRange,
  formatIsoDate,
  initialiseReportFilters
} from '../utils/reporting';
import { Account, AccountCollection, MasterCategory, RuleFlowType } from '../data/models';
import '../styles/report-filters.css';

type ReportFiltersProps = {
  filters: ReportFilters;
  accounts: Account[];
  collections: AccountCollection[];
  masterCategories: MasterCategory[];
  onChange: (filters: ReportFilters) => void;
};

const PRESETS: { id: ReportFilters['preset']; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
  { id: 'custom', label: 'Custom' }
];

const FLOW_OPTIONS: { id: RuleFlowType; label: string }[] = [
  { id: 'in', label: 'In' },
  { id: 'out', label: 'Out' },
  { id: 'interest', label: 'Interest' },
  { id: 'fees', label: 'Fees' },
  { id: 'transfer', label: 'Transfers' }
];

const ReportFiltersBar = ({ filters, accounts, collections, masterCategories, onChange }: ReportFiltersProps) => {
  const today = useMemo(() => new Date(), []);

  const providerOptions = useMemo(() => {
    const names = new Set<string>();
    accounts.forEach((account) => {
      if (account.archived) return;
      names.add(account.provider);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [accounts]);

  const handlePresetChange = (preset: ReportFilters['preset']) => {
    if (preset === 'custom') {
      onChange({ ...filters, preset });
      return;
    }
    const { start, end } = getPresetRange(preset, filters.yearMode, today);
    onChange({
      ...filters,
      preset,
      startDate: formatIsoDate(start),
      endDate: formatIsoDate(end)
    });
  };

  const handleYearModeToggle = (mode: ReportFilters['yearMode']) => {
    if (mode === filters.yearMode) return;
    if (filters.preset === 'custom') {
      onChange({ ...filters, yearMode: mode });
      return;
    }
    const { start, end } = getPresetRange(filters.preset, mode, today);
    onChange({
      ...filters,
      yearMode: mode,
      startDate: formatIsoDate(start),
      endDate: formatIsoDate(end)
    });
  };

  const handleDateChange = (key: 'startDate' | 'endDate') => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    onChange({ ...filters, [key]: value, preset: 'custom' });
  };

  const handleMultiSelectChange = (key: keyof Pick<ReportFilters, 'accountIds' | 'providerNames' | 'collectionIds' | 'masterCategoryIds' | 'flowTypes'>) =>
    (event: ChangeEvent<HTMLSelectElement>) => {
      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
      if (key === 'flowTypes') {
        onChange({ ...filters, flowTypes: values as RuleFlowType[], preset: filters.preset });
        return;
      }
      onChange({ ...filters, [key]: values });
    };

  const handleReset = () => {
    onChange({ ...initialiseReportFilters(today), yearMode: filters.yearMode });
  };

  const availableAccounts = useMemo(
    () => accounts.filter((account) => !account.archived && account.includeInTotals),
    [accounts]
  );

  return (
    <section className="report-filters" aria-label="Report filters">
      <div className="report-filters__group">
        <span className="muted-text">Date range</span>
        <div className="chip-row" role="group" aria-label="Report range presets">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`chip-button ${filters.preset === preset.id ? 'active' : ''}`}
              onClick={() => handlePresetChange(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="report-filters__dates">
          <label>
            Start
            <input type="date" value={filters.startDate} onChange={handleDateChange('startDate')} />
          </label>
          <label>
            End
            <input type="date" value={filters.endDate} onChange={handleDateChange('endDate')} />
          </label>
        </div>
      </div>
      <div className="report-filters__group">
        <span className="muted-text">Year mode</span>
        <div className="chip-row" role="group" aria-label="Year mode">
          <button
            type="button"
            className={`chip-button ${filters.yearMode === 'calendar' ? 'active' : ''}`}
            onClick={() => handleYearModeToggle('calendar')}
          >
            Calendar year
          </button>
          <button
            type="button"
            className={`chip-button ${filters.yearMode === 'uk-tax' ? 'active' : ''}`}
            onClick={() => handleYearModeToggle('uk-tax')}
          >
            UK tax year
          </button>
        </div>
      </div>
      <div className="report-filters__grid">
        <label>
          Accounts
          <select
            multiple
            value={filters.accountIds}
            onChange={handleMultiSelectChange('accountIds')}
          >
            {availableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Providers
          <select
            multiple
            value={filters.providerNames}
            onChange={handleMultiSelectChange('providerNames')}
          >
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          Collections
          <select
            multiple
            value={filters.collectionIds}
            onChange={handleMultiSelectChange('collectionIds')}
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flow types
          <select
            multiple
            value={filters.flowTypes}
            onChange={handleMultiSelectChange('flowTypes')}
          >
            {FLOW_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Master categories
          <select
            multiple
            value={filters.masterCategoryIds}
            onChange={handleMultiSelectChange('masterCategoryIds')}
          >
            {masterCategories.map((master) => (
              <option key={master.id} value={master.id}>
                {master.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="report-filters__actions">
        <button type="button" className="secondary-button" onClick={handleReset}>
          Reset filters
        </button>
      </div>
    </section>
  );
};

export default ReportFiltersBar;


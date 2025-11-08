import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { ImportFormatOptions } from '../data/models';
import { clearLogs, readLogs } from '../utils/logger';

const dateFormatOptions: { value: ImportFormatOptions['dateFormat']; label: string }[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-04-30)' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (30/04/2024)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (04/30/2024)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (30-04-2024)' }
];

const decimalSeparatorOptions: { value: ImportFormatOptions['decimalSeparator']; label: string }[] = [
  { value: '.', label: 'Dot (1,234.56)' },
  { value: ',', label: 'Comma (1.234,56)' }
];

const thousandSeparatorOptions: { value: ImportFormatOptions['thousandsSeparator']; label: string }[] = [
  { value: ',', label: 'Comma' },
  { value: '.', label: 'Dot' },
  { value: ' ', label: 'Space' }
];

const signConventionOptions: { value: ImportFormatOptions['signConvention']; label: string }[] = [
  { value: 'positive-credit', label: 'Single signed amount (positive = credit)' },
  { value: 'explicit-columns', label: 'Separate debit and credit columns' }
];

const Settings = () => {
  const {
    state,
    loadDemoData,
    clearDemoData,
    updateBaseCurrency,
    upsertExchangeRate,
    removeExchangeRate,
    updateImportDefaults
  } = useData();
  const [logs, setLogs] = useState(readLogs());
  const [baseCurrency, setBaseCurrency] = useState(state.settings.baseCurrency);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [newRateCurrency, setNewRateCurrency] = useState('');
  const [newRateValue, setNewRateValue] = useState('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [defaultsDraft, setDefaultsDraft] = useState<ImportFormatOptions>(state.settings.importDefaults);

  const handleRefreshLogs = () => {
    setLogs(readLogs());
  };

  const handleClearLogs = () => {
    clearLogs();
    handleRefreshLogs();
  };

  useEffect(() => {
    setBaseCurrency(state.settings.baseCurrency);
  }, [state.settings.baseCurrency]);

  useEffect(() => {
    const entries: Record<string, string> = {};
    state.settings.exchangeRates.forEach((rate) => {
      entries[rate.currency] = rate.rateToBase.toString();
    });
    setRateDrafts(entries);
  }, [state.settings.exchangeRates]);

  useEffect(() => {
    setDefaultsDraft(state.settings.importDefaults);
  }, [state.settings.importDefaults]);

  const lastRateUpdate = useMemo(() => {
    if (!state.settings.lastExchangeRateUpdate) return null;
    return new Date(state.settings.lastExchangeRateUpdate).toLocaleString();
  }, [state.settings.lastExchangeRateUpdate]);

  const handleBaseCurrencySave = () => {
    updateBaseCurrency(baseCurrency);
  };

  const handleRateInputChange = (currency: string, value: string) => {
    setRateDrafts((prev) => ({ ...prev, [currency]: value }));
  };

  const handleRateSave = (currency: string) => {
    const draft = rateDrafts[currency];
    const parsed = Number.parseFloat(draft);
    const error = upsertExchangeRate(currency, parsed);
    setRateError(error?.description ?? null);
  };

  const handleRateRemove = (currency: string) => {
    removeExchangeRate(currency);
  };

  const handleAddRate = () => {
    const currency = newRateCurrency.trim().toUpperCase();
    const parsed = Number.parseFloat(newRateValue);
    const error = upsertExchangeRate(currency, parsed);
    setRateError(error?.description ?? null);
    if (!error) {
      setNewRateCurrency('');
      setNewRateValue('');
    }
  };

  const handleDefaultsSave = () => {
    updateImportDefaults(defaultsDraft);
  };

  return (
    <div className="content-stack">
      <PageHeader
        title="Settings"
        description="Manage demo data, inspect the diagnostic log, and access maintenance actions."
      />
      <div className="form-card">
        <h3>Currency configuration</h3>
        <div className="field">
          <label htmlFor="base-currency">
            Base currency
            <Tooltip label="Reports convert account totals to this currency using the manual exchange rate table." />
          </label>
          <div className="inline-field">
            <input
              id="base-currency"
              type="text"
              value={baseCurrency}
              onChange={(event) => setBaseCurrency(event.target.value.toUpperCase())}
              maxLength={3}
            />
            <button type="button" className="primary-button" onClick={handleBaseCurrencySave}>
              Set base currency
            </button>
          </div>
          <p className="muted-text small">
            Default is GBP. Changing this only affects report presentation; transactions keep their native amounts.
          </p>
        </div>
        <div className="field">
          <label>
            Manual exchange rates
            <Tooltip label="Maintain static conversion rates against the base currency." />
          </label>
          {rateError && <div className="alert error">{rateError}</div>}
          <div className="exchange-rate-list">
            {state.settings.exchangeRates.map((entry) => (
              <div key={entry.currency} className="exchange-rate-row">
                <span className="rate-label">{entry.currency}</span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={rateDrafts[entry.currency] ?? ''}
                  onChange={(event) => handleRateInputChange(entry.currency, event.target.value)}
                  disabled={entry.currency.toUpperCase() === state.settings.baseCurrency.toUpperCase()}
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => handleRateSave(entry.currency)}
                  disabled={entry.currency.toUpperCase() === state.settings.baseCurrency.toUpperCase()}
                >
                  Save
                </button>
                {entry.currency.toUpperCase() !== state.settings.baseCurrency.toUpperCase() && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => handleRateRemove(entry.currency)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="exchange-rate-add">
            <input
              type="text"
              value={newRateCurrency}
              onChange={(event) => setNewRateCurrency(event.target.value)}
              placeholder="Currency code"
              maxLength={3}
            />
            <input
              type="number"
              min="0"
              step="0.0001"
              value={newRateValue}
              onChange={(event) => setNewRateValue(event.target.value)}
              placeholder="Rate"
            />
            <button type="button" className="secondary-button" onClick={handleAddRate}>
              Add rate
            </button>
          </div>
          <p className="muted-text small">
            {lastRateUpdate
              ? `Last updated ${lastRateUpdate}.`
              : 'No manual rates recorded yet. Base currency always has a rate of 1.'}
          </p>
        </div>
        <div className="field">
          <label>
            Import defaults
            <Tooltip label="These defaults pre-fill the Stage 3 import wizard for new uploads." />
          </label>
          <div className="form-grid two-column">
            <div className="field">
              <label htmlFor="default-date-format">Date format</label>
              <select
                id="default-date-format"
                value={defaultsDraft.dateFormat}
                onChange={(event) =>
                  setDefaultsDraft((prev) => ({ ...prev, dateFormat: event.target.value }))
                }
              >
                {dateFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-decimal">Decimal separator</label>
              <select
                id="default-decimal"
                value={defaultsDraft.decimalSeparator}
                onChange={(event) =>
                  setDefaultsDraft((prev) => ({
                    ...prev,
                    decimalSeparator: event.target.value as ImportFormatOptions['decimalSeparator']
                  }))
                }
              >
                {decimalSeparatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-thousands">Thousands separator</label>
              <select
                id="default-thousands"
                value={defaultsDraft.thousandsSeparator}
                onChange={(event) =>
                  setDefaultsDraft((prev) => ({
                    ...prev,
                    thousandsSeparator: event.target.value as ImportFormatOptions['thousandsSeparator']
                  }))
                }
              >
                {thousandSeparatorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="default-sign">Sign convention</label>
              <select
                id="default-sign"
                value={defaultsDraft.signConvention}
                onChange={(event) =>
                  setDefaultsDraft((prev) => ({
                    ...prev,
                    signConvention: event.target.value as ImportFormatOptions['signConvention']
                  }))
                }
              >
                {signConventionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={handleDefaultsSave}>
              Save defaults
            </button>
          </div>
        </div>
      </div>
      <div className="form-card">
        <h3>Demo data controls</h3>
        <p className="muted-text">
          Demo data is flagged internally so it can be removed without affecting real records.
        </p>
        <div className="form-actions">
          <button type="button" className="primary-button" onClick={loadDemoData}>
            Load demo data
          </button>
          <Tooltip label="Adds sample institutions, accounts, categories, and six months of transactions." />
          <button type="button" className="secondary-button" onClick={clearDemoData}>
            Clear demo data
          </button>
          <Tooltip label="Removes any entity or transaction marked as demo without touching real records." />
        </div>
      </div>
      <div className="content-card">
        <div className="section-title">
          <h3>Diagnostics log</h3>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={handleRefreshLogs}>
              Refresh
            </button>
            <button type="button" className="danger-button" onClick={handleClearLogs}>
              Clear log
            </button>
          </div>
        </div>
        <p className="muted-text">
          Logs are stored locally in your browser. Include the latest entries when reporting issues.
        </p>
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Timestamp</th>
                <th scope="col">Level</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs
                .slice()
                .reverse()
                .map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td>{entry.level.toUpperCase()}</td>
                    <td>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(entry, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted-text">
                    No log entries yet.
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

export default Settings;

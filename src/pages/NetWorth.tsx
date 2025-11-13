import { useCallback, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import { formatCurrency, formatDate } from '../utils/format';

type RateMeta = {
  rate: number;
  source: 'base' | 'settings' | 'implied';
};

const liabilityTypes = new Set(['credit', 'loan']);

const NetWorth = () => {
  const { state } = useData();
  const baseCurrency = state.settings.baseCurrency;
  const accounts = useMemo(
    () => state.accounts.filter((account) => !account.archived && account.includeInTotals),
    [state.accounts]
  );
  const [showNativeBalances, setShowNativeBalances] = useState(false);

  const exchangeRateMeta = useMemo(() => {
    const map = new Map<string, RateMeta>();
    const baseKey = baseCurrency.toUpperCase();
    state.settings.exchangeRates.forEach((entry) => {
      const key = entry.currency.toUpperCase();
      map.set(key, {
        rate: entry.rateToBase,
        source: key === baseKey ? 'base' : 'settings'
      });
    });
    if (!map.has(baseKey)) {
      map.set(baseKey, { rate: 1, source: 'base' });
    }
    return map;
  }, [baseCurrency, state.settings.exchangeRates]);

  const getRateInfo = useCallback(
    (currency: string): RateMeta => {
      const key = currency.toUpperCase();
      return exchangeRateMeta.get(key) ?? { rate: 1, source: 'implied' };
    },
    [exchangeRateMeta]
  );

  const convertToBase = useCallback(
    (amount: number, currency: string) => {
      const { rate } = getRateInfo(currency);
      return amount * rate;
    },
    [getRateInfo]
  );

  const accountSummaries = useMemo(
    () =>
      accounts.map((account) => {
        const baseAmount = convertToBase(account.currentBalance, account.currency);
        const isLiability = liabilityTypes.has(account.type) || baseAmount < 0;
        return {
          ...account,
          baseAmount,
          isLiability,
          rateInfo: getRateInfo(account.currency)
        };
      }),
    [accounts, convertToBase, getRateInfo]
  );

  const totals = useMemo(() => {
    return accountSummaries.reduce(
      (acc, account) => {
        if (account.isLiability) {
          acc.liabilities += account.baseAmount;
        } else {
          acc.assets += account.baseAmount;
        }
        return acc;
      },
      { assets: 0, liabilities: 0 }
    );
  }, [accountSummaries]);

  const netWorth = totals.assets + totals.liabilities;

  const renderRateDetails = (currency: string, rateInfo: RateMeta) => {
    if (rateInfo.source === 'base') {
      return `Base currency ${currency.toUpperCase()} – no conversion applied.`;
    }
    if (rateInfo.source === 'settings') {
      return `Manual rate: 1 ${currency.toUpperCase()} → ${formatCurrency(
        rateInfo.rate,
        baseCurrency
      )} (Settings table).`;
    }
    return `Fallback rate: 1 ${currency.toUpperCase()} → ${formatCurrency(
      rateInfo.rate,
      baseCurrency
    )} (defaulted to 1).`;
  };

  const assetsLabel = formatCurrency(totals.assets, baseCurrency);
  const liabilitiesLabel = formatCurrency(Math.abs(totals.liabilities), baseCurrency);

  return (
    <div className="content-stack">
      <PageHeader
        title="Net Worth"
        description="Track assets and liabilities with instant currency conversions aligned to your base currency."
      />
      <div className="content-card">
        <h3>Summary</h3>
        <div className="placeholder-grid" aria-label="Net worth metrics">
          <div className="placeholder-tile">
            <h3>Net worth</h3>
            <p>{formatCurrency(netWorth, baseCurrency)}</p>
            <Tooltip label="Assets minus liabilities, converted to the base currency." />
          </div>
          <div className="placeholder-tile">
            <h3>Assets</h3>
            <p>{assetsLabel}</p>
            <Tooltip label="Sum of asset account balances in the base currency." />
          </div>
          <div className="placeholder-tile">
            <h3>Liabilities</h3>
            <p>{liabilitiesLabel}</p>
            <Tooltip label="Absolute value of liability balances in the base currency." />
          </div>
          <div className="placeholder-tile">
            <h3>Accounts counted</h3>
            <p>{accounts.length.toLocaleString()}</p>
            <Tooltip label="Only accounts marked as included in totals are part of this calculation." />
          </div>
        </div>
      </div>
      <div className="content-card">
        <div className="section-title">
          <h3>Account detail</h3>
          <span className="muted-text">
            Last updated {state.lastUpdated ? formatDate(state.lastUpdated) : 'recently'}
          </span>
        </div>
        <div className="accounts-toggle">
          <span className="muted-text">Display</span>
          <div className="toggle-group" role="group" aria-label="Currency display mode">
            <button
              type="button"
              className={`chip-button ${!showNativeBalances ? 'active' : ''}`}
              aria-pressed={!showNativeBalances}
              onClick={() => setShowNativeBalances(false)}
            >
              Base currency
              <Tooltip label="Show balances converted using the manual exchange table." />
            </button>
            <button
              type="button"
              className={`chip-button ${showNativeBalances ? 'active' : ''}`}
              aria-pressed={showNativeBalances}
              onClick={() => setShowNativeBalances(true)}
            >
              Native currency
              <Tooltip label="Show original account currency alongside the base conversion." />
            </button>
          </div>
        </div>
        <div className="account-grid">
          {accountSummaries.map((account) => (
            <div
              key={account.id}
              className={`account-card ${account.isLiability ? 'liability' : 'asset'}`}
            >
              <div className="section-title">
                <h4>{account.name}</h4>
                <span className={`badge ${account.isLiability ? 'excluded' : 'included'}`}>
                  {account.isLiability ? 'Liability' : 'Asset'}
                </span>
              </div>
              <p className="muted-text">
                {account.type.toUpperCase()} • {account.currency} • Opened {formatDate(account.openingBalanceDate)}
              </p>
              <p>
                <strong>
                  {showNativeBalances
                    ? formatCurrency(account.currentBalance, account.currency)
                    : formatCurrency(account.baseAmount, baseCurrency)}
                </strong>
              </p>
              <p className="muted-text small">{renderRateDetails(account.currency, account.rateInfo)}</p>
              {showNativeBalances && (
                <p className="muted-text small">
                  Base equivalent {formatCurrency(account.baseAmount, baseCurrency)}
                </p>
              )}
            </div>
          ))}
          {accountSummaries.length === 0 && (
            <p className="muted-text">No accounts are marked as included in totals.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetWorth;

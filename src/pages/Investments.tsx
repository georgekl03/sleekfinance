import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Tooltip from '../components/Tooltip';
import { useData } from '../data/DataContext';
import {
  Account,
  DataActionError,
  InvestmentHolding,
  InvestmentPrice,
  InvestmentSale
} from '../data/models';
import { formatCurrency, formatDate, formatPercentage } from '../utils/format';
import { buildExchangeRateMap, convertBetween, convertToBase } from '../utils/currency';
import '../styles/investments.css';

type HoldingMetric = {
  holding: InvestmentHolding;
  account: Account;
  price: InvestmentPrice | null;
  priceCurrency: string | null;
  priceDate: string | null;
  quantity: number;
  averageCostPerUnit: number;
  averageCostAccount: number;
  averageCostBase: number;
  totalCostAccount: number;
  totalCostBase: number;
  totalCostNative: number;
  currentPriceAccount: number | null;
  currentPriceBase: number | null;
  currentValueAccount: number | null;
  currentValueBase: number | null;
  unrealisedAccount: number | null;
  unrealisedBase: number | null;
  unrealisedPercent: number | null;
};

type HoldingFormState = {
  accountId: string;
  symbol: string;
  name: string;
  assetType: string;
  quantity: string;
  costMode: 'total' | 'per-unit';
  costValue: string;
  costCurrency: string;
  priceCurrency: string;
  notes: string;
};

type EditHoldingFormState = {
  accountId: string;
  symbol: string;
  name: string;
  assetType: string;
  quantity: string;
  totalCost: string;
  costCurrency: string;
  priceCurrency: string;
  notes: string;
};

type SaleFormState = {
  quantity: string;
  proceeds: string;
  proceedsCurrency: string;
  saleDate: string;
  notes: string;
};

type PriceFormState = {
  symbol: string;
  price: string;
  currency: string;
  priceDate: string;
  source: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};
const Investments = () => {
  const {
    state,
    createInvestmentHolding,
    updateInvestmentHolding,
    archiveInvestmentHolding,
    restoreInvestmentHolding,
    recordInvestmentSale,
    upsertInvestmentPrice
  } = useData();

  const baseCurrency = state.settings.baseCurrency;
  const exchangeRateMap = useMemo(
    () => buildExchangeRateMap(state.settings),
    [state.settings]
  );

  const investmentAccounts = useMemo(
    () => state.accounts.filter((account) => account.type === 'investment'),
    [state.accounts]
  );
  const accountsById = useMemo(
    () => new Map(investmentAccounts.map((account) => [account.id, account])),
    [investmentAccounts]
  );
  const providers = useMemo(
    () =>
      Array.from(new Set(investmentAccounts.map((account) => account.provider)))
        .sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())),
    [investmentAccounts]
  );
  const investmentCollections = useMemo(
    () =>
      state.accountCollections.filter((collection) =>
        investmentAccounts.some((account) => account.collectionIds.includes(collection.id))
      ),
    [investmentAccounts, state.accountCollections]
  );

  const priceLookup = useMemo(() => {
    const latest = new Map<string, InvestmentPrice>();
    state.investmentPrices.forEach((entry) => {
      const key = entry.symbol.toUpperCase();
      const existing = latest.get(key);
      if (!existing) {
        latest.set(key, entry);
        return;
      }
      const existingTime = new Date(existing.priceDate || existing.createdAt).getTime();
      const nextTime = new Date(entry.priceDate || entry.createdAt).getTime();
      if (nextTime >= existingTime) {
        latest.set(key, entry);
      }
    });
    return latest;
  }, [state.investmentPrices]);

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [showBaseValues, setShowBaseValues] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [addForm, setAddForm] = useState<HoldingFormState>({
    accountId: '',
    symbol: '',
    name: '',
    assetType: '',
    quantity: '',
    costMode: 'total',
    costValue: '',
    costCurrency: '',
    priceCurrency: '',
    notes: ''
  });
  const [addError, setAddError] = useState<DataActionError | null>(null);

  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const editingHolding = useMemo(
    () => state.investmentHoldings.find((holding) => holding.id === editingHoldingId) ?? null,
    [editingHoldingId, state.investmentHoldings]
  );
  const [editForm, setEditForm] = useState<EditHoldingFormState | null>(null);
  const [editError, setEditError] = useState<DataActionError | null>(null);

  const [saleForm, setSaleForm] = useState<SaleFormState>({
    quantity: '',
    proceeds: '',
    proceedsCurrency: '',
    saleDate: todayIso(),
    notes: ''
  });
  const [saleError, setSaleError] = useState<DataActionError | null>(null);

  const [priceForm, setPriceForm] = useState<PriceFormState>({
    symbol: '',
    price: '',
    currency: baseCurrency,
    priceDate: todayIso(),
    source: ''
  });
  const [priceError, setPriceError] = useState<DataActionError | null>(null);
  const [priceImportSummary, setPriceImportSummary] = useState<string | null>(null);

  useEffect(() => {
    setPriceForm((current) => ({
      ...current,
      currency: baseCurrency
    }));
  }, [baseCurrency]);

  useEffect(() => {
    if (!editingHolding) {
      setEditForm(null);
      setSaleForm({
        quantity: '',
        proceeds: '',
        proceedsCurrency: baseCurrency,
        saleDate: todayIso(),
        notes: ''
      });
      return;
    }
    setEditForm({
      accountId: editingHolding.accountId,
      symbol: editingHolding.symbol,
      name: editingHolding.name ?? '',
      assetType: editingHolding.assetType ?? '',
      quantity: editingHolding.quantity.toString(),
      totalCost: editingHolding.totalCost.toString(),
      costCurrency: editingHolding.costCurrency,
      priceCurrency: editingHolding.priceCurrency,
      notes: editingHolding.notes ?? ''
    });
    setSaleForm({
      quantity: '',
      proceeds: '',
      proceedsCurrency: editingHolding.priceCurrency,
      saleDate: todayIso(),
      notes: ''
    });
    setEditError(null);
    setSaleError(null);
  }, [baseCurrency, editingHolding]);

  const accountFilter = useMemo(() => new Set(selectedAccountIds), [selectedAccountIds]);
  const providerFilter = useMemo(() => new Set(selectedProviders), [selectedProviders]);
  const collectionFilter = useMemo(
    () => new Set(selectedCollectionIds),
    [selectedCollectionIds]
  );
  const filteredMetrics = useMemo(() => {
    const metrics: HoldingMetric[] = [];
    state.investmentHoldings.forEach((holding) => {
      if (!includeArchived && holding.archived) {
        return;
      }
      const account = accountsById.get(holding.accountId);
      if (!account) {
        return;
      }
      if (accountFilter.size > 0 && !accountFilter.has(account.id)) {
        return;
      }
      if (providerFilter.size > 0 && !providerFilter.has(account.provider)) {
        return;
      }
      if (collectionFilter.size > 0) {
        const matchesCollection = account.collectionIds.some((id) =>
          collectionFilter.has(id)
        );
        if (!matchesCollection) {
          return;
        }
      }

      const quantity = holding.quantity;
      const priceEntry = priceLookup.get(holding.symbol.toUpperCase()) ?? null;
      const priceCurrency = priceEntry?.currency ?? holding.priceCurrency ?? account.currency;
      const averageCostPerUnit = quantity > 0 ? holding.totalCost / quantity : 0;
      const averageCostAccount = convertBetween(
        averageCostPerUnit,
        holding.costCurrency,
        account.currency,
        exchangeRateMap
      );
      const averageCostBase = convertToBase(
        averageCostPerUnit,
        holding.costCurrency,
        exchangeRateMap
      );
      const totalCostAccount = convertBetween(
        holding.totalCost,
        holding.costCurrency,
        account.currency,
        exchangeRateMap
      );
      const totalCostBase = convertToBase(
        holding.totalCost,
        holding.costCurrency,
        exchangeRateMap
      );
      const totalCostNative = holding.totalCost;

      let currentPriceAccount: number | null = null;
      let currentPriceBase: number | null = null;
      let currentValueAccount: number | null = null;
      let currentValueBase: number | null = null;
      let unrealisedAccount: number | null = null;
      let unrealisedBase: number | null = null;
      let unrealisedPercent: number | null = null;

      if (priceEntry) {
        currentPriceAccount = convertBetween(
          priceEntry.price,
          priceEntry.currency,
          account.currency,
          exchangeRateMap
        );
        currentPriceBase = convertToBase(
          priceEntry.price,
          priceEntry.currency,
          exchangeRateMap
        );
        currentValueAccount = currentPriceAccount * quantity;
        currentValueBase = convertToBase(
          priceEntry.price * quantity,
          priceEntry.currency,
          exchangeRateMap
        );
        unrealisedAccount = currentValueAccount - totalCostAccount;
        unrealisedBase = currentValueBase - totalCostBase;
        if (totalCostBase > 0) {
          unrealisedPercent = (unrealisedBase / totalCostBase) * 100;
        }
      }

      metrics.push({
        holding,
        account,
        price: priceEntry,
        priceCurrency,
        priceDate: priceEntry?.priceDate ?? null,
        quantity,
        averageCostPerUnit,
        averageCostAccount,
        averageCostBase,
        totalCostAccount,
        totalCostBase,
        totalCostNative,
        currentPriceAccount,
        currentPriceBase,
        currentValueAccount,
        currentValueBase,
        unrealisedAccount,
        unrealisedBase,
        unrealisedPercent
      });
    });
    metrics.sort((a, b) => {
      const accountCompare = a.account.name
        .toLocaleLowerCase()
        .localeCompare(b.account.name.toLocaleLowerCase());
      if (accountCompare !== 0) {
        return accountCompare;
      }
      return a.holding.symbol.toLocaleLowerCase().localeCompare(b.holding.symbol.toLocaleLowerCase());
    });
    return metrics;
  }, [
    accountFilter,
    accountsById,
    collectionFilter,
    exchangeRateMap,
    includeArchived,
    priceLookup,
    providerFilter,
    state.investmentHoldings
  ]);

  const groupedHoldings = useMemo(() => {
    const groups = new Map<string, HoldingMetric[]>();
    filteredMetrics.forEach((metric) => {
      const list = groups.get(metric.account.id) ?? [];
      list.push(metric);
      groups.set(metric.account.id, list);
    });
    return Array.from(groups.entries())
      .map(([accountId, holdings]) => ({
        account: accountsById.get(accountId)!,
        holdings
      }))
      .sort((a, b) =>
        a.account.name.toLocaleLowerCase().localeCompare(b.account.name.toLocaleLowerCase())
      );
  }, [accountsById, filteredMetrics]);

  const filteredHoldingIds = useMemo(
    () => new Set(filteredMetrics.map((metric) => metric.holding.id)),
    [filteredMetrics]
  );

  const totals = useMemo(() => {
    let totalCostBase = 0;
    let totalValueBase = 0;
    const accountBreakdown = new Map<
      string,
      { account: Account; valueAccount: number; valueBase: number; costBase: number }
    >();
    const currencyBreakdown = new Map<
      string,
      { currency: string; valueBase: number; costBase: number }
    >();
    const assetBreakdown = new Map<string, { label: string; valueBase: number }>();

    filteredMetrics.forEach((metric) => {
      totalCostBase += metric.totalCostBase;
      if (metric.currentValueBase !== null) {
        totalValueBase += metric.currentValueBase;
      }

      const accountEntry = accountBreakdown.get(metric.account.id) ?? {
        account: metric.account,
        valueAccount: 0,
        valueBase: 0,
        costBase: 0
      };
      accountEntry.valueAccount += metric.currentValueAccount ?? 0;
      accountEntry.valueBase += metric.currentValueBase ?? 0;
      accountEntry.costBase += metric.totalCostBase;
      accountBreakdown.set(metric.account.id, accountEntry);

      const currencyKey = (metric.priceCurrency ?? metric.account.currency).toUpperCase();
      const currencyEntry = currencyBreakdown.get(currencyKey) ?? {
        currency: currencyKey,
        valueBase: 0,
        costBase: 0
      };
      currencyEntry.valueBase += metric.currentValueBase ?? 0;
      currencyEntry.costBase += metric.totalCostBase;
      currencyBreakdown.set(currencyKey, currencyEntry);

      const assetKey = metric.holding.assetType?.trim() || 'Unclassified';
      const assetEntry = assetBreakdown.get(assetKey) ?? {
        label: assetKey,
        valueBase: 0
      };
      assetEntry.valueBase += metric.currentValueBase ?? 0;
      assetBreakdown.set(assetKey, assetEntry);
    });

    const totalUnrealisedBase = totalValueBase - totalCostBase;
    const totalReturnPercent = totalCostBase > 0 ? (totalUnrealisedBase / totalCostBase) * 100 : null;

    return {
      totalCostBase,
      totalValueBase,
      totalUnrealisedBase,
      totalReturnPercent,
      accountBreakdown: Array.from(accountBreakdown.values()),
      currencyBreakdown: Array.from(currencyBreakdown.values()),
      assetBreakdown: Array.from(assetBreakdown.values())
    };
  }, [filteredMetrics]);

  const filteredSales = useMemo(() => {
    return state.investmentSales
      .filter((sale) => filteredHoldingIds.has(sale.holdingId))
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  }, [filteredHoldingIds, state.investmentSales]);
  const handleAddHoldingSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError(null);
    const account = accountsById.get(addForm.accountId);
    if (!account) {
      setAddError({ title: 'Account required', description: 'Choose an investment account.' });
      return;
    }
    const symbol = addForm.symbol.trim();
    if (!symbol) {
      setAddError({ title: 'Symbol required', description: 'Enter a ticker or identifier.' });
      return;
    }
    const quantity = Number.parseFloat(addForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setAddError({ title: 'Invalid quantity', description: 'Quantity must be a positive number.' });
      return;
    }
    const costValue = Number.parseFloat(addForm.costValue);
    if (!Number.isFinite(costValue) || costValue < 0) {
      setAddError({ title: 'Invalid cost', description: 'Enter a zero or positive cost value.' });
      return;
    }
    const totalCost = addForm.costMode === 'per-unit' ? costValue * quantity : costValue;
    const costCurrency = addForm.costCurrency.trim()
      ? addForm.costCurrency.trim().toUpperCase()
      : account.currency;
    const priceCurrency = addForm.priceCurrency.trim()
      ? addForm.priceCurrency.trim().toUpperCase()
      : costCurrency;

    const error = createInvestmentHolding({
      accountId: account.id,
      symbol,
      name: addForm.name.trim() || null,
      assetType: addForm.assetType.trim() || null,
      quantity,
      totalCost,
      costCurrency,
      priceCurrency,
      notes: addForm.notes.trim() || null
    });
    if (error) {
      setAddError(error);
      return;
    }
    setAddForm({
      accountId: addForm.accountId,
      symbol: '',
      name: '',
      assetType: '',
      quantity: '',
      costMode: addForm.costMode,
      costValue: '',
      costCurrency: addForm.costCurrency,
      priceCurrency: addForm.priceCurrency,
      notes: ''
    });
  };

  const handleEditHoldingSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingHolding || !editForm) return;
    setEditError(null);
    const account = accountsById.get(editForm.accountId);
    if (!account) {
      setEditError({ title: 'Account required', description: 'Choose an investment account.' });
      return;
    }
    const symbol = editForm.symbol.trim();
    if (!symbol) {
      setEditError({ title: 'Symbol required', description: 'Enter a ticker or identifier.' });
      return;
    }
    const quantity = Number.parseFloat(editForm.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setEditError({ title: 'Invalid quantity', description: 'Quantity must be zero or positive.' });
      return;
    }
    const totalCost = Number.parseFloat(editForm.totalCost);
    if (!Number.isFinite(totalCost) || totalCost < 0) {
      setEditError({ title: 'Invalid cost', description: 'Cost must be zero or positive.' });
      return;
    }
    const error = updateInvestmentHolding(editingHolding.id, {
      accountId: account.id,
      symbol,
      name: editForm.name.trim() || null,
      assetType: editForm.assetType.trim() || null,
      quantity,
      totalCost,
      costCurrency: editForm.costCurrency.trim()
        ? editForm.costCurrency.trim().toUpperCase()
        : editingHolding.costCurrency,
      priceCurrency: editForm.priceCurrency.trim()
        ? editForm.priceCurrency.trim().toUpperCase()
        : editingHolding.priceCurrency,
      notes: editForm.notes.trim() || null
    });
    if (error) {
      setEditError(error);
      return;
    }
    setEditingHoldingId(null);
  };

  const handleSaleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingHolding) return;
    setSaleError(null);
    const quantity = Number.parseFloat(saleForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setSaleError({ title: 'Invalid quantity', description: 'Sale quantity must be positive.' });
      return;
    }
    const proceeds = Number.parseFloat(saleForm.proceeds);
    if (!Number.isFinite(proceeds) || proceeds < 0) {
      setSaleError({ title: 'Invalid proceeds', description: 'Proceeds must be zero or positive.' });
      return;
    }
    const saleDate = saleForm.saleDate || todayIso();
    const error = recordInvestmentSale({
      holdingId: editingHolding.id,
      quantity,
      proceeds,
      proceedsCurrency: saleForm.proceedsCurrency.trim()
        ? saleForm.proceedsCurrency.trim().toUpperCase()
        : editingHolding.priceCurrency,
      saleDate,
      notes: saleForm.notes.trim() || null
    });
    if (error) {
      setSaleError(error);
      return;
    }
    setSaleForm({
      quantity: '',
      proceeds: '',
      proceedsCurrency: editingHolding.priceCurrency,
      saleDate: todayIso(),
      notes: ''
    });
  };

  const handlePriceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPriceError(null);
    const symbol = priceForm.symbol.trim();
    if (!symbol) {
      setPriceError({ title: 'Symbol required', description: 'Enter a ticker or identifier.' });
      return;
    }
    const price = Number.parseFloat(priceForm.price);
    if (!Number.isFinite(price) || price <= 0) {
      setPriceError({ title: 'Invalid price', description: 'Enter a positive price.' });
      return;
    }
    const currency = priceForm.currency.trim() || baseCurrency;
    const error = upsertInvestmentPrice({
      symbol,
      price,
      currency: currency.toUpperCase(),
      priceDate: priceForm.priceDate || todayIso(),
      source: priceForm.source.trim() || null
    });
    if (error) {
      setPriceError(error);
      return;
    }
    setPriceForm({
      symbol: '',
      price: '',
      currency,
      priceDate: todayIso(),
      source: ''
    });
    setPriceImportSummary(null);
  };

  const handlePriceImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      let headerInfo: {
        symbol: number;
        price: number;
        currency: number | null;
        date: number | null;
      } | null = null;
      let imported = 0;
      const issues: string[] = [];
      lines.forEach((line, index) => {
        const cells = parseCsvLine(line).map((cell) => cell.trim());
        if (!cells.length) return;
        if (!headerInfo) {
          const normalized = cells.map((cell) => cell.toLowerCase());
          const symbolIdx = normalized.findIndex((value) => value === 'symbol');
          const priceIdx = normalized.findIndex((value) => value.includes('price'));
          const currencyIdx = normalized.findIndex((value) => value === 'currency');
          const dateIdx = normalized.findIndex((value) => value.includes('date'));
          if (symbolIdx !== -1 && priceIdx !== -1) {
            headerInfo = {
              symbol: symbolIdx,
              price: priceIdx,
              currency: currencyIdx !== -1 ? currencyIdx : null,
              date: dateIdx !== -1 ? dateIdx : null
            };
            return;
          }
          headerInfo = {
            symbol: 0,
            price: Math.min(1, cells.length - 1),
            currency: cells.length > 2 ? 2 : null,
            date: cells.length > 3 ? 3 : null
          };
        }
        const info = headerInfo;
        const symbol = cells[info.symbol] ?? '';
        const priceText = cells[info.price] ?? '';
        const currencyText = info.currency !== null ? cells[info.currency] : '';
        const dateText = info.date !== null ? cells[info.date] : '';
        const price = Number.parseFloat(priceText.replace(/[^0-9.\-]/g, ''));
        if (!symbol || !Number.isFinite(price) || price <= 0) {
          issues.push(`Row ${index + 1}: unable to parse symbol or price.`);
          return;
        }
        const currency = currencyText
          ? currencyText.trim().toUpperCase()
          : baseCurrency.toUpperCase();
        const priceDate = dateText || todayIso();
        const error = upsertInvestmentPrice({
          symbol: symbol.trim(),
          price,
          currency,
          priceDate,
          source: 'CSV import'
        });
        if (error) {
          issues.push(`Row ${index + 1}: ${error.title}`);
          return;
        }
        imported += 1;
      });
      setPriceImportSummary(
        issues.length
          ? `Imported ${imported} price${imported === 1 ? '' : 's'}. ${issues.length} row${
              issues.length === 1 ? '' : 's'
            } skipped: ${issues.join(' ')}`
          : `Imported ${imported} price${imported === 1 ? '' : 's'}.`
      );
    };
    reader.readAsText(file);
    event.target.value = '';
  };
  const latestPrices = useMemo(() => {
    return Array.from(priceLookup.entries())
      .map(([symbol, price]) => ({ symbol, price }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [priceLookup]);

  const salesWithContext = useMemo(() => {
    return filteredSales.map((sale) => {
      const holding = state.investmentHoldings.find((entry) => entry.id === sale.holdingId);
      const account = holding ? accountsById.get(holding.accountId) ?? null : null;
      return { sale, holding, account };
    });
  }, [accountsById, filteredSales, state.investmentHoldings]);

  const resetFilters = () => {
    setSelectedAccountIds([]);
    setSelectedProviders([]);
    setSelectedCollectionIds([]);
  };

  return (
    <div className="content-stack investments-page">
      <PageHeader
        title="Investments"
        description="Track holdings, prices, and performance across your investment accounts."
      />

      <div className="content-card portfolio-summary">
        <div className="summary-header">
          <h2>Portfolio summary</h2>
          <div className="summary-actions">
            <label className="toggle">
              <input
                type="checkbox"
                checked={showBaseValues}
                onChange={(event) => setShowBaseValues(event.target.checked)}
              />
              <span>Show base currency details</span>
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              <span>Include archived holdings</span>
            </label>
          </div>
        </div>
        <div className="portfolio-summary-grid">
          <div className="summary-tile">
            <h4>Portfolio value</h4>
            <strong>{formatCurrency(totals.totalValueBase, baseCurrency)}</strong>
            <p className="muted-text">Current value in base currency.</p>
          </div>
          <div className="summary-tile">
            <h4>Total cost</h4>
            <strong>{formatCurrency(totals.totalCostBase, baseCurrency)}</strong>
            <p className="muted-text">Historical cost across filtered holdings.</p>
          </div>
          <div className="summary-tile">
            <h4>Unrealised P/L</h4>
            <strong>{formatCurrency(totals.totalUnrealisedBase, baseCurrency)}</strong>
            <p className="muted-text">Base currency difference between cost and value.</p>
          </div>
          <div className="summary-tile">
            <h4>Return</h4>
            <strong>
              {totals.totalReturnPercent !== null
                ? formatPercentage(totals.totalReturnPercent, 2)
                : '—'}
            </strong>
            <p className="muted-text">Unrealised return for the filtered holdings.</p>
          </div>
        </div>
        <div className="summary-breakdowns">
          <div>
            <h5>By account</h5>
            <ul>
              {totals.accountBreakdown.length === 0 && (
                <li className="muted-text">No holdings match the current filters.</li>
              )}
              {totals.accountBreakdown.map((entry) => (
                <li key={entry.account.id}>
                  <span>{entry.account.name}</span>
                  <span>
                    {formatCurrency(entry.valueBase, baseCurrency)}
                    <span className="muted-text">
                      {' '}
                      ({formatCurrency(entry.valueAccount, entry.account.currency)})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>By currency</h5>
            <ul>
              {totals.currencyBreakdown.length === 0 && (
                <li className="muted-text">No price data available yet.</li>
              )}
              {totals.currencyBreakdown.map((entry) => (
                <li key={entry.currency}>
                  <span>{entry.currency}</span>
                  <span>{formatCurrency(entry.valueBase, baseCurrency)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>By asset type</h5>
            <ul>
              {totals.assetBreakdown.map((entry) => (
                <li key={entry.label}>
                  <span>{entry.label}</span>
                  <span>{formatCurrency(entry.valueBase, baseCurrency)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="content-card filters-card">
        <h2>Filters</h2>
        <div className="filters-grid">
          <label>
            <span>Accounts</span>
            <select
              multiple
              value={selectedAccountIds}
              onChange={(event) =>
                setSelectedAccountIds(
                  Array.from(event.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {investmentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.archived ? ' (Archived)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Providers</span>
            <select
              multiple
              value={selectedProviders}
              onChange={(event) =>
                setSelectedProviders(
                  Array.from(event.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Collections</span>
            <select
              multiple
              value={selectedCollectionIds}
              onChange={(event) =>
                setSelectedCollectionIds(
                  Array.from(event.target.selectedOptions, (option) => option.value)
                )
              }
            >
              {investmentCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="filters-actions">
          <button type="button" className="secondary-button" onClick={resetFilters}>
            Clear filters
          </button>
          <Tooltip label="Filters update holdings, summary totals, and realised P/L." />
        </div>
      </div>
      <div className="content-card">
        <h2>Holdings</h2>
        <div className="table-scroll">
          <table className="investments-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name / Asset</th>
                <th className="numeric">Quantity</th>
                <th className="numeric">Avg cost / unit</th>
                <th className="numeric">Total cost</th>
                <th className="numeric">Current price</th>
                <th className="numeric">Current value</th>
                <th className="numeric">Unrealised P/L</th>
                <th className="numeric">Return</th>
                <th>Actions</th>
              </tr>
            </thead>
            {groupedHoldings.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={10} className="muted-text">
                    No holdings found for the selected filters.
                  </td>
                </tr>
              </tbody>
            ) : (
              groupedHoldings.map(({ account, holdings }) => (
                <tbody key={account.id}>
                  <tr className="account-row">
                    <td colSpan={10}>
                      <div className="account-heading">
                        <strong>{account.name}</strong>
                        <span className="muted-text">
                          {account.provider} • {account.currency}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {holdings.map((metric) => {
                    const isEditing = metric.holding.id === editingHoldingId;
                    return (
                      <tr
                        key={metric.holding.id}
                        className={metric.holding.archived ? 'archived-row' : undefined}
                      >
                        <td>
                          <div className="symbol-cell">
                            <strong>{metric.holding.symbol}</strong>
                            {metric.holding.assetType && (
                              <span className="muted-text">{metric.holding.assetType}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div>{metric.holding.name || '—'}</div>
                          {metric.holding.notes && (
                            <div className="muted-text">{metric.holding.notes}</div>
                          )}
                        </td>
                        <td className="numeric">{metric.quantity.toLocaleString()}</td>
                        <td className="numeric">
                          <div>{formatCurrency(metric.averageCostAccount, metric.account.currency)}</div>
                          {metric.holding.costCurrency !== metric.account.currency && (
                            <div className="muted-text">
                              Cost: {formatCurrency(metric.averageCostPerUnit, metric.holding.costCurrency)}
                            </div>
                          )}
                          {showBaseValues && (
                            <div className="muted-text">
                              Base: {formatCurrency(metric.averageCostBase, baseCurrency)}
                            </div>
                          )}
                        </td>
                        <td className="numeric">
                          <div>{formatCurrency(metric.totalCostAccount, metric.account.currency)}</div>
                          {metric.holding.costCurrency !== metric.account.currency && (
                            <div className="muted-text">
                              Cost: {formatCurrency(metric.totalCostNative, metric.holding.costCurrency)}
                            </div>
                          )}
                          {showBaseValues && (
                            <div className="muted-text">
                              Base: {formatCurrency(metric.totalCostBase, baseCurrency)}
                            </div>
                          )}
                        </td>
                        <td className="numeric">
                          {metric.currentPriceAccount !== null ? (
                            <>
                              <div>{formatCurrency(metric.currentPriceAccount, metric.account.currency)}</div>
                              {metric.price?.price && metric.priceCurrency && (
                                <div className="muted-text">
                                  Quote: {formatCurrency(metric.price.price, metric.priceCurrency)}
                                  {metric.priceDate && ` (${formatDate(metric.priceDate)})`}
                                </div>
                              )}
                              {showBaseValues && metric.currentPriceBase !== null && (
                                <div className="muted-text">
                                  Base: {formatCurrency(metric.currentPriceBase, baseCurrency)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="muted-text">Price required</span>
                          )}
                        </td>
                        <td className="numeric">
                          {metric.currentValueAccount !== null ? (
                            <>
                              <div>{formatCurrency(metric.currentValueAccount, metric.account.currency)}</div>
                              {showBaseValues && metric.currentValueBase !== null && (
                                <div className="muted-text">
                                  Base: {formatCurrency(metric.currentValueBase, baseCurrency)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td className="numeric">
                          {metric.unrealisedAccount !== null ? (
                            <>
                              <div>{formatCurrency(metric.unrealisedAccount, metric.account.currency)}</div>
                              {showBaseValues && metric.unrealisedBase !== null && (
                                <div
                                  className={
                                    metric.unrealisedBase >= 0 ? 'muted-text positive' : 'muted-text negative'
                                  }
                                >
                                  Base: {formatCurrency(metric.unrealisedBase, baseCurrency)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                        <td className="numeric">
                          {metric.unrealisedPercent !== null
                            ? formatPercentage(metric.unrealisedPercent, 2)
                            : '—'}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => setEditingHoldingId(isEditing ? null : metric.holding.id)}
                            >
                              {isEditing ? 'Close' : 'Manage'}
                            </button>
                            {metric.holding.archived ? (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => restoreInvestmentHolding(metric.holding.id)}
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => archiveInvestmentHolding(metric.holding.id)}
                              >
                                Archive
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))
            )}
          </table>
        </div>
      </div>
      <div className="content-card">
        <h2>Add holding</h2>
        <form className="form-grid" onSubmit={handleAddHoldingSubmit}>
          <label>
            <span>Account</span>
            <select
              required
              value={addForm.accountId}
              onChange={(event) => setAddForm((current) => ({ ...current, accountId: event.target.value }))}
            >
              <option value="">Select account</option>
              {investmentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Symbol</span>
            <input
              required
              value={addForm.symbol}
              onChange={(event) => setAddForm((current) => ({ ...current, symbol: event.target.value }))}
            />
          </label>
          <label>
            <span>Instrument name (optional)</span>
            <input
              value={addForm.name}
              onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Asset type (optional)</span>
            <input
              value={addForm.assetType}
              onChange={(event) => setAddForm((current) => ({ ...current, assetType: event.target.value }))}
            />
          </label>
          <label>
            <span>Quantity</span>
            <input
              required
              type="number"
              step="any"
              min="0"
              value={addForm.quantity}
              onChange={(event) => setAddForm((current) => ({ ...current, quantity: event.target.value }))}
            />
          </label>
          <label>
            <span>Cost basis</span>
            <div className="inline-inputs">
              <select
                value={addForm.costMode}
                onChange={(event) =>
                  setAddForm((current) => ({ ...current, costMode: event.target.value as HoldingFormState['costMode'] }))
                }
              >
                <option value="total">Total cost</option>
                <option value="per-unit">Cost per unit</option>
              </select>
              <input
                required
                type="number"
                step="any"
                min="0"
                value={addForm.costValue}
                onChange={(event) => setAddForm((current) => ({ ...current, costValue: event.target.value }))}
              />
            </div>
          </label>
          <label>
            <span>Cost currency</span>
            <input
              value={addForm.costCurrency}
              onChange={(event) => setAddForm((current) => ({ ...current, costCurrency: event.target.value }))}
              placeholder="Defaults to account currency"
            />
          </label>
          <label>
            <span>Price currency</span>
            <input
              value={addForm.priceCurrency}
              onChange={(event) => setAddForm((current) => ({ ...current, priceCurrency: event.target.value }))}
              placeholder="Defaults to cost currency"
            />
          </label>
          <label className="notes-field">
            <span>Notes</span>
            <textarea
              rows={2}
              value={addForm.notes}
              onChange={(event) => setAddForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Add holding
            </button>
            <Tooltip label="Holdings store quantity, cost basis, and price currency for future reporting." />
          </div>
          {addError && (
            <div className="form-error">{addError.title}: {addError.description}</div>
          )}
        </form>
      </div>

      {editingHolding && editForm && (
        <div className="content-card">
          <h2>Manage holding</h2>
          <p className="muted-text">
            Editing {editingHolding.symbol} in {accountsById.get(editForm.accountId)?.name ?? 'selected account'}
          </p>
          <form className="form-grid" onSubmit={handleEditHoldingSubmit}>
            <label>
              <span>Account</span>
              <select
                value={editForm.accountId}
                onChange={(event) =>
                  setEditForm((current) =>
                    current ? { ...current, accountId: event.target.value } : current
                  )
                }
              >
                {investmentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Symbol</span>
              <input
                value={editForm.symbol}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, symbol: event.target.value } : current))
                }
              />
            </label>
            <label>
              <span>Instrument name</span>
              <input
                value={editForm.name}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, name: event.target.value } : current))
                }
              />
            </label>
            <label>
              <span>Asset type</span>
              <input
                value={editForm.assetType}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, assetType: event.target.value } : current))
                }
              />
            </label>
            <label>
              <span>Quantity</span>
              <input
                type="number"
                step="any"
                min="0"
                value={editForm.quantity}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, quantity: event.target.value } : current))
                }
              />
            </label>
            <label>
              <span>Total cost</span>
              <input
                type="number"
                step="any"
                min="0"
                value={editForm.totalCost}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, totalCost: event.target.value } : current))
                }
              />
            </label>
            <label>
              <span>Cost currency</span>
              <input
                value={editForm.costCurrency}
                onChange={(event) =>
                  setEditForm((current) =>
                    current ? { ...current, costCurrency: event.target.value } : current
                  )
                }
              />
            </label>
            <label>
              <span>Price currency</span>
              <input
                value={editForm.priceCurrency}
                onChange={(event) =>
                  setEditForm((current) =>
                    current ? { ...current, priceCurrency: event.target.value } : current
                  )
                }
              />
            </label>
            <label className="notes-field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(event) =>
                  setEditForm((current) => (current ? { ...current, notes: event.target.value } : current))
                }
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                Save changes
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingHoldingId(null)}
              >
                Cancel
              </button>
            </div>
            {editError && (
              <div className="form-error">{editError.title}: {editError.description}</div>
            )}
          </form>

          <h3>Record sale</h3>
          <form className="form-grid" onSubmit={handleSaleSubmit}>
            <label>
              <span>Quantity sold</span>
              <input
                required
                type="number"
                step="any"
                min="0"
                value={saleForm.quantity}
                onChange={(event) =>
                  setSaleForm((current) => ({ ...current, quantity: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Sale proceeds</span>
              <input
                required
                type="number"
                step="any"
                min="0"
                value={saleForm.proceeds}
                onChange={(event) =>
                  setSaleForm((current) => ({ ...current, proceeds: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Proceeds currency</span>
              <input
                value={saleForm.proceedsCurrency}
                onChange={(event) =>
                  setSaleForm((current) => ({ ...current, proceedsCurrency: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Sale date</span>
              <input
                type="date"
                value={saleForm.saleDate}
                onChange={(event) =>
                  setSaleForm((current) => ({ ...current, saleDate: event.target.value }))
                }
              />
            </label>
            <label className="notes-field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={saleForm.notes}
                onChange={(event) =>
                  setSaleForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="secondary-button">
                Record sale
              </button>
            </div>
            {saleError && (
              <div className="form-error">{saleError.title}: {saleError.description}</div>
            )}
          </form>
        </div>
      )}
      <div className="content-card">
        <h2>Market prices</h2>
        <form className="form-grid" onSubmit={handlePriceSubmit}>
          <label>
            <span>Symbol</span>
            <input
              required
              value={priceForm.symbol}
              onChange={(event) => setPriceForm((current) => ({ ...current, symbol: event.target.value }))}
            />
          </label>
          <label>
            <span>Price</span>
            <input
              required
              type="number"
              step="any"
              min="0"
              value={priceForm.price}
              onChange={(event) => setPriceForm((current) => ({ ...current, price: event.target.value }))}
            />
          </label>
          <label>
            <span>Currency</span>
            <input
              value={priceForm.currency}
              onChange={(event) => setPriceForm((current) => ({ ...current, currency: event.target.value }))}
            />
          </label>
          <label>
            <span>Price date</span>
            <input
              type="date"
              value={priceForm.priceDate}
              onChange={(event) => setPriceForm((current) => ({ ...current, priceDate: event.target.value }))}
            />
          </label>
          <label>
            <span>Source (optional)</span>
            <input
              value={priceForm.source}
              onChange={(event) => setPriceForm((current) => ({ ...current, source: event.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Save price
            </button>
            <label className="file-input">
              <input type="file" accept=".csv,text/csv" onChange={handlePriceImport} />
              <span>Import CSV</span>
            </label>
          </div>
          {priceError && (
            <div className="form-error">{priceError.title}: {priceError.description}</div>
          )}
          {priceImportSummary && <div className="form-summary">{priceImportSummary}</div>}
        </form>

        <div className="table-scroll">
          <table className="investments-table prices-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="numeric">Price</th>
                <th>Date</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {latestPrices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted-text">
                    No prices recorded yet.
                  </td>
                </tr>
              ) : (
                latestPrices.map(({ symbol, price }) => (
                  <tr key={symbol}>
                    <td>{symbol}</td>
                    <td className="numeric">{formatCurrency(price.price, price.currency)}</td>
                    <td>{formatDate(price.priceDate)}</td>
                    <td>{price.source || 'Manual'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="content-card">
        <h2>Realised P/L</h2>
        <div className="table-scroll">
          <table className="investments-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Holding</th>
                <th className="numeric">Quantity</th>
                <th className="numeric">Proceeds</th>
                <th className="numeric">Cost basis</th>
                <th className="numeric">Realised (base)</th>
              </tr>
            </thead>
            <tbody>
              {salesWithContext.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted-text">
                    No realised sales recorded for the current filters.
                  </td>
                </tr>
              ) : (
                salesWithContext.map(({ sale, holding, account }) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.saleDate)}</td>
                    <td>
                      <div>{holding?.symbol ?? 'Unknown holding'}</div>
                      {account && <div className="muted-text">{account.name}</div>}
                    </td>
                    <td className="numeric">{sale.quantity.toLocaleString()}</td>
                    <td className="numeric">
                      {formatCurrency(sale.proceeds, sale.proceedsCurrency)}
                    </td>
                    <td className="numeric">{formatCurrency(sale.costBasis, sale.costCurrency)}</td>
                    <td className={sale.realisedBase >= 0 ? 'numeric positive' : 'numeric negative'}>
                      {formatCurrency(sale.realisedBase, sale.baseCurrency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Investments;

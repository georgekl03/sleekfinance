const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

const getCurrencyFormatter = (currency: string, locale?: string) => {
  const key = `${locale ?? 'default'}|${currency}`;
  if (!currencyFormatterCache.has(key)) {
    currencyFormatterCache.set(
      key,
      new Intl.NumberFormat(locale ?? undefined, {
        style: 'currency',
        currency,
        currencyDisplay: 'symbol'
      })
    );
  }
  return currencyFormatterCache.get(key)!;
};

export const formatCurrency = (value: number, currency = 'GBP', locale?: string) =>
  getCurrencyFormatter(currency, locale).format(value);

export const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatPercentage = (value: number, fractionDigits = 1) =>
  `${value.toFixed(fractionDigits)}%`;

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD'
});

export const formatCurrency = (value: number) => currencyFormatter.format(value);

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

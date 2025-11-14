import { SettingsState } from '../data/models';

export type ExchangeRateMap = Map<string, number>;

export const buildExchangeRateMap = (settings: SettingsState): ExchangeRateMap => {
  const map = new Map<string, number>();
  settings.exchangeRates.forEach((entry) => {
    map.set(entry.currency.toUpperCase(), entry.rateToBase);
  });
  const base = settings.baseCurrency.toUpperCase();
  if (!map.has(base)) {
    map.set(base, 1);
  }
  return map;
};

export const convertToBase = (
  amount: number,
  currency: string | null | undefined,
  rateMap: ExchangeRateMap
) => {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  if (!currency) {
    return amount;
  }
  const rate = rateMap.get(currency.toUpperCase()) ?? 1;
  return amount * rate;
};

export const convertFromBase = (
  amount: number,
  currency: string | null | undefined,
  rateMap: ExchangeRateMap
) => {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  if (!currency) {
    return amount;
  }
  const rate = rateMap.get(currency.toUpperCase()) ?? 1;
  if (rate === 0) {
    return 0;
  }
  return amount / rate;
};

export const convertBetween = (
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  rateMap: ExchangeRateMap
) => {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  if (!toCurrency) {
    return amount;
  }
  if (fromCurrency && fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return amount;
  }
  const baseAmount = convertToBase(amount, fromCurrency, rateMap);
  return convertFromBase(baseAmount, toCurrency, rateMap);
};

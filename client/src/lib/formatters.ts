export type NumericValue = number | string | null | undefined;

export function toNumber(value: NumericValue): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatNumber(value: NumericValue, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(toNumber(value));
}

export function formatCompactNumber(value: NumericValue): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toNumber(value));
}

export function formatCurrency(value: NumericValue, currencyCode?: string | null): string {
  if (!currencyCode) {
    return formatNumber(value);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

export function formatCurrencyRate(value: NumericValue, currencyCode?: string | null): string {
  if (!currencyCode) {
    return toNumber(value).toFixed(4);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(toNumber(value));
}

export function formatOptionalNumber(value: NumericValue): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return formatNumber(value);
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return 'No usage records';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return 'unknown time';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatMonth(value?: string | null): string {
  if (!value) {
    return 'Unknown month';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

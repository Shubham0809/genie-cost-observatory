import {
  ALL_WORKSPACES,
  DEFAULT_MONTH_COUNT,
  MAX_MONTH_COUNT,
  MIN_MONTH_COUNT,
  NONE_WORKSPACE,
  SEARCH_TERM_MAX_LENGTH,
} from './constants';

const WORKSPACE_ID_PATTERN = /^\d{1,20}$/;
const MONTH_START_PATTERN = /^\d{4}-\d{2}-01$/;

export function parseWorkspaceScope(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === ALL_WORKSPACES) {
    return ALL_WORKSPACES;
  }
  if (!WORKSPACE_ID_PATTERN.test(trimmed)) {
    throw new Error('Workspace ID must be numeric.');
  }
  return trimmed;
}

export function parseSelectedWorkspaceId(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed || trimmed === NONE_WORKSPACE || trimmed === ALL_WORKSPACES) {
    return NONE_WORKSPACE;
  }
  if (!WORKSPACE_ID_PATTERN.test(trimmed)) {
    throw new Error('Workspace ID must be numeric.');
  }
  return trimmed;
}

export function parseMonthCount(value: number | string | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_MONTH_COUNT || parsed > MAX_MONTH_COUNT) {
    return DEFAULT_MONTH_COUNT;
  }
  return parsed;
}

export function parseSearchTerm(value: string | null | undefined): string {
  return (value ?? '').trim().slice(0, SEARCH_TERM_MAX_LENGTH);
}

export function parseMonthStart(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  if (!MONTH_START_PATTERN.test(trimmed)) {
    return fallback;
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return trimmed;
}

export function currentMonthStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function recentMonthStarts(count: number, now = new Date()): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let index = 0; index < count; index += 1) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
}

import { describe, expect, it } from 'vitest';
import { ALL_WORKSPACES, DEFAULT_MONTH_COUNT, NONE_WORKSPACE } from './constants';
import {
  parseMonthCount,
  parseMonthStart,
  parseSearchTerm,
  parseSelectedWorkspaceId,
  parseWorkspaceScope,
  recentMonthStarts,
} from './validation';
import { publicQueryError } from './query-error';

describe('input validation', () => {
  it('accepts the all-workspaces sentinel and numeric workspace IDs', () => {
    expect(parseWorkspaceScope('')).toBe(ALL_WORKSPACES);
    expect(parseWorkspaceScope(' 1841486467293708 ')).toBe('1841486467293708');
    expect(() => parseWorkspaceScope('1; drop table usage')).toThrow(/numeric/);
  });

  it('does not send the all-workspaces sentinel into identity queries', () => {
    expect(parseSelectedWorkspaceId(ALL_WORKSPACES)).toBe(NONE_WORKSPACE);
    expect(parseSelectedWorkspaceId('99')).toBe('99');
  });

  it('clamps month counts and month-start dates', () => {
    expect(parseMonthCount(6)).toBe(6);
    expect(parseMonthCount(99)).toBe(DEFAULT_MONTH_COUNT);
    expect(parseMonthStart('2026-10-01', '2026-01-01')).toBe('2026-10-01');
    expect(parseMonthStart('2026-13-01', '2026-01-01')).toBe('2026-01-01');
    expect(recentMonthStarts(3, new Date('2026-10-15T00:00:00Z'))).toEqual(['2026-10-01', '2026-09-01', '2026-08-01']);
  });

  it('truncates search terms instead of interpolating them into SQL', () => {
    expect(parseSearchTerm(`  ${'x'.repeat(250)} `)).toHaveLength(200);
  });
});

describe('no credential exposure', () => {
  it('redacts tokens and secrets from query errors', () => {
    expect(publicQueryError('Authorization: Bearer super-secret-token-value')).toContain('system-table permissions');
    expect(publicQueryError('PERMISSION_DENIED on system.billing.usage')).toContain('PERMISSION_DENIED');
  });
});

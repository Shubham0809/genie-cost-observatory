import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const queryDir = path.resolve(process.cwd(), 'config/queries');

function readQueries(): Record<string, string> {
  return Object.fromEntries(
    readdirSync(queryDir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => [file, readFileSync(path.join(queryDir, file), 'utf8')])
  );
}

describe('Genie billing SQL contracts', () => {
  it('keeps every query on system billing tables with parameterized inputs', () => {
    const queries = readQueries();
    expect(Object.keys(queries).length).toBeGreaterThan(0);

    for (const [file, sql] of Object.entries(queries)) {
      if (file === 'workspace_names.sql') {
        expect(sql).toContain('system.access.workspaces_latest');
        expect(sql).not.toContain('system.billing.usage');
        continue;
      }

      expect(sql, file).toContain("u.billing_origin_product = 'GENIE'");
      expect(sql, file).toMatch(/:workspace_id|:search_term|:month_count/);
      expect(sql, file).not.toMatch(/\$\{|`\$\{/);
    }
  });

  it('scans system.billing.usage at most once per query', () => {
    const queries = readQueries();
    for (const [file, sql] of Object.entries(queries)) {
      if (file === 'workspace_names.sql') {
        continue;
      }
      expect(sql.match(/FROM system\.billing\.usage/g)?.length ?? 0, file).toBe(1);
    }
  });

  it('filters Genie Agent and Genie Code surfaces and maps display names', () => {
    const queries = readQueries();
    for (const file of ['overview.sql', 'identity_coverage.sql']) {
      expect(queries[file]).toContain("u.usage_metadata.genie.surface IN ('GENIE_AGENTS', 'GENIE_CODE')");
    }
    expect(queries['overview.sql']).toContain("WHEN 'GENIE_AGENTS' THEN 'Genie Agent'");
    expect(queries['overview.sql']).toContain("WHEN 'GENIE_CODE' THEN 'Genie Code'");
    expect(queries['overview.sql']).toContain('GROUPING SETS');
    expect(queries['identity_coverage.sql']).toContain("WHEN 'GENIE_AGENTS' THEN 'Genie Agent'");
  });

  it('joins list prices by SKU and effective window', () => {
    const queries = readQueries();
    for (const file of ['overview.sql', 'workspace_ranking.sql', 'identity_coverage.sql', 'promotion_what_if.sql']) {
      expect(queries[file], file).toContain('u.sku_name = lp.sku_name');
      expect(queries[file], file).toContain('u.usage_end_time >= lp.price_start_time');
      expect(queries[file], file).toContain('lp.price_end_time IS NULL');
      expect(queries[file], file).toContain('u.usage_end_time < lp.price_end_time');
    }
  });

  it('treats GENIE_FREE_USAGE as zero estimated list cost', () => {
    const queries = readQueries();
    for (const file of ['overview.sql', 'workspace_ranking.sql', 'identity_coverage.sql']) {
      expect(queries[file], file).toMatch(/WHEN u\.sku_name = 'GENIE_FREE_USAGE' THEN 0\.0/);
    }
  });

  it('keeps Genie Code allowance account-wide per identified user and month', () => {
    const sql = readQueries()['identity_coverage.sql'] ?? '';
    expect(sql).toContain('greatest(150.0 - COALESCE(account_month_free_dbus, 0.0), 0.0)');
    expect(sql).toContain('OVER (PARTITION BY run_as_identity)');
    expect(sql).toContain('LIMIT 200');
    expect(sql).not.toContain('cmegdemos');
    expect(sql).not.toMatch(/workspace_id STRING = \d+/);
  });

  it('caps ranking and identity result sets', () => {
    expect(readQueries()['workspace_ranking.sql']).toContain('LIMIT 1000');
    expect(readQueries()['identity_coverage.sql']).toContain('LIMIT 200');
  });

  it('does not join workspace metadata in billing queries so missing names cannot drop rows', () => {
    const queries = readQueries();
    for (const file of ['overview.sql', 'workspace_ranking.sql', 'identity_coverage.sql', 'promotion_what_if.sql']) {
      expect(queries[file], file).not.toContain('system.access.workspaces_latest');
    }
  });

  it('uses positive billed Agent usage for promotion proxy rates', () => {
    const sql = readQueries()['promotion_what_if.sql'] ?? '';
    expect(sql).toContain('CAST(u.usage_quantity AS DOUBLE) > 0');
    expect(sql).toContain('CAST(lp.pricing.effective_list.default AS DOUBLE) > 0');
    expect(sql).toMatch(/Service principal/i);
  });
});

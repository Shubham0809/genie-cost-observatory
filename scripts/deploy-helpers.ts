import { readFileSync } from 'node:fs';
import { accountHostFromWorkspaceHost } from '../shared/budgets/account-host';
import { isGenieBudget, type RawBudgetConfiguration } from '../shared/budgets';
import { mergeBudgetViewerGrant } from '../shared/budgets/grants';

const [command, ...args] = process.argv.slice(2);

function readStdinJson(): unknown {
  return JSON.parse(readFileSync(0, 'utf8')) as unknown;
}

if (command === 'account-host') {
  const host = accountHostFromWorkspaceHost(args[0]);
  if (!host) {
    process.exit(1);
  }
  process.stdout.write(`${host}\n`);
  process.exit(0);
}

if (command === 'genie-budget-ids') {
  const raw = readStdinJson() as { budgets?: RawBudgetConfiguration[] } | RawBudgetConfiguration[];
  const budgets = Array.isArray(raw) ? raw : (raw.budgets ?? []);
  for (const budget of budgets) {
    if (isGenieBudget(budget) && budget.budget_configuration_id) {
      process.stdout.write(`${budget.budget_configuration_id}\n`);
    }
  }
  process.exit(0);
}

if (command === 'merge-viewer-grant') {
  const applicationId = args[0];
  if (!applicationId) {
    process.exit(1);
  }
  const raw = readStdinJson() as { grant_rules?: Array<{ role?: string; principals?: string[] }> };
  process.stdout.write(`${JSON.stringify(mergeBudgetViewerGrant(raw.grant_rules ?? [], applicationId))}\n`);
  process.exit(0);
}

process.stderr.write(
  'Usage: deploy-helpers.ts account-host <workspace-host> | genie-budget-ids | merge-viewer-grant <application-id>\n'
);
process.exit(1);

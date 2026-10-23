import { AccountClient } from '@databricks/sdk-experimental';
import { z } from 'zod';
import { accountHostFromWorkspaceHost } from '../shared/budgets/account-host';
import {
  applicableGenieBudgets,
  collectOverridePrincipalIds,
  type BudgetApiErrorResponse,
  type BudgetControlsResponse,
  type PrincipalResolution,
  type RawBudgetConfiguration,
} from '../shared/budgets';

const querySchema = z.object({
  workspace_id: z.string().regex(/^\d+$/, 'workspace_id must be numeric'),
  identity: z.string().trim().min(1).max(512),
  identity_type: z.enum(['Identified user', 'Service principal', 'Unknown']),
});

const accountIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]+$/);
const budgetPageSchema = z.object({
  budgets: z.array(z.object({}).passthrough()).default([]),
  next_page_token: z.string().optional(),
});

const CACHE_TTL_MS = 60_000;
let cachedBudgets: { expiresAt: number; budgets: RawBudgetConfiguration[] } | undefined;
let accountClient: AccountClient | undefined;

export interface BudgetRouteApp {
  get: (path: string, handler: (request: { query: unknown }, response: BudgetRouteResponse) => Promise<void>) => void;
}

interface BudgetRouteResponse {
  status: (code: number) => BudgetRouteResponse;
  json: (body: BudgetControlsResponse | BudgetApiErrorResponse) => void;
  set: (name: string, value: string) => void;
}

class BudgetIntegrationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function parseBudgetControlsQuery(query: unknown) {
  return querySchema.safeParse(query);
}

export function registerBudgetRoutes(app: BudgetRouteApp): void {
  app.get('/api/budget-controls', async (request, response) => {
    const parsed = parseBudgetControlsQuery(request.query);
    if (!parsed.success) {
      response.status(400).json({ code: 'INVALID_BUDGET_QUERY', message: 'Invalid workspace or identity.' });
      return;
    }

    try {
      const client = getAccountClient();
      const budgets = await listBudgets(client);
      const overrideIds = collectOverridePrincipalIds(budgets, parsed.data.workspace_id);
      const identityResolution = await resolvePrincipal(
        client,
        parsed.data.identity,
        parsed.data.identity_type,
        overrideIds
      );
      const body: BudgetControlsResponse = {
        budgets: applicableGenieBudgets(budgets, parsed.data.workspace_id, identityResolution),
        fetchedAt: new Date().toISOString(),
        identityResolution,
      };
      response.set('Cache-Control', 'private, max-age=30');
      response.json(body);
    } catch (error) {
      const integrationError = publicBudgetError(error);
      response.status(integrationError.status).json({
        code: integrationError.code,
        message: integrationError.message,
      });
    }
  });
}

function getAccountClient(): AccountClient {
  if (accountClient) {
    return accountClient;
  }
  const accountId = accountIdSchema.safeParse(process.env.DATABRICKS_ACCOUNT_ID);
  const accountHost =
    parseAccountHost(process.env.DATABRICKS_ACCOUNT_HOST) ??
    parseAccountHost(accountHostFromWorkspaceHost(process.env.DATABRICKS_HOST));
  if (!accountId.success || !accountHost) {
    throw new BudgetIntegrationError(
      503,
      'BUDGET_API_NOT_CONFIGURED',
      'Budget controls are not configured. Redeploy with scripts/deploy.sh so the account ID and host are injected, or pass those bundle variables.'
    );
  }
  if (!process.env.DATABRICKS_CLIENT_ID || !process.env.DATABRICKS_CLIENT_SECRET) {
    throw new BudgetIntegrationError(
      503,
      'BUDGET_API_AUTH_UNAVAILABLE',
      'The app service principal credentials are unavailable for the Budget API.'
    );
  }
  accountClient = new AccountClient({
    host: accountHost,
    accountId: accountId.data,
    clientId: process.env.DATABRICKS_CLIENT_ID,
    clientSecret: process.env.DATABRICKS_CLIENT_SECRET,
    authType: 'oauth-m2m',
  });
  return accountClient;
}

async function listBudgets(client: AccountClient): Promise<RawBudgetConfiguration[]> {
  if (cachedBudgets && cachedBudgets.expiresAt > Date.now()) {
    return cachedBudgets.budgets;
  }
  const budgets: RawBudgetConfiguration[] = [];
  let pageToken: string | undefined;

  do {
    const headers = new Headers({ Accept: 'application/json' });
    await client.config.authenticate(headers);
    const host = await client.config.getHost();
    const accountId = client.config.accountId;
    if (!accountId) {
      throw new BudgetIntegrationError(503, 'BUDGET_API_NOT_CONFIGURED', 'The Databricks account ID is missing.');
    }
    const url = new URL(`/api/2.1/accounts/${encodeURIComponent(accountId)}/budgets`, host);
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }
    const apiResponse = await client.config.fetch(url.toString(), { method: 'GET', headers });
    if (!apiResponse.ok) {
      throw budgetHttpError(apiResponse.status);
    }
    const page = budgetPageSchema.parse(parseBudgetJson(await apiResponse.text()));
    budgets.push(...(page.budgets as RawBudgetConfiguration[]));
    pageToken = page.next_page_token;
  } while (pageToken);

  cachedBudgets = { expiresAt: Date.now() + CACHE_TTL_MS, budgets };
  return budgets;
}

async function resolvePrincipal(
  client: AccountClient,
  identity: string,
  identityType: 'Identified user' | 'Service principal' | 'Unknown',
  overrideIds: string[]
): Promise<PrincipalResolution> {
  if (overrideIds.length === 0) {
    return { status: 'not-required' };
  }
  if (identityType === 'Unknown') {
    return {
      status: 'unavailable',
      message: 'Budget overrides cannot be resolved for an unknown billing identity.',
    };
  }

  try {
    const principalId =
      identityType === 'Service principal'
        ? await findServicePrincipalId(client, identity)
        : await findUserId(client, identity);
    if (!principalId) {
      return {
        status: 'unavailable',
        message: 'The billing identity was not found in the account identity directory.',
      };
    }
    const groupIds = await findMatchingOverrideGroups(client, principalId, overrideIds);
    return { status: 'resolved', principalId, groupIds };
  } catch {
    return {
      status: 'unavailable',
      message: 'Per-user overrides could not be resolved with the app service principal permissions.',
    };
  }
}

async function findUserId(client: AccountClient, userName: string): Promise<string | undefined> {
  for await (const user of client.accountUsersV2.list({
    filter: `userName eq "${escapeScimValue(userName)}"`,
    attributes: 'id,userName',
    count: 2,
  })) {
    if (user.userName?.toLowerCase() === userName.toLowerCase()) {
      return user.id;
    }
  }
  return undefined;
}

async function findServicePrincipalId(client: AccountClient, applicationId: string): Promise<string | undefined> {
  for await (const principal of client.accountServicePrincipalsV2.list({
    filter: `applicationId eq "${escapeScimValue(applicationId)}"`,
    attributes: 'id,applicationId',
    count: 2,
  })) {
    if (principal.applicationId?.toLowerCase() === applicationId.toLowerCase()) {
      return principal.id;
    }
  }
  return undefined;
}

async function findMatchingOverrideGroups(
  client: AccountClient,
  principalId: string,
  overrideIds: string[]
): Promise<string[]> {
  const matching: string[] = [];
  for (const overrideId of overrideIds) {
    if (overrideId === principalId) {
      continue;
    }
    try {
      const group = await client.accountGroupsV2.get({ id: overrideId });
      if ((group.members ?? []).some((member) => member.value === principalId)) {
        matching.push(overrideId);
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }
  return matching;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode?: unknown }).statusCode === 404
  );
}

function parseBudgetJson(value: string): unknown {
  const withStringPrincipalIds = value.replace(/("principal_id"\s*:\s*)(-?\d+)/g, '$1"$2"');
  return JSON.parse(withStringPrincipalIds) as unknown;
}

function parseAccountHost(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return undefined;
    }
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

function escapeScimValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function budgetHttpError(status: number): BudgetIntegrationError {
  if (status === 401 || status === 403) {
    return new BudgetIntegrationError(
      403,
      'BUDGET_API_PERMISSION_DENIED',
      'The app service principal needs Budget Viewer access on the relevant Genie budgets.'
    );
  }
  return new BudgetIntegrationError(502, 'BUDGET_API_UNAVAILABLE', 'The Databricks Budget API is unavailable.');
}

function publicBudgetError(error: unknown): BudgetIntegrationError {
  if (error instanceof BudgetIntegrationError) {
    return error;
  }
  return new BudgetIntegrationError(502, 'BUDGET_API_UNAVAILABLE', 'Budget controls could not be loaded.');
}

export const budgetApiTestHelpers = {
  parseBudgetJson,
  parseAccountHost,
  accountHostFromWorkspaceHost,
  budgetHttpError,
  publicBudgetError,
};

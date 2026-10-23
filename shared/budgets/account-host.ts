export function accountHostFromWorkspaceHost(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) {
      return undefined;
    }
    const host = url.hostname.toLowerCase();
    const accountHost = accountHostname(host);
    if (!accountHost) {
      return undefined;
    }
    return `https://${accountHost}/`;
  } catch {
    return undefined;
  }
}

function accountHostname(host: string): string | undefined {
  if (host.startsWith('accounts.')) {
    return host;
  }
  if (host.endsWith('.azuredatabricks.net')) {
    return 'accounts.azuredatabricks.net';
  }
  if (host.endsWith('.azuredatabricks.us')) {
    return 'accounts.azuredatabricks.us';
  }
  if (host.endsWith('.azuredatabricks.cn')) {
    return 'accounts.azuredatabricks.cn';
  }
  if (host.endsWith('.gcp.databricks.com')) {
    return 'accounts.gcp.databricks.com';
  }
  if (host.endsWith('.cloud.databricks.us')) {
    return 'accounts.cloud.databricks.us';
  }
  if (host.endsWith('.cloud.databricks.com')) {
    return 'accounts.cloud.databricks.com';
  }
  return undefined;
}

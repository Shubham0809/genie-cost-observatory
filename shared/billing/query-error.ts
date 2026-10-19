const SENSITIVE_PATTERN =
  /token|secret|password|credential|authorization|bearer|dapi[a-z0-9]|DATABRICKS_CLIENT|BEGIN (RSA |OPENSSH )?PRIVATE/i;

function errorText(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '';
}

export function publicQueryError(error: unknown, fallback = 'Billing data is unavailable.'): string {
  const text = errorText(error);
  if (!text.trim()) {
    return fallback;
  }
  if (SENSITIVE_PATTERN.test(text)) {
    return 'Billing data is unavailable. Check warehouse and system-table permissions.';
  }
  return text;
}

export function isMissingWorkspaceMetadataError(error: unknown): boolean {
  return /workspaces_latest|PERMISSION_DENIED|TABLE_OR_VIEW_NOT_FOUND|insufficient_permissions/i.test(errorText(error));
}

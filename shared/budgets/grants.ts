export interface BudgetGrantRule {
  role: string;
  principals: string[];
}

export function servicePrincipalBudgetPrincipal(applicationId: string): string {
  return `servicePrincipals/${applicationId}`;
}

export function mergeBudgetViewerGrant(
  grantRules: Array<{ role?: string; principals?: string[] }>,
  applicationId: string
): BudgetGrantRule[] {
  const principal = servicePrincipalBudgetPrincipal(applicationId);
  const merged: BudgetGrantRule[] = grantRules
    .filter((rule) => typeof rule.role === 'string' && rule.role.length > 0)
    .map((rule) => ({
      role: rule.role as string,
      principals: [...(rule.principals ?? [])],
    }));

  const viewer = merged.find((rule) => rule.role === 'roles/budget.viewer');
  if (viewer) {
    if (!viewer.principals.includes(principal)) {
      viewer.principals.push(principal);
    }
    return merged;
  }

  merged.push({ role: 'roles/budget.viewer', principals: [principal] });
  return merged;
}

export function budgetViewerGrantPresent(
  grantRules: Array<{ role?: string; principals?: string[] }>,
  applicationId: string
): boolean {
  const principal = servicePrincipalBudgetPrincipal(applicationId);
  return grantRules.some((rule) => rule.role === 'roles/budget.viewer' && (rule.principals ?? []).includes(principal));
}

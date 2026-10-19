import {
  GENIE_AGENT_PRODUCT,
  GENIE_AGENT_PROMOTION_END_DATE,
  GENIE_CODE_FREE_DBU_ALLOWANCE,
  GENIE_CODE_PRODUCT,
  IDENTITY_TYPE,
  SERVICE_PRINCIPAL_ID_PATTERN,
} from './constants';

export type IdentityType = (typeof IDENTITY_TYPE)[keyof typeof IDENTITY_TYPE];

export interface CoverageInput {
  product: string;
  identityType: IdentityType;
  workspaceFreeDbus: number;
  accountMonthFreeDbus: number;
  billedDbus: number;
  currentEstimatedCost: number;
  asOfDate?: Date;
}

export interface CoverageResult {
  freeTierLimitDbus: number | null;
  remainingGenieCodeAllowanceDbus: number | null;
  billedOrOverageDbus: number;
  estimatedCostAfterFreeCoverage: number;
  coverageBasis: string;
}

export function classifyIdentity(runAs: string | null | undefined): IdentityType {
  if (!runAs) {
    return IDENTITY_TYPE.unknown;
  }
  if (SERVICE_PRINCIPAL_ID_PATTERN.test(runAs)) {
    return IDENTITY_TYPE.servicePrincipal;
  }
  return IDENTITY_TYPE.identifiedUser;
}

export function remainingGenieCodeAllowance(accountMonthFreeDbus: number): number {
  return Math.max(GENIE_CODE_FREE_DBU_ALLOWANCE - accountMonthFreeDbus, 0);
}

function isAgentPromotionActive(asOfDate: Date): boolean {
  return asOfDate <= new Date(`${GENIE_AGENT_PROMOTION_END_DATE}T23:59:59Z`);
}

export function coverageForIdentityProduct(input: CoverageInput): CoverageResult {
  const asOfDate = input.asOfDate ?? new Date();
  const billedOrOverageDbus = input.billedDbus;
  const estimatedCostAfterFreeCoverage = input.currentEstimatedCost;

  if (input.product === GENIE_CODE_PRODUCT && input.identityType === IDENTITY_TYPE.identifiedUser) {
    return {
      freeTierLimitDbus: GENIE_CODE_FREE_DBU_ALLOWANCE,
      remainingGenieCodeAllowanceDbus: remainingGenieCodeAllowance(input.accountMonthFreeDbus),
      billedOrOverageDbus,
      estimatedCostAfterFreeCoverage,
      coverageBasis:
        '150 free DBUs per identified user each calendar month, calculated from account-wide Genie Code free usage',
    };
  }

  if (input.product === GENIE_CODE_PRODUCT) {
    return {
      freeTierLimitDbus: null,
      remainingGenieCodeAllowanceDbus: null,
      billedOrOverageDbus,
      estimatedCostAfterFreeCoverage,
      coverageBasis: 'Service-principal or unidentified usage is billed',
    };
  }

  if (input.product === GENIE_AGENT_PRODUCT && input.identityType === IDENTITY_TYPE.identifiedUser) {
    return {
      freeTierLimitDbus: null,
      remainingGenieCodeAllowanceDbus: null,
      billedOrOverageDbus,
      estimatedCostAfterFreeCoverage,
      coverageBasis: isAgentPromotionActive(asOfDate)
        ? 'Identified-user promotional coverage through 2027-01-31'
        : 'Promotional period ended 2027-01-31 or identity is unknown',
    };
  }

  if (input.product === GENIE_AGENT_PRODUCT && input.identityType === IDENTITY_TYPE.servicePrincipal) {
    return {
      freeTierLimitDbus: null,
      remainingGenieCodeAllowanceDbus: null,
      billedOrOverageDbus,
      estimatedCostAfterFreeCoverage,
      coverageBasis: 'Service-principal usage is billed',
    };
  }

  return {
    freeTierLimitDbus: null,
    remainingGenieCodeAllowanceDbus: null,
    billedOrOverageDbus,
    estimatedCostAfterFreeCoverage,
    coverageBasis: 'Promotional period ended 2027-01-31 or identity is unknown',
  };
}

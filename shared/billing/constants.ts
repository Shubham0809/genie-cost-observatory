export const ALL_WORKSPACES = '__ALL__';
export const NONE_WORKSPACE = '__NONE__';

export const GENIE_ORIGIN_PRODUCT = 'GENIE';
export const GENIE_AGENT_SURFACE = 'GENIE_AGENTS';
export const GENIE_CODE_SURFACE = 'GENIE_CODE';
export const GENIE_SURFACES = [GENIE_AGENT_SURFACE, GENIE_CODE_SURFACE] as const;

export const FREE_USAGE_SKU = 'GENIE_FREE_USAGE';

export const GENIE_AGENT_PRODUCT = 'Genie Agent';
export const GENIE_CODE_PRODUCT = 'Genie Code';

export const GENIE_CODE_FREE_DBU_ALLOWANCE = 150;
export const GENIE_AGENT_PROMOTION_END_DATE = '2027-01-31';

export const MIN_MONTH_COUNT = 3;
export const MAX_MONTH_COUNT = 24;
export const DEFAULT_MONTH_COUNT = 6;
export const WORKSPACE_RESULT_LIMIT = 1000;
export const IDENTITY_RESULT_LIMIT = 200;
export const WORKSPACE_PAGE_SIZE = 20;
export const IDENTITY_PAGE_SIZE = 20;
export const WORKSPACE_CHART_LIMIT = 12;
export const SEARCH_TERM_MAX_LENGTH = 200;

export const PRODUCT_DISPLAY_NAMES = {
  [GENIE_AGENT_SURFACE]: GENIE_AGENT_PRODUCT,
  [GENIE_CODE_SURFACE]: GENIE_CODE_PRODUCT,
} as const;

export const IDENTITY_TYPE = {
  identifiedUser: 'Identified user',
  servicePrincipal: 'Service principal',
  unknown: 'Unknown',
} as const;

export const SERVICE_PRINCIPAL_ID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

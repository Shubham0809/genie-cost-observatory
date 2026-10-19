import {
  GENIE_AGENT_PRODUCT,
  GENIE_AGENT_SURFACE,
  GENIE_CODE_PRODUCT,
  GENIE_CODE_SURFACE,
  PRODUCT_DISPLAY_NAMES,
} from './constants';

export function productDisplayName(surface: string | null | undefined): string | null {
  if (surface === GENIE_AGENT_SURFACE) {
    return GENIE_AGENT_PRODUCT;
  }
  if (surface === GENIE_CODE_SURFACE) {
    return GENIE_CODE_PRODUCT;
  }
  return null;
}

export function isGenieSurface(surface: string | null | undefined): boolean {
  return surface === GENIE_AGENT_SURFACE || surface === GENIE_CODE_SURFACE;
}

export function knownProductNames(): string[] {
  return Object.values(PRODUCT_DISPLAY_NAMES);
}

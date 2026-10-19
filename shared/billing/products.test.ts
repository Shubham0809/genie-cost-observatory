import { describe, expect, it } from 'vitest';
import { GENIE_AGENT_PRODUCT, GENIE_CODE_PRODUCT } from './constants';
import { isGenieSurface, productDisplayName } from './products';

describe('product name mapping', () => {
  it('maps GENIE_AGENTS to Genie Agent', () => {
    expect(productDisplayName('GENIE_AGENTS')).toBe(GENIE_AGENT_PRODUCT);
  });

  it('maps GENIE_CODE to Genie Code', () => {
    expect(productDisplayName('GENIE_CODE')).toBe(GENIE_CODE_PRODUCT);
  });

  it('ignores unknown surfaces', () => {
    expect(productDisplayName('SQL')).toBeNull();
    expect(isGenieSurface('JOBS')).toBe(false);
    expect(isGenieSurface('GENIE_AGENTS')).toBe(true);
  });
});

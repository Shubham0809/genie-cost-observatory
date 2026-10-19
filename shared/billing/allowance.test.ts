import { describe, expect, it } from 'vitest';
import { classifyIdentity, coverageForIdentityProduct, remainingGenieCodeAllowance } from './allowance';
import { GENIE_AGENT_PRODUCT, GENIE_CODE_PRODUCT, IDENTITY_TYPE } from './constants';

describe('Genie Code 150-DBU allowance per user and month', () => {
  it('calculates remaining allowance from account-wide free DBUs', () => {
    expect(remainingGenieCodeAllowance(40)).toBe(110);
    expect(remainingGenieCodeAllowance(150)).toBe(0);
    expect(remainingGenieCodeAllowance(180)).toBe(0);
  });

  it('does not treat workspace-only free DBUs as the allowance basis', () => {
    const coverage = coverageForIdentityProduct({
      product: GENIE_CODE_PRODUCT,
      identityType: IDENTITY_TYPE.identifiedUser,
      workspaceFreeDbus: 10,
      accountMonthFreeDbus: 90,
      billedDbus: 5,
      currentEstimatedCost: 1.1,
    });
    expect(coverage.freeTierLimitDbus).toBe(150);
    expect(coverage.remainingGenieCodeAllowanceDbus).toBe(60);
    expect(coverage.remainingGenieCodeAllowanceDbus).not.toBe(140);
  });

  it('does not apply the Genie Code allowance to Genie Agents', () => {
    const coverage = coverageForIdentityProduct({
      product: GENIE_AGENT_PRODUCT,
      identityType: IDENTITY_TYPE.identifiedUser,
      workspaceFreeDbus: 80,
      accountMonthFreeDbus: 80,
      billedDbus: 0,
      currentEstimatedCost: 0,
      asOfDate: new Date('2026-10-15T00:00:00Z'),
    });
    expect(coverage.freeTierLimitDbus).toBeNull();
    expect(coverage.remainingGenieCodeAllowanceDbus).toBeNull();
    expect(coverage.coverageBasis).toContain('promotional coverage');
  });
});

describe('Genie Agent promotional and service-principal billing', () => {
  it('classifies UUID run-as identities as service principals', () => {
    expect(classifyIdentity('3f1a9c2e-1111-4aaa-8bbb-1234567890ab')).toBe(IDENTITY_TYPE.servicePrincipal);
    expect(classifyIdentity('analyst@example.com')).toBe(IDENTITY_TYPE.identifiedUser);
    expect(classifyIdentity(null)).toBe(IDENTITY_TYPE.unknown);
  });

  it('marks service-principal Agent usage as billed', () => {
    const coverage = coverageForIdentityProduct({
      product: GENIE_AGENT_PRODUCT,
      identityType: IDENTITY_TYPE.servicePrincipal,
      workspaceFreeDbus: 0,
      accountMonthFreeDbus: 0,
      billedDbus: 12,
      currentEstimatedCost: 2.4,
      asOfDate: new Date('2026-10-15T00:00:00Z'),
    });
    expect(coverage.coverageBasis).toBe('Service-principal usage is billed');
    expect(coverage.estimatedCostAfterFreeCoverage).toBe(2.4);
  });

  it('ends identified-user Agent promotion after 2027-01-31', () => {
    const coverage = coverageForIdentityProduct({
      product: GENIE_AGENT_PRODUCT,
      identityType: IDENTITY_TYPE.identifiedUser,
      workspaceFreeDbus: 20,
      accountMonthFreeDbus: 20,
      billedDbus: 0,
      currentEstimatedCost: 0,
      asOfDate: new Date('2027-02-01T00:00:00Z'),
    });
    expect(coverage.coverageBasis).toContain('ended 2027-01-31');
  });
});

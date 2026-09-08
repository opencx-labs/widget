import { describe, expect, it } from 'vitest';
import { resolveClientPresentation } from '../../context/resolve-client-presentation';

describe('client activity limits', () => {
  it.each([
    ['hidden', 'hidden', 'hidden'],
    ['hidden', 'status', 'hidden'],
    ['hidden', 'details', 'hidden'],
    ['status', 'hidden', 'hidden'],
    ['status', 'status', 'status'],
    ['status', 'details', 'status'],
    ['details', 'hidden', 'hidden'],
    ['details', 'status', 'status'],
    ['details', 'details', 'details'],
  ] as const)('org %s and embed %s show %s', (org, client, expected) => {
    expect(
      resolveClientPresentation(
        { streaming: true, toolActivity: org, reasoning: true },
        { toolActivity: client },
      ),
    ).toEqual({ toolActivity: expected, reasoning: true });
  });

  it('inherits the org and allows reasoning to be hidden independently', () => {
    const org = {
      streaming: false,
      toolActivity: 'details',
      reasoning: true,
    } as const;
    expect(resolveClientPresentation(org, undefined)).toEqual({
      toolActivity: 'details',
      reasoning: true,
    });
    expect(resolveClientPresentation(org, { reasoning: false })).toEqual({
      toolActivity: 'details',
      reasoning: false,
    });
    expect(
      resolveClientPresentation(
        { ...org, reasoning: false },
        { reasoning: true },
      ),
    ).toEqual({
      toolActivity: 'details',
      reasoning: false,
    });
  });

  it('preserves explicit client limits and omission with older backends', () => {
    const client = { toolActivity: 'status', reasoning: false } as const;
    expect(resolveClientPresentation(undefined, client)).toBe(client);
    expect(resolveClientPresentation(undefined, undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { approvals, invites, relationships } from '@/lib/api';

describe('api client contract', () => {
  it('exposes backward-compatible invite, approval, and relationship methods', () => {
    expect(invites.send).toBeTypeOf('function');
    expect(invites.accept).toBeTypeOf('function');
    expect(invites.reject).toBeTypeOf('function');
    expect(invites.withdraw).toBeTypeOf('function');

    expect(approvals.approve).toBeTypeOf('function');
    expect(approvals.reject).toBeTypeOf('function');

    expect(relationships.get).toBeTypeOf('function');
    expect(relationships.detail).toBeTypeOf('function');
  });
});

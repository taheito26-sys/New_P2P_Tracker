import { describe, expect, it } from 'vitest';
import { approvals, invites, relationships } from '@/lib/api';

describe('api client contract', () => {
  it('exposes invite methods used by the UI', () => {
    expect(typeof invites.send).toBe('function');
    expect(typeof invites.create).toBe('function');
    expect(typeof invites.accept).toBe('function');
    expect(typeof invites.reject).toBe('function');
    expect(typeof invites.withdraw).toBe('function');
    expect(typeof invites.respond).toBe('function');
  });

  it('exposes approval methods used by the UI', () => {
    expect(typeof approvals.review).toBe('function');
    expect(typeof approvals.approve).toBe('function');
    expect(typeof approvals.reject).toBe('function');
  });

  it('exposes relationship aliases used by pages', () => {
    expect(typeof relationships.detail).toBe('function');
    expect(typeof relationships.get).toBe('function');
  });
});

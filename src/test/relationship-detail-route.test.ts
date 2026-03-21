import { describe, expect, it } from 'vitest';
import worker from '../../server/index';

function createDbMock() {
  return {
    prepare(query: string) {
      const trimmed = query.trim();
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (trimmed.includes('FROM sessions')) {
                return { id: args[0], user_id: 'user_1', expires_at: '2999-01-01T00:00:00Z' };
              }
              if (trimmed.includes('FROM merchant_profiles WHERE user_id = ?')) {
                return { user_id: 'user_1', merchant_id: 'merchant_me', display_name: 'Me', nickname: 'me' };
              }
              if (trimmed.includes('SELECT * FROM merchant_relationships WHERE id = ?')) {
                return { id: 'rel_forbidden', merchant_a_id: 'merchant_a', merchant_b_id: 'merchant_b', shared_fields: '[]', approval_policy: '{}', created_at: '2026-01-01', updated_at: '2026-01-01', invite_id: 'inv_1', relationship_type: 'general', status: 'active' };
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

describe('relationship detail route', () => {
  it('returns 403 for inaccessible relationship', async () => {
    const token = 'plain-session-token';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const res = await worker.fetch(new Request('https://example.com/api/merchant/relationships/rel_forbidden', {
      headers: { Cookie: `__Host-session=${token}` },
    }) as any, {
      DB: createDbMock() as any,
      P2P_KV: {} as any,
      APP_ENV: 'test',
      ALLOWED_ORIGINS: '*',
      AUTH_SOURCE: 'test',
      P2P_LIVE_PROVIDER_URL: '',
    } as any, {} as any);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Relationship access denied' });
    expect(tokenHash).toHaveLength(64);
  });
});

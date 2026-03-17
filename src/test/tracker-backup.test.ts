import { describe, expect, it } from 'vitest';
import { clearTrackerStorage, listTrackerKeysToClear, normalizeImportedTrackerState } from '@/lib/tracker-backup';

function createStorage(seed: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

describe('normalizeImportedTrackerState', () => {
  const state = { trades: [], batches: [], customers: [] };

  it('accepts plain tracker state', () => {
    expect(normalizeImportedTrackerState(state)).toEqual(state);
  });

  it('extracts nested state wrapper formats', () => {
    expect(normalizeImportedTrackerState({ state })).toEqual(state);
    expect(normalizeImportedTrackerState({ data: { state } })).toEqual(state);
    expect(normalizeImportedTrackerState({ payload: state })).toEqual(state);
  });

  it('extracts from snapshot arrays used by vault exports', () => {
    expect(normalizeImportedTrackerState({ snapshots: [{ state }] })).toEqual(state);
  });

  it('extracts from version arrays used by cloud backups', () => {
    expect(normalizeImportedTrackerState({ versions: [{ content: { state } }] })).toEqual(state);
  });

  it('throws on unsupported formats', () => {
    expect(() => normalizeImportedTrackerState({ hello: 'world' })).toThrow('Invalid backup format');
  });

  it('lists only tracker-related keys for clear-all', () => {
    const storage = createStorage({
      tracker_state: '{}',
      tracker_settings: '{}',
      gas_url: 'https://x',
      taheito_anything: '1',
      merchant_cache: 'keep',
    });

    const keys = listTrackerKeysToClear(storage);
    expect(keys).toContain('tracker_state');
    expect(keys).toContain('tracker_settings');
    expect(keys).toContain('gas_url');
    expect(keys).toContain('taheito_anything');
    expect(keys).not.toContain('merchant_cache');
  });

  it('clears tracker keys and preserves non-tracker keys', () => {
    const storage = createStorage({
      tracker_state: '{}',
      tracker_logs: '[]',
      p2p_tracker_custom: '1',
      merchant_cache: 'keep',
    });

    clearTrackerStorage(storage);
    expect(storage.getItem('tracker_state')).toBeNull();
    expect(storage.getItem('tracker_logs')).toBeNull();
    expect(storage.getItem('p2p_tracker_custom')).toBeNull();
    expect(storage.getItem('merchant_cache')).toBe('keep');
  });
});

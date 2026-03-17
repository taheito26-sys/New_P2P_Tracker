import { describe, expect, it } from 'vitest';
import { normalizeImportedTrackerState } from '@/lib/tracker-backup';

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
});

/**
 * Unit tests for lib/merge.js — G-Set CRDT merge logic.
 */
import { describe, it, expect } from 'vitest';

const { mergeWordSets } = await import('../../lib/merge.js');

function word(en, overrides = {}) {
  return { en, known: false, clicked_known: 0, seen: 0, tier: 1, gender: undefined, ...overrides };
}

describe('union behavior', () => {
  it('includes words only in local', () => {
    const local = [word('house')];
    const remote = [];
    const merged = mergeWordSets(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].en).toBe('house');
  });

  it('includes words only in remote', () => {
    const local = [];
    const remote = [word('time')];
    const merged = mergeWordSets(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].en).toBe('time');
  });

  it('deduplicates words in both sets', () => {
    const local = [word('house')];
    const remote = [word('house')];
    const merged = mergeWordSets(local, remote);
    expect(merged).toHaveLength(1);
  });

  it('handles both empty', () => {
    expect(mergeWordSets([], [])).toEqual([]);
  });

  it('merges multiple words from both sides', () => {
    const local = [word('house'), word('time')];
    const remote = [word('time'), word('water')];
    const merged = mergeWordSets(local, remote);
    const words = merged.map((r) => r.en).sort();
    expect(words).toEqual(['house', 'time', 'water']);
  });
});

describe('known (OR)', () => {
  it('false + true = true', () => {
    const local = [word('house', { known: false })];
    const remote = [word('house', { known: true })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].known).toBe(true);
  });

  it('true + false = true', () => {
    const local = [word('house', { known: true })];
    const remote = [word('house', { known: false })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].known).toBe(true);
  });

  it('false + false = false', () => {
    const local = [word('house', { known: false })];
    const remote = [word('house', { known: false })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].known).toBe(false);
  });

  it('true + true = true', () => {
    const local = [word('house', { known: true })];
    const remote = [word('house', { known: true })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].known).toBe(true);
  });
});

describe('seen (max)', () => {
  it('takes the higher count', () => {
    const local = [word('house', { seen: 3 })];
    const remote = [word('house', { seen: 7 })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].seen).toBe(7);
  });

  it('works when local is higher', () => {
    const local = [word('house', { seen: 10 })];
    const remote = [word('house', { seen: 2 })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].seen).toBe(10);
  });

  it('handles equal values', () => {
    const local = [word('house', { seen: 5 })];
    const remote = [word('house', { seen: 5 })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].seen).toBe(5);
  });
});

describe('clicked_known (max)', () => {
  it('takes the higher count', () => {
    const local = [word('house', { clicked_known: 1 })];
    const remote = [word('house', { clicked_known: 3 })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].clicked_known).toBe(3);
  });
});

describe('tier (min)', () => {
  it('takes the lower tier', () => {
    const local = [word('house', { tier: 2 })];
    const remote = [word('house', { tier: 1 })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].tier).toBe(1);
  });

  it('works when local is lower', () => {
    const local = [word('house', { tier: 1 })];
    const remote = [word('house', { tier: 3 })];
    const merged = mergeWordSets(local, remote);
    expect(merged[0].tier).toBe(1);
  });
});

describe('commutativity', () => {
  it('merge(a, b) equals merge(b, a) for field values', () => {
    const a = [word('house', { known: true, seen: 3, clicked_known: 1, tier: 2 })];
    const b = [word('house', { known: false, seen: 7, clicked_known: 3, tier: 1 })];
    const ab = mergeWordSets(a, b);
    const ba = mergeWordSets(b, a);
    expect(ab[0].known).toBe(ba[0].known);
    expect(ab[0].seen).toBe(ba[0].seen);
    expect(ab[0].clicked_known).toBe(ba[0].clicked_known);
    expect(ab[0].tier).toBe(ba[0].tier);
  });
});

describe('idempotency', () => {
  it('merge(a, a) equals a', () => {
    const a = [
      word('house', { known: true, seen: 5, clicked_known: 2, tier: 1 }),
      word('time', { known: false, seen: 10, clicked_known: 0, tier: 2 }),
    ];
    const merged = mergeWordSets(a, a);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.en === 'house')).toEqual(a[0]);
    expect(merged.find((r) => r.en === 'time')).toEqual(a[1]);
  });
});

import { describe, expect, it } from 'vitest';
import { distributeBySize, distributeEvenly } from './teams';

describe('balanced group distribution', () => {
  it('keeps non-divisible groups balanced', () => {
    const groups = distributeEvenly(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 3);
    expect(groups.map((group) => group.length).sort()).toEqual([2, 2, 3]);
    expect(groups.flat().sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('supports one person and size-based distribution', () => {
    expect(distributeEvenly(['Solo'], 1)).toEqual([['Solo']]);
    const groups = distributeBySize(['A', 'B', 'C', 'D', 'E'], 2);
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.length <= 2)).toBe(true);
  });

  it('rejects impossible group counts', () => {
    expect(() => distributeEvenly(['A'], 2)).toThrow(RangeError);
    expect(() => distributeEvenly([], 1)).toThrow(RangeError);
    expect(() => distributeBySize(['A'], 0)).toThrow(RangeError);
  });
});

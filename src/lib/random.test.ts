import { describe, expect, it } from 'vitest';
import { pickMultiple, randomFloat, randomInteger, randomItem, shuffle, weightedRandom } from './random';

describe('random engine', () => {
  it('keeps random floats in [0, 1)', () => {
    for (let index = 0; index < 2_000; index += 1) {
      const value = randomFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('includes both integer bounds without leaving the interval', () => {
    const seen = new Set<number>();
    for (let index = 0; index < 5_000; index += 1) {
      const value = randomInteger(-2, 2);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([-2, -1, 0, 1, 2]));
    expect(randomInteger(7, 7)).toBe(7);
  });

  it('rejects invalid and oversized bounds', () => {
    expect(() => randomInteger(2, 1)).toThrow(RangeError);
    expect(() => randomInteger(0.1, 2)).toThrow(RangeError);
    expect(() => randomInteger(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  it('picks from immutable arrays', () => {
    const source = Object.freeze(['Alice', 'Zoé', '🎉']);
    expect(source).toContain(randomItem(source));
    const result = shuffle(source);
    expect(result).toHaveLength(source.length);
    expect(result).toEqual(expect.arrayContaining([...source]));
    expect(source).toEqual(['Alice', 'Zoé', '🎉']);
  });

  it('picks distinct elements without mutating the source', () => {
    const source = Array.from({ length: 100 }, (_, index) => index);
    const picked = pickMultiple(source, 25);
    expect(picked).toHaveLength(25);
    expect(new Set(picked)).toHaveLength(25);
    expect(source[0]).toBe(0);
    expect(() => pickMultiple(source, 101)).toThrow(RangeError);
  });

  it('supports weighted items and rejects invalid weights', () => {
    expect(weightedRandom([{ value: 'only', weight: 1 }])).toBe('only');
    expect(() => weightedRandom([{ value: 'none', weight: 0 }])).toThrow(RangeError);
    expect(() => weightedRandom([{ value: 'bad', weight: -1 }])).toThrow(RangeError);
    expect(() => randomItem([])).toThrow(RangeError);
  });
});

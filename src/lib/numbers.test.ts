import { describe, expect, it } from 'vitest';
import { generateNumbers } from './numbers';

describe('random numbers', () => {
  it('handles equal bounds', () => {
    expect(generateNumbers({ min: 7, max: 7, count: 3 })).toEqual([7, 7, 7]);
  });

  it('generates unique and sorted values', () => {
    const values = generateNumbers({ min: -100, max: 100, count: 50, unique: true, sorted: true });
    expect(values).toHaveLength(50);
    expect(new Set(values)).toHaveLength(50);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('rejects reversed, oversized and impossible requests', () => {
    expect(() => generateNumbers({ min: 10, max: 1, count: 1 })).toThrow(RangeError);
    expect(() => generateNumbers({ min: 1, max: 2, count: 3, unique: true })).toThrow(RangeError);
    expect(() => generateNumbers({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, count: 1 })).toThrow(RangeError);
  });
});

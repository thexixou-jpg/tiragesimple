import { describe, expect, it } from 'vitest';
import { drawItems } from './draw';

describe('draw items', () => {
  it('draws unique items without replacement', () => {
    const source = ['A', 'B', 'C', 'D'];
    const result = drawItems(source, 3);
    expect(result).toHaveLength(3);
    expect(new Set(result)).toHaveLength(3);
    expect(source).toEqual(['A', 'B', 'C', 'D']);
  });

  it('can draw repeatedly with replacement', () => {
    expect(drawItems(['Unique'], 4, false)).toEqual(['Unique', 'Unique', 'Unique', 'Unique']);
  });

  it('rejects invalid requests', () => {
    expect(() => drawItems([], 1)).toThrow(RangeError);
    expect(() => drawItems(['A'], 2)).toThrow(RangeError);
    expect(() => drawItems(['A'], 0)).toThrow(RangeError);
  });
});

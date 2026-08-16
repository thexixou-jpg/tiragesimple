import { describe, expect, it } from 'vitest';
import { formatCount, parseList, removeFirst, serializeList } from './lists';

describe('list utilities', () => {
  it('normalizes empty lines, spaces and tabular pastes', () => {
    expect(parseList('  Alice  \r\n\nZoé\t🎉\n  ')).toEqual(['Alice', 'Zoé', '🎉']);
  });

  it('preserves or removes exact duplicates on demand', () => {
    expect(parseList('Alice\nAlice\nalice')).toEqual(['Alice', 'Alice', 'alice']);
    expect(parseList('Alice\nAlice\nalice', { removeDuplicates: true })).toEqual(['Alice', 'alice']);
  });

  it('handles 2,000 entries and optional limits', () => {
    const input = Array.from({ length: 2_000 }, (_, index) => `Nom ${index}`).join('\n');
    expect(parseList(input)).toHaveLength(2_000);
    expect(parseList(input, { limit: 100 })).toHaveLength(100);
  });

  it('serializes, removes one occurrence and formats counts', () => {
    expect(serializeList(['A', 'B'])).toBe('A\nB');
    expect(removeFirst(['A', 'B', 'A'], 'A')).toEqual(['B', 'A']);
    expect(formatCount(1)).toBe('1 élément');
    expect(formatCount(2)).toBe('2 éléments');
  });
});

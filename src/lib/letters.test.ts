import { describe, expect, it } from 'vitest';
import { ACCENTED_LETTERS, BASIC_LETTERS, generateLetters } from './letters';

describe('random letters', () => {
  it('uses A-Z by default', () => {
    expect(generateLetters(100).every((letter) => BASIC_LETTERS.includes(letter))).toBe(true);
  });
  it('supports unique accented letters', () => {
    const values = generateLetters(BASIC_LETTERS.length + ACCENTED_LETTERS.length, true, true);
    expect(new Set(values)).toHaveLength(values.length);
    expect(values.some((letter) => ACCENTED_LETTERS.includes(letter))).toBe(true);
  });
  it('rejects impossible unique quantities', () => {
    expect(() => generateLetters(27, false, true)).toThrow(RangeError);
  });
});

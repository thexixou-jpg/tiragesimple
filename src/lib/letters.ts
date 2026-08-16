import { pickMultiple, randomItem } from './random';

export const BASIC_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const ACCENTED_LETTERS = 'ÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ'.split('');

export function generateLetters(count: number, includeAccents = false, unique = false): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000) throw new RangeError('Invalid letter count.');
  const alphabet = includeAccents ? [...BASIC_LETTERS, ...ACCENTED_LETTERS] : BASIC_LETTERS;
  if (unique && count > alphabet.length) throw new RangeError('Not enough unique letters.');
  return unique ? pickMultiple(alphabet, count) : Array.from({ length: count }, () => randomItem(alphabet));
}

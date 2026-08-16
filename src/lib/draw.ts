import { pickMultiple, randomItem } from './random';

export function drawItems<T>(items: readonly T[], count: number, withoutReplacement = true): T[] {
  if (items.length === 0) throw new RangeError('The list is empty.');
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Count must be a positive integer.');
  if (withoutReplacement) return pickMultiple(items, count);
  return Array.from({ length: count }, () => randomItem(items));
}

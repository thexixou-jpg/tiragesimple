import { shuffle } from './random';

export function distributeEvenly<T>(items: readonly T[], groupCount: number): T[][] {
  if (!Number.isSafeInteger(groupCount) || groupCount < 1) throw new RangeError('Group count must be positive.');
  if (items.length === 0) throw new RangeError('Cannot distribute an empty list.');
  if (groupCount > items.length) throw new RangeError('Group count cannot exceed item count.');

  const groups = Array.from({ length: groupCount }, () => [] as T[]);
  shuffle(items).forEach((item, index) => groups[index % groupCount]!.push(item));
  return groups;
}

export function distributeBySize<T>(items: readonly T[], groupSize: number): T[][] {
  if (!Number.isSafeInteger(groupSize) || groupSize < 1) throw new RangeError('Group size must be positive.');
  if (items.length === 0) throw new RangeError('Cannot distribute an empty list.');
  return distributeEvenly(items, Math.ceil(items.length / groupSize));
}

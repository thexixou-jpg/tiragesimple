import { randomInteger } from './random';

export interface NumberGenerationOptions {
  min: number;
  max: number;
  count: number;
  unique?: boolean;
  sorted?: boolean;
}

export function generateNumbers({ min, max, count, unique = false, sorted = false }: NumberGenerationOptions): number[] {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) throw new RangeError('Invalid bounds.');
  if (!Number.isSafeInteger(count) || count < 1 || count > 10_000) throw new RangeError('Invalid count.');
  const range = max - min + 1;
  if (!Number.isSafeInteger(range) || range < 1) throw new RangeError('The range is too large.');
  if (unique && count > range) throw new RangeError('Not enough unique numbers in the range.');

  const result: number[] = [];
  if (unique) {
    const selected = new Set<number>();
    while (selected.size < count) selected.add(randomInteger(min, max));
    result.push(...selected);
  } else {
    for (let index = 0; index < count; index += 1) result.push(randomInteger(min, max));
  }
  return sorted ? result.sort((a, b) => a - b) : result;
}

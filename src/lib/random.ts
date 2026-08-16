export interface WeightedItem<T> {
  value: T;
  weight: number;
}

const UINT53_RANGE = 2 ** 53;

function getCrypto(): Crypto {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Web Crypto is not available in this browser.');
  }
  return globalThis.crypto;
}

function randomUint53(): number {
  const values = new Uint32Array(2);
  getCrypto().getRandomValues(values);
  const high21 = values[0]! & 0x1f_ffff;
  return high21 * 0x1_0000_0000 + values[1]!;
}

export function randomFloat(): number {
  return randomUint53() / UINT53_RANGE;
}

export function randomInteger(min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    throw new RangeError('Bounds must be safe integers.');
  }
  if (min > max) throw new RangeError('Minimum cannot be greater than maximum.');

  const range = max - min + 1;
  if (!Number.isSafeInteger(range) || range <= 0) {
    throw new RangeError('The requested range is too large.');
  }

  const limit = Math.floor(UINT53_RANGE / range) * range;
  let value: number;
  do value = randomUint53(); while (value >= limit);
  return min + (value % range);
}

export function randomItem<T>(items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
  return items[randomInteger(0, items.length - 1)]!;
}

export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function pickMultiple<T>(items: readonly T[], count: number): T[] {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Count must be a positive safe integer.');
  }
  if (count > items.length) throw new RangeError('Count cannot exceed the list length.');
  return shuffle(items).slice(0, count);
}

export function weightedRandom<T>(items: readonly WeightedItem<T>[]): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty list.');
  const total = items.reduce((sum, item) => {
    if (!Number.isFinite(item.weight) || item.weight < 0) {
      throw new RangeError('Weights must be finite positive numbers.');
    }
    return sum + item.weight;
  }, 0);
  if (total <= 0 || !Number.isFinite(total)) throw new RangeError('Total weight must be positive and finite.');

  const threshold = randomFloat() * total;
  let cursor = 0;
  for (const item of items) {
    cursor += item.weight;
    if (threshold < cursor) return item.value;
  }
  return items.at(-1)!.value;
}

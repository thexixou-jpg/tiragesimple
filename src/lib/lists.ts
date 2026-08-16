export interface ParseListOptions {
  removeDuplicates?: boolean;
  limit?: number;
}

export function parseList(input: string, options: ParseListOptions = {}): string[] {
  const { removeDuplicates = false, limit = 10_000 } = options;
  const normalized = input
    .split(/\r?\n|\t/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);

  return removeDuplicates ? [...new Set(normalized)] : normalized;
}

export function serializeList(items: readonly string[]): string {
  return items.join('\n');
}

export function removeFirst(items: readonly string[], value: string): string[] {
  const index = items.indexOf(value);
  if (index < 0) return [...items];
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

export function formatCount(count: number, singular = 'élément', plural = 'éléments'): string {
  return `${count.toLocaleString('fr-FR')} ${count === 1 ? singular : plural}`;
}

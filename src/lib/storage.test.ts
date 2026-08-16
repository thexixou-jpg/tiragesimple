import { afterEach, describe, expect, it } from 'vitest';
import { loadLocal, removeLocal, saveLocal } from './storage';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

afterEach(() => Reflect.deleteProperty(globalThis, 'localStorage'));

describe('safe local storage', () => {
  it('reads and writes JSON values', () => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
    expect(saveLocal('test', { names: ['Élodie'] })).toBe(true);
    expect(loadLocal('test', { names: [] })).toEqual({ names: ['Élodie'] });
    expect(removeLocal('test')).toBe(true);
    expect(loadLocal('test', 'fallback')).toBe('fallback');
  });

  it('returns fallbacks for invalid JSON and unavailable storage', () => {
    const storage = new MemoryStorage();
    storage.setItem('broken', '{');
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    expect(loadLocal('broken', ['safe'])).toEqual(['safe']);
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(loadLocal('missing', 12)).toBe(12);
    expect(saveLocal('missing', 12)).toBe(false);
  });
});

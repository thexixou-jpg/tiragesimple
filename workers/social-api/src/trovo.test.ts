import { describe, expect, it } from 'vitest';
import { parseTrovoChannel } from './trovo';

describe('parseTrovoChannel', () => {
  it('accepts a login and canonical channel URL', () => {
    expect(parseTrovoChannel('IrenePro')).toBe('IrenePro');
    expect(parseTrovoChannel('https://trovo.live/IrenePro')).toBe('IrenePro');
  });
  it('rejects unrelated hosts and nested paths', () => {
    expect(parseTrovoChannel('https://example.com/IrenePro')).toBeNull();
    expect(parseTrovoChannel('https://trovo.live/s/IrenePro')).toBeNull();
  });
});

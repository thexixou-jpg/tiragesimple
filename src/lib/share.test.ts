import { describe, expect, it } from 'vitest';
import { decodeConfig, encodeConfig } from './share';

describe('URL share encoding', () => {
  it('round-trips unicode data through URL-safe base64', () => {
    const config = { names: ['Zoé', '李', '🎉'], enabled: true };
    const encoded = encodeConfig(config);
    expect(encoded).not.toMatch(/[+/=]/u);
    expect(decodeConfig(encoded)).toEqual(config);
  });

  it('rejects oversized data and invalid input', () => {
    expect(() => encodeConfig({ value: 'x'.repeat(100) }, 20)).toThrow(RangeError);
    expect(decodeConfig('not-json')).toBeNull();
  });
});

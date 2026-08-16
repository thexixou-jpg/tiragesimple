import { describe, expect, it } from 'vitest';
import { generateColor, rgbToHex, rgbToHsl } from './colors';

describe('random colors', () => {
  it('converts known RGB values', () => {
    expect(rgbToHex(103, 87, 232)).toBe('#6757E8');
    expect(rgbToHsl(255, 0, 0)).toBe('hsl(0 100% 50%)');
    expect(rgbToHsl(128, 128, 128)).toBe('hsl(0 0% 50%)');
  });
  it('generates complete color formats', () => {
    const color = generateColor();
    expect(color.hex).toMatch(/^#[0-9A-F]{6}$/u);
    expect(color.rgb).toMatch(/^rgb\(/u);
    expect(color.hsl).toMatch(/^hsl\(/u);
  });
});

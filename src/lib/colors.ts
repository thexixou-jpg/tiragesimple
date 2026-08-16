import { randomInteger } from './random';

export interface RandomColor { red: number; green: number; blue: number; hex: string; rgb: string; hsl: string; }

export function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function rgbToHsl(red: number, green: number, blue: number): string {
  const r = red / 255; const g = green / 255; const b = blue / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0; let saturation = 0;
  if (max !== min) {
    const delta = max - min;
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
  }
  return `hsl(${Math.round(hue * 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`;
}

export function generateColor(): RandomColor {
  const red = randomInteger(0, 255); const green = randomInteger(0, 255); const blue = randomInteger(0, 255);
  return { red, green, blue, hex: rgbToHex(red, green, blue), rgb: `rgb(${red} ${green} ${blue})`, hsl: rgbToHsl(red, green, blue) };
}

import { describe, expect, it } from 'vitest';
import { validateInteger } from './validation';

describe('integer validation', () => {
  it('validates safe integers and bounds', () => {
    expect(validateInteger('12', 'Quantité', { min: 1, max: 20 })).toEqual({ valid: true, value: 12 });
    expect(validateInteger('0', 'Quantité', { min: 1 }).valid).toBe(false);
    expect(validateInteger('21', 'Quantité', { max: 20 }).valid).toBe(false);
    expect(validateInteger('1.5', 'Quantité').valid).toBe(false);
  });
});

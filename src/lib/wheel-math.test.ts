import { describe, expect, it } from 'vitest';
import { normalizeAngle, targetRotation, winnerRotation } from './wheel-math';

describe('wheel math', () => {
  it('normalizes negative and oversized angles', () => {
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(Math.PI * 5)).toBeCloseTo(Math.PI);
  });

  it('centers every winner segment under the pointer', () => {
    for (const count of [1, 2, 100, 2_000]) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        const segment = (Math.PI * 2) / count;
        const center = winnerRotation(winner, count) + (winner + 0.5) * segment;
        expect(normalizeAngle(center)).toBeCloseTo(0, 10);
      }
    }
  });

  it('always adds the requested full turns', () => {
    const current = 1.25;
    const target = targetRotation(current, 7, 10, 7);
    expect(target).toBeGreaterThan(current + Math.PI * 2 * 7);
    expect(normalizeAngle(target)).toBeCloseTo(winnerRotation(7, 10));
  });
});

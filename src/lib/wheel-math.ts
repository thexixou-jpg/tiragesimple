const FULL_TURN = Math.PI * 2;

export function normalizeAngle(angle: number): number {
  return ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
}

export function winnerRotation(winnerIndex: number, itemCount: number): number {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) throw new RangeError('Item count must be positive.');
  if (!Number.isSafeInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= itemCount) {
    throw new RangeError('Winner index is outside the wheel.');
  }
  const segmentAngle = FULL_TURN / itemCount;
  return normalizeAngle(-(winnerIndex + 0.5) * segmentAngle);
}

export function targetRotation(current: number, winnerIndex: number, itemCount: number, turns: number): number {
  const target = winnerRotation(winnerIndex, itemCount);
  const delta = normalizeAngle(target - normalizeAngle(current));
  return current + turns * FULL_TURN + delta;
}

import { describe, expect, it } from 'vitest';
import { normalizeRules, sha256, verifiableDraw } from './contest-rules';
import type { Participant } from './types';

const participants: Participant[] = [
  { providerUserId: 'UC-a', displayName: 'Alice', entriesCount: 1, eligible: true, reasons: [] },
  { providerUserId: 'UC-b', displayName: 'Benoît', entriesCount: 3, eligible: true, reasons: [] },
  { providerUserId: 'UC-c', displayName: 'Chloé', entriesCount: 1, eligible: false, reasons: ['missing_keyword'] },
];

describe('social contest rules', () => {
  it('uses safe defaults for a single YouTube entry', () => {
    expect(normalizeRules({})).toMatchObject({ winnerCount: 1, alternateCount: 0, uniqueParticipants: true, duplicateEntries: false, includeReplies: false, excludePublicationAuthor: true });
  });

  it('creates a replayable draw proof without selecting an ineligible participant twice', async () => {
    const draw = await verifiableDraw(participants, normalizeRules({ winnerCount: 1, alternateCount: 1, duplicateEntries: true, uniqueParticipants: false }));
    const selected = [...draw.winners, ...draw.alternates];
    expect(selected).toHaveLength(2);
    expect(new Set(selected.map((participant) => participant.providerUserId))).toHaveLength(2);
    expect(selected.some((participant) => !participant.eligible)).toBe(false);
    expect(draw.commitmentHash).toBe(await sha256(draw.verificationSeed));
  });
});

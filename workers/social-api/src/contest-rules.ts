import type { ContestRules, Participant, ProviderCapabilities, SocialComment } from './types';

const mentionPattern = /(?:^|\s)@[\p{L}\p{N}._-]+/gu;

export function normalizeRules(input: Partial<ContestRules>): ContestRules {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Règles de tirage invalides.');
  const count = (value: unknown, fallback: number, minimum: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > 100) throw new Error('Le nombre de gagnants ou suppléants est invalide.');
    return value;
  };
  if (input.excludedUsers !== undefined && (!Array.isArray(input.excludedUsers) || input.excludedUsers.length > 100 || input.excludedUsers.some(v => typeof v !== 'string' || v.length > 300))) throw new Error('La liste des exclusions est invalide.');
  if (input.requiredKeyword !== undefined && (typeof input.requiredKeyword !== 'string' || input.requiredKeyword.length > 120)) throw new Error('Le filtre textuel est invalide.');
  return {
    winnerCount: count(input.winnerCount, 1, 1),
    alternateCount: count(input.alternateCount, 0, 0),
    uniqueParticipants: input.uniqueParticipants ?? true,
    duplicateEntries: input.duplicateEntries ?? false,
    excludedUsers: (input.excludedUsers ?? []).map((item) => item.trim().replace(/^@/u, '').toLowerCase()).filter(Boolean),
    requiredKeyword: input.requiredKeyword?.trim().toLocaleLowerCase('fr-FR') || undefined,
    minimumMentions: input.minimumMentions && input.minimumMentions > 0 ? Math.min(20, Math.trunc(input.minimumMentions)) : undefined,
    includeReplies: input.includeReplies ?? false,
    excludePublicationAuthor: input.excludePublicationAuthor ?? true,
    interaction: input.interaction === 'reposts' ? 'reposts' : 'likes',
  };
}

function commentIsEligible(comment: SocialComment, rules: ContestRules, capabilities: ProviderCapabilities): string[] {
  const reasons: string[] = [];
  const username = comment.username?.toLowerCase();
  if (rules.excludedUsers.includes(comment.providerUserId.toLowerCase()) || (username && rules.excludedUsers.includes(username))) reasons.push('excluded_user');
  if (!rules.includeReplies && comment.isReply) reasons.push('reply_excluded');
  if (rules.requiredKeyword && !comment.text.toLocaleLowerCase('fr-FR').includes(rules.requiredKeyword)) reasons.push('missing_keyword');
  if (rules.minimumMentions && capabilities.mentions) {
    const mentions = comment.text.match(mentionPattern)?.length ?? 0;
    if (mentions < rules.minimumMentions) reasons.push('missing_mentions');
  }
  return reasons;
}

export function createParticipants(comments: SocialComment[], rules: ContestRules, capabilities: ProviderCapabilities): Participant[] {
  const participants = new Map<string, Participant>();
  for (const comment of comments) {
    if (!comment.providerUserId || !capabilities.comments) continue;
    const reasons = commentIsEligible(comment, rules, capabilities);
    const existing = participants.get(comment.providerUserId);
    if (!existing) {
      participants.set(comment.providerUserId, {
        providerUserId: comment.providerUserId, username: comment.username, displayName: comment.displayName,
        entriesCount: reasons.length ? 0 : 1, eligible: reasons.length === 0, reasons,
      });
      continue;
    }
    if (!reasons.length) {
      existing.entriesCount = !rules.uniqueParticipants && rules.duplicateEntries ? existing.entriesCount + 1 : 1;
      existing.eligible = true;
      existing.reasons = [];
    }
  }
  return [...participants.values()];
}

function randomInteger(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) throw new Error('Invalid draw range');
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return values[0] % maxExclusive;
}

export function secureDraw(participants: Participant[], rules: ContestRules): { winners: Participant[]; alternates: Participant[] } {
  const pool = participants.filter((participant) => participant.eligible).flatMap((participant) => Array.from({ length: rules.duplicateEntries ? participant.entriesCount : 1 }, () => participant));
  const selected = new Set<string>();
  const result: Participant[] = [];
  const target = Math.min(rules.winnerCount + rules.alternateCount, new Set(pool.map((item) => item.providerUserId)).size);
  while (result.length < target && pool.length) {
    const candidate = pool.splice(randomInteger(pool.length), 1)[0];
    if (!selected.has(candidate.providerUserId)) { selected.add(candidate.providerUserId); result.push(candidate); }
  }
  return { winners: result.slice(0, rules.winnerCount), alternates: result.slice(rules.winnerCount) };
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function seededIndex(maxExclusive: number, seed: string, counter: number): Promise<{ index: number; counter: number }> {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1) throw new Error('Invalid draw range');
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let nextCounter = counter;
  while (true) {
    const digest = await sha256(`${seed}:${nextCounter++}`);
    const value = Number.parseInt(digest.slice(0, 8), 16);
    if (value < limit) return { index: value % maxExclusive, counter: nextCounter };
  }
}

/**
 * Creates a reproducible draw from a cryptographically random seed. It is not
 * an external certification: publishing the seed only lets somebody replay a
 * draw against the same participant snapshot.
 */
export async function verifiableDraw(participants: Participant[], rules: ContestRules): Promise<{
  winners: Participant[];
  alternates: Participant[];
  verificationSeed: string;
  commitmentHash: string;
}> {
  const pool = participants.filter((participant) => participant.eligible).flatMap((participant) =>
    Array.from({ length: rules.duplicateEntries ? participant.entriesCount : 1 }, () => participant),
  );
  const target = Math.min(rules.winnerCount + rules.alternateCount, new Set(pool.map((item) => item.providerUserId)).size);
  const seed = randomSeed();
  const selected = new Set<string>();
  const result: Participant[] = [];
  let counter = 0;
  while (result.length < target && pool.length) {
    const next = await seededIndex(pool.length, seed, counter);
    counter = next.counter;
    const candidate = pool.splice(next.index, 1)[0];
    if (!selected.has(candidate.providerUserId)) {
      selected.add(candidate.providerUserId);
      result.push(candidate);
    }
  }
  return {
    winners: result.slice(0, rules.winnerCount),
    alternates: result.slice(rules.winnerCount),
    verificationSeed: seed,
    commitmentHash: await sha256(seed),
  };
}

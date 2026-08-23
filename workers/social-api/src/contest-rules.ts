import type { ContestRules, Participant, ProviderCapabilities, SocialComment } from './types';

const mentionPattern = /(?:^|\s)@[\p{L}\p{N}._-]+/gu;

export function normalizeRules(input: Partial<ContestRules>): ContestRules {
  return {
    winnerCount: Math.max(1, Math.min(100, Math.trunc(input.winnerCount ?? 1))),
    alternateCount: Math.max(0, Math.min(100, Math.trunc(input.alternateCount ?? 0))),
    uniqueParticipants: input.uniqueParticipants ?? true,
    duplicateEntries: input.duplicateEntries ?? false,
    excludedUsers: (input.excludedUsers ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean),
    requiredKeyword: input.requiredKeyword?.trim().toLocaleLowerCase('fr-FR') || undefined,
    minimumMentions: input.minimumMentions && input.minimumMentions > 0 ? Math.min(20, Math.trunc(input.minimumMentions)) : undefined,
    includeReplies: input.includeReplies ?? false,
  };
}

function commentIsEligible(comment: SocialComment, rules: ContestRules, capabilities: ProviderCapabilities): string[] {
  const reasons: string[] = [];
  const username = comment.username?.toLowerCase();
  if (username && rules.excludedUsers.includes(username)) reasons.push('excluded_user');
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
    if (!reasons.length && !rules.uniqueParticipants && rules.duplicateEntries) existing.entriesCount += 1;
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

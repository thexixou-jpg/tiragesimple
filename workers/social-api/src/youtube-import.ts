import { sha256, verifiableDraw } from './contest-rules';
import { getImportContext, listEligibleParticipants } from './storage';
import type { Env, Participant } from './types';
import { socialRulesSummary } from '../../../src/lib/social-rules-summary';

export interface DrawResult {
  publicId: string;
  publicUrl?: string;
  participantSnapshotHash: string;
  randomCommitmentHash: string;
  resultHash: string;
  verificationSeed: string;
  winners: Array<Participant & { id: string }>;
  alternates: Array<Participant & { id: string }>;
  receipt: {
    version: 1;
    id: string;
    createdAt: string;
    expiresAt: string;
    platform: string;
    publication: { url: string; title?: string };
    analyzedCount: number;
    participantCount: number;
    rulesSummary: string[];
    winners: Array<{ displayName?: string; username?: string }>;
    alternates: Array<{ displayName?: string; username?: string }>;
    proof: { participantSnapshotHash: string; randomCommitmentHash: string; verificationSeed: string; resultHash: string };
    notice: string;
  };
}

function publicDrawId(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint8Array(5);
  crypto.getRandomValues(values);
  return `TS-${date}-${[...values].map((value) => alphabet[value % alphabet.length]).join('')}`;
}

export async function createYouTubeDraw(env: Env, importId: string, publicVisibility: boolean): Promise<DrawResult> {
  if (!env.DB) throw new Error('The social contest database is not configured');
  const context = await getImportContext(env, importId);
  if (!context) throw new Error('Import not found');
  if (context.import.expires_at <= new Date().toISOString()) throw new Error('Cet import a expiré. Importez à nouveau les participants.');
  if (context.import.status !== 'ready') throw new Error('The participant import is not ready');
  const participants = await listEligibleParticipants(env, importId);
  if (!participants.length) throw new Error('No eligible participant is available for this draw');
  const required = context.rules.winnerCount + context.rules.alternateCount;
  if (participants.length < required) throw new Error(`Participants insuffisants : ${participants.length} comptes éligibles pour ${required} gagnants et suppléants. Ajustez les règles puis réimportez.`);
  const snapshot = participants.map((participant) => ({ providerUserId: participant.providerUserId, entriesCount: participant.entriesCount }));
  const participantSnapshotHash = await sha256(JSON.stringify(snapshot));
  const drawn = await verifiableDraw(participants, context.rules);
  const resultHash = await sha256(JSON.stringify({ winners: drawn.winners.map((item) => item.providerUserId), alternates: drawn.alternates.map((item) => item.providerUserId) }));
  const id = crypto.randomUUID();
  const publicId = publicDrawId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.parse(context.import.expires_at)).toISOString();
  const selected = new Map(participants.map((participant) => [participant.providerUserId, participant]));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO contest_draws (id, public_id, import_id, rules_snapshot_json, participant_snapshot_hash, random_commitment_hash, verification_seed, result_hash, public_visibility, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, publicId, importId, JSON.stringify(context.rules), participantSnapshotHash, drawn.commitmentHash, drawn.verificationSeed, resultHash, publicVisibility ? 1 : 0, now, expiresAt),
    env.DB.prepare(`INSERT INTO contest_winners (id, draw_id, participant_id, rank, kind, created_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.participantId'), json_extract(value, '$.rank'), json_extract(value, '$.kind'), ? FROM json_each(?)`)
      .bind(id, now, JSON.stringify([
        ...drawn.winners.map((winner, index) => ({ id: crypto.randomUUID(), participantId: selected.get(winner.providerUserId)!.id, rank: index + 1, kind: 'winner' })),
        ...drawn.alternates.map((winner, index) => ({ id: crypto.randomUUID(), participantId: selected.get(winner.providerUserId)!.id, rank: index + 1, kind: 'alternate' })),
      ])),
  ]);
  const publicUrl = publicVisibility && env.PUBLIC_SITE_URL ? new URL(`/tirage/${publicId}`, env.PUBLIC_SITE_URL).toString() : undefined;
  const winners = drawn.winners.map((winner) => selected.get(winner.providerUserId)!);
  const alternates = drawn.alternates.map((alternate) => selected.get(alternate.providerUserId)!);
  const receipt = {
    version: 1 as const,
    id: publicId,
    createdAt: now,
    expiresAt,
    platform: context.publication.provider,
    publication: { url: context.publication.canonicalUrl, ...(context.publication.title ? { title: context.publication.title } : {}) },
    analyzedCount: context.import.progress_current,
    participantCount: context.import.participant_count,
    rulesSummary: socialRulesSummary(context.publication.provider, { ...context.rules, excludedAccountCount: context.rules.excludedUsers.length }),
    winners: winners.map(({ displayName, username }) => ({ displayName, username })),
    alternates: alternates.map(({ displayName, username }) => ({ displayName, username })),
    proof: { participantSnapshotHash, randomCommitmentHash: drawn.commitmentHash, verificationSeed: drawn.verificationSeed, resultHash },
    notice: 'Reçu généré par TirageSimple. Il ne constitue pas une certification indépendante et ne contient pas la liste privée des participants.',
  };
  return { publicId, publicUrl, participantSnapshotHash, randomCommitmentHash: drawn.commitmentHash, resultHash, verificationSeed: drawn.verificationSeed, winners, alternates, receipt };
}

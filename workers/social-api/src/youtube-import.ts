import { createParticipants, sha256, verifiableDraw } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { createImport, getImportContext, incrementProviderUsage, listEligibleParticipants, participantCount, saveParticipants, savePublication, setImportStatus } from './storage';
import type { ContestRules, Env, Participant, SocialImportJob, SocialPublication } from './types';
import { getYouTubeCommentPage } from './youtube';

function maximumParticipants(env: Env): number {
  const configured = Number.parseInt(env.MAX_PARTICIPANTS ?? '10000', 10);
  return Math.max(100, Math.min(100_000, Number.isFinite(configured) ? configured : 10_000));
}

export async function queueYouTubeImport(env: Env, ownerSessionId: string, publication: SocialPublication, rules: ContestRules, commentsTotal: number | null): Promise<{ id: string; status: string }> {
  if (!env.SOCIAL_IMPORT_QUEUE) throw new Error('The social import queue is not configured');
  const storedPublication = await savePublication(env, publication);
  const stored = await createImport(env, ownerSessionId, storedPublication, rules, getProviderCapabilities('youtube'), commentsTotal);
  await env.SOCIAL_IMPORT_QUEUE.send({ provider: 'youtube', importId: stored.id });
  return { id: stored.id, status: stored.status };
}

/** Processes one official YouTube API page. Queues keep big imports off the request path. */
export async function processYouTubeImport(job: SocialImportJob, env: Env): Promise<void> {
  const context = await getImportContext(env, job.importId);
  if (!context || context.import.status === 'ready' || context.import.status === 'failed') return;
  if (context.rules.includeReplies) {
    // commentThreads.list embeds only a subset of replies. We must not present that as a complete reply import.
    await setImportStatus(env, job.importId, 'failed', { errorCode: 'replies_not_ready', errorMessage: 'L’import complet des réponses YouTube n’est pas encore activé.' });
    return;
  }
  try {
    await setImportStatus(env, job.importId, 'running');
    const page = await getYouTubeCommentPage(context.publication.providerPublicationId, job.pageToken, false, env);
    await incrementProviderUsage(env, 'youtube');
    const comments = context.rules.excludePublicationAuthor && context.publication.authorProviderId
      ? page.comments.filter((comment) => comment.providerUserId !== context.publication.authorProviderId)
      : page.comments;
    const participants = createParticipants(comments, context.rules, getProviderCapabilities('youtube'));
    if (await participantCount(env, job.importId) + participants.length > maximumParticipants(env)) {
      await setImportStatus(env, job.importId, 'failed', { errorCode: 'participant_limit', errorMessage: `La limite de ${maximumParticipants(env)} participants a été atteinte.` });
      return;
    }
    if (participants.length) await saveParticipants(env, job.importId, participants, context.rules.duplicateEntries);
    if (page.nextPageToken && env.SOCIAL_IMPORT_QUEUE) {
      await setImportStatus(env, job.importId, 'queued', { progressIncrement: comments.length });
      await env.SOCIAL_IMPORT_QUEUE.send({ provider: 'youtube', importId: job.importId, pageToken: page.nextPageToken });
      return;
    }
    const eligible = await listEligibleParticipants(env, job.importId);
    await setImportStatus(env, job.importId, 'ready', { progressIncrement: comments.length, participantCount: eligible.length });
  } catch (error) {
    await setImportStatus(env, job.importId, 'failed', {
      errorCode: 'youtube_import_failed',
      errorMessage: error instanceof Error ? error.message : 'Impossible de récupérer les commentaires YouTube.',
    });
  }
}

export interface DrawResult {
  publicId: string;
  participantSnapshotHash: string;
  randomCommitmentHash: string;
  resultHash: string;
  verificationSeed: string;
  winners: Array<Participant & { id: string }>;
  alternates: Array<Participant & { id: string }>;
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
  if (context.import.status !== 'ready') throw new Error('The participant import is not ready');
  const participants = await listEligibleParticipants(env, importId);
  if (!participants.length) throw new Error('No eligible participant is available for this draw');
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
    ...drawn.winners.map((winner, index) => env.DB!.prepare('INSERT INTO contest_winners (id, draw_id, participant_id, rank, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, selected.get(winner.providerUserId)!.id, index + 1, 'winner', now)),
    ...drawn.alternates.map((alternate, index) => env.DB!.prepare('INSERT INTO contest_winners (id, draw_id, participant_id, rank, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, selected.get(alternate.providerUserId)!.id, index + 1, 'alternate', now)),
  ]);
  return { publicId, participantSnapshotHash, randomCommitmentHash: drawn.commitmentHash, resultHash, verificationSeed: drawn.verificationSeed, winners: drawn.winners.map((winner) => selected.get(winner.providerUserId)!), alternates: drawn.alternates.map((alternate) => selected.get(alternate.providerUserId)!) };
}

import { createParticipants, sha256 } from './contest-rules';
import { getBlueskyParticipantsPage } from './bluesky';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import { checkImportAllowance, commitImportPage, createImport, getImport, getImportContext, getImportPage, importPageCount, reserveProviderRequest, savePublication, setImportStatus } from './storage';
import type { ContestRules, Env, Participant, SocialComment, SocialImportJob, SocialPublication } from './types';
import { getYouTubeCommentPage, getYouTubeReplyPage } from './youtube';
import { getMastodonParticipantsPage } from './mastodon';
import { getLemmyParticipantsPage } from './lemmy';
import { getGitHubParticipantsPage } from './github';
import { getStackExchangeParticipantsPage } from './stackexchange';
import { getYouTubeLiveChatSnapshot } from './youtube-live';
import { getTwitchChattersPage } from './twitch';
import { getDiscordParticipantsPage } from './discord';
import { getRedditParticipants } from './reddit';
import { getVimeoCommentPage, getVimeoReplyPage } from './vimeo';
import { getSoundCloudCommentPage } from './soundcloud';
import { getMixcloudParticipantsPage } from './mixcloud';
import { getGitLabParticipantsPage } from './gitlab';
import { getDevParticipants } from './devto';
import { getHackerNewsParticipantsBatch } from './hackernews';
import { getBitbucketParticipantsPage } from './bitbucket';
import { getWordPressParticipantsPage } from './wordpress';
import { getPeerTubeCommentPage, getPeerTubeReplyPage, peerTubeParticipants } from './peertube';

export function nextYouTubeJob(job: SocialImportJob, nextPageToken?: string, replyParentIds: string[] = []): SocialImportJob | undefined {
  const base = { provider: job.provider, importId: job.importId };
  if (job.phase === 'replies') {
    if (nextPageToken) return { ...job, pageToken: nextPageToken };
    const remaining = job.parentIds?.slice(1) ?? [];
    if (remaining.length) return { ...base, phase: 'replies', parentIds: remaining, nextThreadToken: job.nextThreadToken };
    return job.nextThreadToken ? { ...base, pageToken: job.nextThreadToken } : undefined;
  }
  if (replyParentIds.length) return { ...base, phase: 'replies', parentIds: replyParentIds, nextThreadToken: nextPageToken };
  return nextPageToken ? { ...base, pageToken: nextPageToken } : undefined;
}

export async function queueSocialImport(env: Env, sessionId: string, publication: SocialPublication, rules: ContestRules) {
  if (!env.SOCIAL_IMPORT_QUEUE) throw new Error('The social import queue is not configured');
  await checkImportAllowance(env, sessionId);
  const saved = await savePublication(env, publication);
  const imported = await createImport(env, sessionId, saved, rules, getProviderCapabilities(publication.provider), null);
  try { await env.SOCIAL_IMPORT_QUEUE.send({ provider: publication.provider, importId: imported.id }); }
  catch (error) { await setImportStatus(env, imported.id, 'failed', { errorMessage: 'Impossible de démarrer l’import. Réessayez.' }); throw error; }
  return { id: imported.id, status: imported.status };
}

export async function createClientSocialImport(env: Env, sessionId: string, publication: SocialPublication, rules: ContestRules, comments: SocialComment[]) {
  if (!['github', 'stackexchange', 'trovo'].includes(publication.provider)) throw new Error('Import navigateur non autorisé pour cette plateforme.');
  if (!Array.isArray(comments) || comments.length > 10000) throw new Error('La collecte navigateur dépasse la limite de 10 000 contributions.');
  let characters = 0;
  for (const comment of comments) {
    if (!comment || typeof comment !== 'object' || typeof comment.providerCommentId !== 'string' || !comment.providerCommentId || comment.providerCommentId.length > 300
      || typeof comment.providerUserId !== 'string' || !comment.providerUserId || comment.providerUserId.length > 300
      || typeof comment.text !== 'string' || comment.text.length > 20000
      || comment.username !== undefined && (typeof comment.username !== 'string' || comment.username.length > 300)
      || comment.displayName !== undefined && (typeof comment.displayName !== 'string' || comment.displayName.length > 300)
      || comment.createdAt !== undefined && (typeof comment.createdAt !== 'string' || comment.createdAt.length > 60)
      || comment.isReply !== false) throw new Error('Une contribution importée est invalide.');
    characters += comment.providerCommentId.length + comment.providerUserId.length + comment.text.length + (comment.username?.length ?? 0) + (comment.displayName?.length ?? 0);
  }
  if (characters > 2_000_000) throw new Error('La collecte navigateur est trop volumineuse.');
  await checkImportAllowance(env, sessionId);
  const saved = await savePublication(env, publication);
  rules.clientSourced = true;
  const imported = await createImport(env, sessionId, saved, rules, getProviderCapabilities(publication.provider), null);
  let participants = createParticipants(comments, rules, getProviderCapabilities(publication.provider));
  if (rules.excludePublicationAuthor) participants = participants.filter(participant => participant.providerUserId !== publication.authorProviderId);
  const maximum = Math.max(100, Math.min(10000, Number.parseInt(env.MAX_PARTICIPANTS ?? '10000', 10) || 10000));
  await commitImportPage(env, imported.id, await sha256(`client:${publication.provider}:${publication.providerPublicationId}`), participants,
    rules.duplicateEntries && !rules.uniqueParticipants, comments.length, undefined, maximum);
  const complete = await getImport(env, imported.id);
  if (!complete) throw new Error('Impossible de finaliser l’import navigateur.');
  return { id: complete.id, status: complete.status };
}

/** Turns server-verified, short-lived webhook events into a normal draw import.
 * Raw message text is deleted by the provider immediately after this succeeds. */
export async function createRecordedSocialImport(env: Env, sessionId: string, publication: SocialPublication, rules: ContestRules, comments: SocialComment[]) {
  if (publication.provider !== 'kick') throw new Error('Collecte serveur non autorisée pour cette plateforme.');
  if (!Array.isArray(comments) || comments.length > 100000) throw new Error('La collecte dépasse la limite de 100 000 messages.');
  await checkImportAllowance(env, sessionId);
  const saved = await savePublication(env, publication);
  const imported = await createImport(env, sessionId, saved, rules, getProviderCapabilities(publication.provider), comments.length);
  let participants = createParticipants(comments, rules, getProviderCapabilities(publication.provider));
  if (rules.excludePublicationAuthor) participants = participants.filter(participant => participant.providerUserId !== publication.authorProviderId);
  const maximum = Math.max(100, Math.min(100000, Number.parseInt(env.MAX_PARTICIPANTS ?? '10000', 10) || 10000));
  await commitImportPage(env, imported.id, await sha256(`recorded:${publication.provider}:${publication.providerPublicationId}`), participants,
    rules.duplicateEntries && !rules.uniqueParticipants, comments.length, undefined, maximum);
  const complete = await getImport(env, imported.id);
  if (!complete) throw new Error('Impossible de finaliser la collecte Kick.');
  return { id: complete.id, status: complete.status };
}

export async function processSocialImport(job: SocialImportJob, env: Env): Promise<void> {
  const context = await getImportContext(env, job.importId);
  if (!context || ['ready', 'failed'].includes(context.import.status) || context.import.expires_at <= new Date().toISOString()) return;
  if (job.provider !== context.publication.provider || !['youtube', 'youtube_live', 'vimeo', 'soundcloud', 'mixcloud', 'peertube', 'twitch', 'discord', 'bluesky', 'mastodon', 'lemmy', 'reddit', 'github', 'gitlab', 'bitbucket', 'devto', 'hackernews', 'stackexchange', 'wordpress'].includes(job.provider)) throw new Error('Invalid import provider');
  const key = await sha256(JSON.stringify([job.phase ?? 'main', job.pageToken ?? '', job.parentIds ?? [], job.nextThreadToken ?? '']));
  const previous = await getImportPage(env, job.importId, key);
  if (previous) {
    if (previous.next_job_json) await env.SOCIAL_IMPORT_QUEUE!.send(JSON.parse(previous.next_job_json));
    return;
  }
  try {
    if (await importPageCount(env, job.importId) >= 1200) throw new Error('Limite de 1 200 pages API atteinte : aucun tirage partiel ne sera effectué.');
    await reserveProviderRequest(env, job.provider);
    let participants: Participant[];
    let analyzed: number;
    let next: SocialImportJob | undefined;
    if (job.provider === 'youtube') {
      const page = job.phase === 'replies'
        ? await getYouTubeReplyPage(job.parentIds![0], job.pageToken, env)
        : await getYouTubeCommentPage(context.publication.providerPublicationId, job.pageToken, context.rules.includeReplies, env);
      participants = createParticipants(page.comments, context.rules, getProviderCapabilities('youtube'));
      analyzed = page.totalResults;
      next = nextYouTubeJob(job, page.nextPageToken, 'replyParentIds' in page && Array.isArray(page.replyParentIds) ? page.replyParentIds as string[] : []);
    } else if (job.provider === 'vimeo') {
      const page = job.phase === 'replies'
        ? await getVimeoReplyPage(context.publication.providerPublicationId, job.parentIds![0], job.pageToken, env)
        : await getVimeoCommentPage(context.publication.providerPublicationId, job.pageToken, context.rules.includeReplies, env);
      participants = createParticipants(page.comments, context.rules, getProviderCapabilities('vimeo'));
      analyzed = page.totalResults;
      next = nextYouTubeJob(job, page.nextPageToken, 'replyParentIds' in page && Array.isArray(page.replyParentIds) ? page.replyParentIds as string[] : []);
    } else if (job.provider === 'soundcloud') {
      const page = await getSoundCloudCommentPage(context.publication.providerPublicationId, job.pageToken, env);
      participants = createParticipants(page.comments, context.rules, getProviderCapabilities('soundcloud'));
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'mixcloud') {
      const page = await getMixcloudParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'peertube') {
      const page = job.phase === 'replies'
        ? await getPeerTubeReplyPage(context.publication.providerPublicationId, job.parentIds![0], env)
        : await getPeerTubeCommentPage(context.publication.providerPublicationId, job.pageToken, context.rules.includeReplies, env);
      participants = peerTubeParticipants(page.comments, context.rules);
      analyzed = page.totalResults;
      next = nextYouTubeJob(job, 'nextPageToken' in page && typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined, 'replyParentIds' in page && Array.isArray(page.replyParentIds) ? page.replyParentIds : []);
    } else if (job.provider === 'youtube_live') {
      const page = await getYouTubeLiveChatSnapshot(context.publication.providerPublicationId, env);
      participants = createParticipants(page.comments, context.rules, getProviderCapabilities('youtube_live'));
      analyzed = page.totalResults;
      next = undefined;
    } else if (job.provider === 'twitch') {
      const page = await getTwitchChattersPage(context.publication.providerPublicationId, job.pageToken, context.rules, env, context.import.owner_session_id);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'discord') {
      const page = await getDiscordParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants; analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'bluesky') {
      const page = await getBlueskyParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'mastodon') {
      const page = await getMastodonParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'lemmy') {
      const page = await getLemmyParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'reddit') {
      const page = await getRedditParticipants(context.publication.providerPublicationId, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = undefined;
    } else if (job.provider === 'github') {
      const page = await getGitHubParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'gitlab') {
      const page = await getGitLabParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'bitbucket') {
      const page = await getBitbucketParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else if (job.provider === 'devto') {
      const page = await getDevParticipants(context.publication.providerPublicationId, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = undefined;
    } else if (job.provider === 'hackernews') {
      const page = await getHackerNewsParticipantsBatch(context.publication.providerPublicationId, job.parentIds, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPendingIds ? { ...job, parentIds: page.nextPendingIds } : undefined;
    } else if (job.provider === 'wordpress') {
      const page = await getWordPressParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    } else {
      const page = await getStackExchangeParticipantsPage(context.publication.providerPublicationId, job.pageToken, context.rules, env);
      participants = page.participants;
      analyzed = page.totalResults;
      next = page.nextPageToken ? { ...job, pageToken: page.nextPageToken } : undefined;
    }
    if (context.rules.excludePublicationAuthor) participants = participants.filter(p => p.providerUserId !== context.publication.authorProviderId);
    if (next) {
      const nextKey = await sha256(JSON.stringify([next.phase ?? 'main', next.pageToken ?? '', next.parentIds ?? [], next.nextThreadToken ?? '']));
      if (nextKey === key || (await getImportPage(env, job.importId, nextKey) && !await getImportPage(env, job.importId, key))) throw new Error('La pagination de la plateforme est incohérente. Import interrompu.');
    }
    const maximum = Math.max(100, Math.min(100000, Number.parseInt(env.MAX_PARTICIPANTS ?? '10000', 10) || 10000));
    await commitImportPage(env, job.importId, key, participants, context.rules.duplicateEntries && !context.rules.uniqueParticipants, analyzed, next, maximum);
  } catch (error) {
    if (error instanceof ProviderRequestError && error.retryable) throw error;
    await setImportStatus(env, job.importId, 'failed', { errorCode: 'import_failed', errorMessage: error instanceof Error ? error.message : 'Import impossible.' });
    return;
  }
  // Read the committed checkpoint, not a competing fetch's in-memory cursor.
  const committed = await getImportPage(env, job.importId, key);
  if (committed?.next_job_json && (await getImport(env, job.importId))?.status === 'queued') await env.SOCIAL_IMPORT_QUEUE!.send(JSON.parse(committed.next_job_json));
}

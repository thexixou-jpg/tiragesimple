import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { getBlueskyPublication, parseBlueskyUrl } from './bluesky';
import { createParticipants, normalizeRules } from './contest-rules';
import { getProviderCapabilities } from './providers';
import { ProviderRequestError } from './provider-http';
import { nextYouTubeJob, processSocialImport, queueSocialImport } from './social-import';
import { getImport, listEligibleParticipants, purgeExpiredData } from './storage';
import { createYouTubeDraw } from './youtube-import';
import type { Env, SocialImportJob, SocialPublication } from './types';
import worker from './index';

function fixture(maximum = '10000') {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ['0001_initial.sql', '0002_import_pages.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const run = () => sqlite.prepare(sql).run(...args as never[]);
    return { bind(...values: unknown[]) { args = values; return this; }, run: async () => run(), execute: run,
      first: async () => sqlite.prepare(sql).get(...args as never[]) ?? null,
      all: async () => ({ results: sqlite.prepare(sql).all(...args as never[]) }),
    };
  };
  const jobs: SocialImportJob[] = [];
  const env = { BLUESKY_ENABLED: 'true', YOUTUBE_ENABLED: 'true', YOUTUBE_API_KEY: 'test-key', SESSION_SIGNING_SECRET: 'test-session-secret', MAX_PARTICIPANTS: maximum,
    PUBLIC_SITE_URL: 'https://example.test',
    DB: { prepare, batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN'); try { const result = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    } }, SOCIAL_IMPORT_QUEUE: { send: async (job: SocialImportJob) => { jobs.push(job); } },
  } as unknown as Env;
  return { env, jobs, sqlite };
}
const publication: SocialPublication = { provider: 'youtube', providerPublicationId: 'abcdefghijk', canonicalUrl: 'https://youtube.com/watch?v=abcdefghijk', authorProviderId: 'owner' };
const actor = (id: string, text = 'concours') => ({ id: `comment-${id}`, snippet: { authorChannelId: { value: id }, authorDisplayName: id, textDisplay: text, publishedAt: '2026-08-31' } });
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('official social connectors', () => {
  it('rejects unrelated hosts, credentials and malformed Bluesky URLs', () => {
    expect(parseBlueskyUrl('https://bsky.app/profile/alice.bsky.social/post/abc123')).toEqual({ actor: 'alice.bsky.social', rkey: 'abc123' });
    for (const url of ['https://evil.test/profile/a/post/b', 'http://bsky.app/profile/a.b/post/x', 'https://user:pass@bsky.app/profile/a.fr/post/x', 'https://bsky.app.evil.test/profile/a.fr/post/x', 'https://bsky.app/profile/a.fr/post/..']) expect(parseBlueskyUrl(url)).toBeNull();
  });
  it('resolves a handle with the fixed official API host and returns a DID-based canonical', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      expect(url.origin).toBe('https://public.api.bsky.app');
      return url.pathname.endsWith('resolveHandle') ? response({ did: 'did:plc:alice' }) : response({ posts: [{ uri: 'at://did:plc:alice/app.bsky.feed.post/abc', author: { did: 'did:plc:alice', handle: 'alice.bsky.social' }, record: { text: 'Mon concours' } }] });
    }));
    const post = await getBlueskyPublication('https://bsky.app/profile/alice.bsky.social/post/abc', { BLUESKY_ENABLED: 'true' });
    expect(post.canonicalUrl).toBe('https://bsky.app/profile/did:plc:alice/post/abc');
  });
  it('imports all reply pages before continuing the next thread page and checkpoints duplicate deliveries', async () => {
    const { env, jobs } = fixture();
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/commentThreads')) return response(url.searchParams.has('pageToken')
        ? { items: [{ snippet: { topLevelComment: actor('c') } }], pageInfo: { totalResults: 1 } }
        : { items: [{ snippet: { topLevelComment: actor('a'), totalReplyCount: 101 } }], pageInfo: { totalResults: 1 }, nextPageToken: 'threads-2' });
      expect(url.searchParams.get('parentId')).toBe('comment-a');
      return response(url.searchParams.has('pageToken') ? { items: [actor('b')] } : { items: [actor('a')], nextPageToken: 'replies-2' });
    }));
    const imported = await queueSocialImport(env, 'session', publication, normalizeRules({ includeReplies: true, duplicateEntries: true, uniqueParticipants: false }));
    const first = jobs.shift()!;
    await processSocialImport(first, env);
    await processSocialImport(first, env); // queue redelivery must not double weights
    expect((await getImport(env, imported.id))?.status).toBe('queued');
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    expect(await getImport(env, imported.id)).toMatchObject({ status: 'ready', progress_current: 4, participant_count: 3 });
    expect((await listEligibleParticipants(env, imported.id)).find(p => p.providerUserId === 'a')?.entriesCount).toBe(2);
  });
  it('deduplicates Bluesky DID across pages and excludes the post author', async () => {
    const { env, jobs } = fixture();
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => response(url.searchParams.has('cursor') ? { repostedBy: [{ did: 'a', handle: 'renamed.bsky.social' }, { did: 'b', handle: 'b.bsky.social' }] } : { repostedBy: [{ did: 'a', handle: 'a.bsky.social' }, { did: 'owner', handle: 'owner.bsky.social' }], cursor: 'page2' })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({ interaction: 'reposts', alternateCount: 1 }));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    const participants = await listEligibleParticipants(env, imported.id);
    expect(participants.map(p => p.entriesCount)).toEqual([1, 1]);
    const draw = await createYouTubeDraw(env, imported.id, true);
    expect(draw.winners).toHaveLength(1); expect(draw.alternates).toHaveLength(1);
    expect(draw.winners[0].providerUserId).not.toBe(draw.alternates[0].providerUserId);
    expect(draw.publicUrl).toContain('https://example.test/tirage/');
    const publicResponse = await worker.fetch(new Request(`https://example.test/v1/draws/${draw.publicId}`), env);
    const publicPayload = await publicResponse.json() as { draw: { rules: Record<string, unknown> } };
    expect(publicPayload.draw.rules).not.toHaveProperty('excludedUsers');
    expect(publicPayload.draw.rules).toHaveProperty('excludedAccountCount', 0);
  });
  it('fails a partial import rather than drawing from it', async () => {
    const { env, jobs } = fixture();
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.searchParams.has('cursor') ? new Response('', { status: 403 }) : response({ likes: [{ actor: { did: 'a', handle: 'a.test' } }], cursor: 'next' })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({}));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    expect((await getImport(env, imported.id))?.status).toBe('failed');
    await expect(createYouTubeDraw(env, imported.id, false)).rejects.toThrow('not ready');
  });
  it('lets rate-limited API pages retry without storing partial results', async () => {
    const { env, jobs } = fixture(); vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({}));
    await expect(processSocialImport(jobs.shift()!, env)).rejects.toBeInstanceOf(ProviderRequestError);
    expect((await getImport(env, imported.id))?.progress_current).toBe(0);
  });
  it('rejects cursor loops and caps oversized imports', async () => {
    const { env, jobs } = fixture('100');
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => response({ likes: Array.from({ length: 100 }, (_, i) => ({ actor: { did: `${url.searchParams.get('cursor')}-${i}`, handle: 'a.test' } })), cursor: 'next' })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({}));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    expect((await getImport(env, imported.id))?.status).toBe('failed');
  });
  it('keeps eligibility when a later comment matches the keyword', () => {
    const comment = { providerUserId: 'a', providerCommentId: '1', text: 'bonjour', isReply: false };
    const participants = createParticipants([comment, { ...comment, providerCommentId: '2', text: 'concours' }], normalizeRules({ requiredKeyword: 'concours' }), getProviderCapabilities('youtube'));
    expect(participants[0]).toMatchObject({ eligible: true, entriesCount: 1, reasons: [] });
  });
  it('moves through multiple parents and ends only after the final response', () => {
    const job: SocialImportJob = { provider: 'youtube', importId: 'i', phase: 'replies', parentIds: ['a', 'b'], nextThreadToken: 'thread' };
    expect(nextYouTubeJob(job)).toMatchObject({ parentIds: ['b'] });
    expect(nextYouTubeJob({ ...job, parentIds: ['b'] })).toEqual({ provider: 'youtube', importId: 'i', pageToken: 'thread' });
    expect(nextYouTubeJob({ ...job, parentIds: ['b'], nextThreadToken: undefined })).toBeUndefined();
  });
  it('protects imports by session and rejects unsupported Bluesky conditions', async () => {
    const { env, jobs } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => response({ posts: [{ uri: 'at://did:plc:a/app.bsky.feed.post/abc', author: { did: 'did:plc:a', handle: 'a.test' }, record: { text: 'Post' } }] })));
    const bad = await worker.fetch(new Request('https://example.test/v1/bluesky/imports', { method: 'POST', body: JSON.stringify({ url: 'https://bsky.app/profile/did:plc:a/post/abc', rules: { interaction: 'likes', includeReplies: true } }) }), env);
    expect(bad.status).toBe(400); expect(jobs).toHaveLength(0);
    const imported = await queueSocialImport(env, 'private-session', publication, normalizeRules({}));
    const foreign = await worker.fetch(new Request(`https://example.test/v1/imports/${imported.id}`), env);
    expect(foreign.status).toBe(404);
  });
  it('purges checkpoints together with expired imports', async () => {
    const { env, jobs, sqlite } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => response({ likes: [] })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({}));
    await processSocialImport(jobs.shift()!, env);
    sqlite.prepare('UPDATE contest_imports SET expires_at = ? WHERE id = ?').run('2000-01-01', imported.id);
    await purgeExpiredData(env);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM contest_import_pages').get()?.n).toBe(0);
    expect(await getImport(env, imported.id)).toBeNull();
  });
});

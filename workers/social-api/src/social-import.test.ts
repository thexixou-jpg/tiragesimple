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
import { getMastodonPublication, parseMastodonUrl } from './mastodon';
import { getLemmyPublication, parseLemmyUrl } from './lemmy';
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
  const env = { BLUESKY_ENABLED: 'true', MASTODON_ENABLED: 'true', MASTODON_ALLOWED_HOSTS: 'mastodon.social,piaille.fr', LEMMY_ENABLED: 'true', LEMMY_ALLOWED_HOSTS: 'lemmy.world,jlai.lu', YOUTUBE_ENABLED: 'true', YOUTUBE_API_KEY: 'test-key', SESSION_SIGNING_SECRET: 'test-session-secret', MAX_PARTICIPANTS: maximum,
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
  it('accepts only allowlisted Lemmy post URLs', () => {
    const env = { LEMMY_ALLOWED_HOSTS: 'lemmy.world,jlai.lu' };
    expect(parseLemmyUrl('https://jlai.lu/post/42794207', env)).toEqual({ host: 'jlai.lu', postId: '42794207' });
    for (const url of ['https://evil.test/post/1', 'http://jlai.lu/post/1', 'https://user:pass@jlai.lu/post/1', 'https://jlai.lu.evil.test/post/1', 'https://jlai.lu/post/../api', 'https://jlai.lu/c/france']) expect(parseLemmyUrl(url, env)).toBeNull();
  });
  it('loads a public Lemmy post through the fixed v3 API endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.origin).toBe('https://jlai.lu'); expect(url.pathname).toBe('/api/v3/post'); expect(url.searchParams.get('id')).toBe('42'); expect(init?.redirect).toBe('manual');
      return response({ post_view: { post: { id: 42, name: 'Concours public', creator_id: 7, published: '2026-08-31T12:00:00Z', ap_id: 'https://jlai.lu/post/42' }, creator: { id: 7, name: 'alice', display_name: 'Alice', actor_id: 'https://jlai.lu/u/alice' } } });
    }));
    const post = await getLemmyPublication('https://jlai.lu/post/42', { LEMMY_ENABLED: 'true', LEMMY_ALLOWED_HOSTS: 'jlai.lu' });
    expect(post).toMatchObject({ provider: 'lemmy', providerPublicationId: 'jlai.lu|42', authorProviderId: 'https://jlai.lu/u/alice', authorName: 'Alice', title: 'Concours public' });
  });
  it('paginates Lemmy comments and deduplicates people by ActivityPub identity', async () => {
    const { env, jobs } = fixture();
    const comment = (id: number, actor = 'https://remote.test/u/stable', path = `0.${id}`) => ({ comment: { id, content: 'concours', path, ap_id: `https://jlai.lu/comment/${id}` }, creator: { id, name: 'participant', actor_id: actor } });
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      expect(url.origin).toBe('https://jlai.lu'); expect(url.pathname).toBe('/api/v3/comment/list');
      return response(url.searchParams.get('page') === '2'
        ? { comments: [comment(51, 'https://jlai.lu/u/owner'), comment(52, 'https://remote.test/u/reply', '0.1.52')] }
        : { comments: Array.from({ length: 50 }, (_, index) => comment(index + 1)) });
    }));
    const imported = await queueSocialImport(env, 'session', { provider: 'lemmy', providerPublicationId: 'jlai.lu|42', canonicalUrl: 'https://jlai.lu/post/42', authorProviderId: 'https://jlai.lu/u/owner' }, normalizeRules({ requiredKeyword: 'concours', includeReplies: false }));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    expect(await getImport(env, imported.id)).toMatchObject({ status: 'ready', progress_current: 52, participant_count: 1 });
    expect((await listEligibleParticipants(env, imported.id))[0]).toMatchObject({ providerUserId: 'https://remote.test/u/stable', username: 'participant@remote.test', entriesCount: 1 });
  });
  it('accepts only allowlisted Mastodon status URLs', () => {
    const env = { MASTODON_ALLOWED_HOSTS: 'mastodon.social,piaille.fr' };
    expect(parseMastodonUrl('https://mastodon.social/@alice/114123', env)).toEqual({ host: 'mastodon.social', statusId: '114123' });
    expect(parseMastodonUrl('https://mastodon.social/%40alice/114123', env)).toEqual({ host: 'mastodon.social', statusId: '114123' });
    expect(parseMastodonUrl('https://piaille.fr/users/alice/statuses/abc_123', env)).toEqual({ host: 'piaille.fr', statusId: 'abc_123' });
    for (const url of ['https://evil.test/@alice/1', 'http://mastodon.social/@alice/1', 'https://user:pass@mastodon.social/@alice/1', 'https://mastodon.social.evil.test/@alice/1', 'https://127.0.0.1/@alice/1', 'https://mastodon.social/@alice/../api']) expect(parseMastodonUrl(url, env)).toBeNull();
  });
  it('loads a public Mastodon post without following redirects or arbitrary hosts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.origin).toBe('https://mastodon.social'); expect(init?.redirect).toBe('manual');
      return response({ id: '114123', uri: 'https://mastodon.social/users/alice/statuses/114123', url: 'https://mastodon.social/@alice/114123', content: '<p>Mon &amp; concours<br>public</p>', created_at: '2026-08-31T12:00:00Z', visibility: 'public', account: { id: '1', acct: 'alice', display_name: 'Alice', uri: 'https://mastodon.social/users/alice' } });
    }));
    const post = await getMastodonPublication('https://mastodon.social/@alice/114123', { MASTODON_ENABLED: 'true', MASTODON_ALLOWED_HOSTS: 'mastodon.social' });
    expect(post).toMatchObject({ provider: 'mastodon', providerPublicationId: 'mastodon.social|114123', authorProviderId: 'https://mastodon.social/users/alice', title: 'Mon & concours\npublic' });
  });
  it('paginates Mastodon favourites from trusted Link headers and deduplicates ActivityPub accounts', async () => {
    const { env, jobs } = fixture();
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      expect(url.origin).toBe('https://mastodon.social');
      if (url.searchParams.has('max_id')) return response([{ id: '2', acct: 'renamed@remote.test', display_name: 'Renamed', uri: 'https://remote.test/users/stable' }, { id: '3', acct: 'bob', uri: 'https://mastodon.social/users/bob' }]);
      return new Response(JSON.stringify([{ id: '1', acct: 'old@remote.test', uri: 'https://remote.test/users/stable' }, { id: '4', acct: 'owner', uri: 'https://mastodon.social/users/owner' }]), { headers: { 'content-type': 'application/json', link: '<https://mastodon.social/api/v1/statuses/114123/favourited_by?limit=80&max_id=next_2>; rel="next"' } });
    }));
    const imported = await queueSocialImport(env, 'session', { provider: 'mastodon', providerPublicationId: 'mastodon.social|114123', canonicalUrl: 'https://mastodon.social/@owner/114123', authorProviderId: 'https://mastodon.social/users/owner' }, normalizeRules({ interaction: 'likes' }));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    expect(await getImport(env, imported.id)).toMatchObject({ status: 'ready', progress_current: 4, participant_count: 2 });
    expect((await listEligibleParticipants(env, imported.id)).map(item => item.providerUserId)).toEqual(['https://mastodon.social/users/bob', 'https://remote.test/users/stable']);
  });
  it('ignores an untrusted Mastodon pagination host instead of fetching it', async () => {
    const { env, jobs } = fixture();
    const mocked = vi.fn(async () => new Response(JSON.stringify([{ id: '1', acct: 'alice', uri: 'https://mastodon.social/users/alice' }]), { headers: { 'content-type': 'application/json', link: '<https://evil.test/api/v1/statuses/1/favourited_by?max_id=x>; rel="next"' } }));
    vi.stubGlobal('fetch', mocked);
    const imported = await queueSocialImport(env, 'session', { provider: 'mastodon', providerPublicationId: 'mastodon.social|1', canonicalUrl: 'https://mastodon.social/@owner/1' }, normalizeRules({ interaction: 'likes' }));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    expect(mocked).toHaveBeenCalledTimes(1); expect((await getImport(env, imported.id))?.status).toBe('ready');
  });
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
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky', title: '<script>alert(1)</script>' }, normalizeRules({ interaction: 'reposts', alternateCount: 1, excludedUsers: ['private-exclusion.test'] }));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    const participants = await listEligibleParticipants(env, imported.id);
    expect(participants.map(p => p.entriesCount)).toEqual([1, 1]);
    const draw = await createYouTubeDraw(env, imported.id, true);
    expect(draw.winners).toHaveLength(1); expect(draw.alternates).toHaveLength(1);
    expect(draw.winners[0].providerUserId).not.toBe(draw.alternates[0].providerUserId);
    expect(draw.publicUrl).toContain('https://example.test/tirage/');
    expect(draw.receipt).toMatchObject({ version: 1, id: draw.publicId, platform: 'bluesky', analyzedCount: 4, participantCount: 2 });
    expect(draw.receipt.rulesSummary.join('\n')).toContain('Participation via un repost');
    expect(draw.receipt.proof).toEqual({ participantSnapshotHash: draw.participantSnapshotHash, randomCommitmentHash: draw.randomCommitmentHash, verificationSeed: draw.verificationSeed, resultHash: draw.resultHash });
    expect(JSON.stringify(draw.receipt)).not.toContain('private-exclusion.test');
    expect(JSON.stringify(draw.receipt)).not.toContain('providerUserId');
    const publicResponse = await worker.fetch(new Request(`https://example.test/v1/draws/${draw.publicId}`), env);
    const publicPayload = await publicResponse.json() as { draw: { rules: Record<string, unknown> } };
    expect(publicPayload.draw.rules).not.toHaveProperty('excludedUsers');
    expect(publicPayload.draw.rules).toHaveProperty('excludedAccountCount', 1);
    expect(publicPayload.draw).toMatchObject({ participantCount: 2, analyzedCount: 4 });
    expect(JSON.stringify(publicPayload)).not.toContain('private-exclusion.test');
    const page = await worker.fetch(new Request(draw.publicUrl!), env);
    const html = await page.text();
    expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(html).toContain('Participation via un repost');
    expect(html).toContain('comptes éligibles');
    expect(html).toContain('Empreintes techniques du reçu');
    expect(html).toContain(draw.participantSnapshotHash);
    expect(html).toContain(draw.randomCommitmentHash);
    expect(html).toContain(draw.verificationSeed);
    expect(html).toContain(draw.resultHash);
    expect(html).toContain(`/_tiragesimple/v1/draws/${draw.publicId}`);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('private-exclusion.test');
    expect(html.indexOf('Gagnant 1')).toBeLessThan(html.indexOf('Suppléant 1'));
  });
  it('rejects insufficient distinct accounts without saving a shortened draw', async () => {
    const { env, jobs, sqlite } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => response({ likes: [{ actor: { did: 'a', handle: 'a.test' } }] })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({ winnerCount: 1, alternateCount: 1 }));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    await expect(createYouTubeDraw(env, imported.id, false)).rejects.toThrow('Participants insuffisants');
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM contest_draws').get()?.n).toBe(0);
  });
  it('never draws from an expired import even before scheduled cleanup', async () => {
    const { env, jobs, sqlite } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => response({ likes: [{ actor: { did: 'a', handle: 'a.test' } }] })));
    const imported = await queueSocialImport(env, 'session', { ...publication, provider: 'bluesky' }, normalizeRules({}));
    while (jobs.length) await processSocialImport(jobs.shift()!, env);
    sqlite.prepare('UPDATE contest_imports SET expires_at = ? WHERE id = ?').run('2000-01-01', imported.id);
    await expect(createYouTubeDraw(env, imported.id, false)).rejects.toThrow('expiré');
  });
  it('excludes YouTube channels by exact ID, independently of their display name', () => {
    const rules = normalizeRules({ excludedUsers: ['UCabcdefghijklmnopqrstuv', 'UCabcdefghijklmnopqrstuv'] });
    expect(rules.excludedUsers).toHaveLength(1);
    const comment = { providerUserId: 'UCabcdefghijklmnopqrstuv', providerCommentId: '1', displayName: 'Même nom', text: '', isReply: false };
    const participants = createParticipants([comment, { ...comment, providerUserId: 'UCAbcdefghijklmnopqrstuv', providerCommentId: '2' }], rules, getProviderCapabilities('youtube'));
    expect(participants.map(p => p.eligible)).toEqual([false, true]);
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

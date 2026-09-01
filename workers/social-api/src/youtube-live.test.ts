import { afterEach, describe, expect, it, vi } from 'vitest';
import { getYouTubeLiveChatSnapshot, getYouTubeLivePublication } from './youtube-live';
import type { Env } from './types';

const env = { YOUTUBE_ENABLED: 'true', YOUTUBE_API_KEY: 'test-key' } as Env;
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('YouTube Live provider', () => {
  it('accepts only a live video with an active chat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ id: 'abcdefghijk', snippet: { channelId: 'UC123', channelTitle: 'Studio', title: 'Direct concours', publishedAt: '2026-09-01T17:00:00Z', thumbnails: { high: { url: 'https://img.youtube.com/live.jpg' } } }, liveStreamingDetails: { activeLiveChatId: 'chat-123', actualStartTime: '2026-09-01T18:00:00Z' } }] })));
    const publication = await getYouTubeLivePublication('https://www.youtube.com/watch?v=abcdefghijk', env);
    expect(publication).toMatchObject({ provider: 'youtube_live', providerPublicationId: 'abcdefghijk|chat-123', authorProviderId: 'UC123', title: 'Direct concours' });
  });

  it('rejects a replay without an active chat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [{ id: 'abcdefghijk', snippet: { channelId: 'UC123', channelTitle: 'Studio', title: 'Replay', publishedAt: '2026-09-01T17:00:00Z' }, liveStreamingDetails: { actualEndTime: '2026-09-01T19:00:00Z' } }] })));
    await expect(getYouTubeLivePublication('https://youtu.be/abcdefghijk', env)).rejects.toThrow('direct doit être public');
  });

  it('keeps text messages with stable channel IDs and ignores paid events', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ items: [
      { id: 'm1', snippet: { type: 'textMessageEvent', publishedAt: '2026-09-01T18:01:00Z', displayMessage: '!concours bonjour' }, authorDetails: { channelId: 'UCviewer1', displayName: 'Alice', channelUrl: 'https://youtube.com/channel/UCviewer1' } },
      { id: 'm2', snippet: { type: 'superChatEvent', publishedAt: '2026-09-01T18:02:00Z', displayMessage: '10 €' }, authorDetails: { channelId: 'UCviewer2', displayName: 'Bob' } },
      { id: 'm3', snippet: { type: 'textMessageEvent', publishedAt: '2026-09-01T18:03:00Z', textMessageDetails: { messageText: '!concours encore' } }, authorDetails: { channelId: 'UCviewer1', displayName: 'Alice' } },
    ] })));
    const snapshot = await getYouTubeLiveChatSnapshot('abcdefghijk|chat-123', env);
    expect(snapshot.totalResults).toBe(3);
    expect(snapshot.comments).toHaveLength(2);
    expect(snapshot.comments.map(comment => comment.providerUserId)).toEqual(['UCviewer1', 'UCviewer1']);
  });
});

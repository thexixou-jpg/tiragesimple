import { describe, expect, it } from 'vitest';
import { parseSoundCloudUrl, soundCloudComment } from './soundcloud';

describe('parseSoundCloudUrl', () => {
  it('accepts canonical tracks and official short links', () => {
    expect(parseSoundCloudUrl('https://soundcloud.com/artist-name/track-name')?.hostname).toBe('soundcloud.com');
    expect(parseSoundCloudUrl('https://on.soundcloud.com/AbC_123')?.hostname).toBe('on.soundcloud.com');
  });
  it('rejects profiles, sets and foreign links', () => {
    expect(parseSoundCloudUrl('https://soundcloud.com/artist')).toBeNull();
    expect(parseSoundCloudUrl('https://soundcloud.com/artist/sets/list')).toBeNull();
    expect(parseSoundCloudUrl('https://example.com/artist/track')).toBeNull();
  });
});

describe('soundCloudComment', () => {
  it('uses stable URNs and normalized account data', () => expect(soundCloudComment({
    urn: 'soundcloud:comments:9', body: 'Concours', track_urn: 'soundcloud:tracks:7', created_at: '2026-01-01T00:00:00Z',
    user: { urn: 'soundcloud:users:4', username: 'Alice', permalink: 'alice-music' },
  }, 'soundcloud:tracks:7')).toEqual({ providerCommentId: 'soundcloud:comments:9', providerUserId: 'soundcloud:users:4', username: 'alice-music', displayName: 'Alice', text: 'Concours', isReply: false, createdAt: '2026-01-01T00:00:00Z' }));
  it('rejects comments without a stable user or from another track', () => {
    expect(soundCloudComment({ urn: 'soundcloud:comments:9', body: 'x', track_urn: 'soundcloud:tracks:7' }, 'soundcloud:tracks:7')).toBeUndefined();
    expect(soundCloudComment({ urn: 'soundcloud:comments:9', body: 'x', track_urn: 'soundcloud:tracks:8', user_urn: 'soundcloud:users:4' }, 'soundcloud:tracks:7')).toBeUndefined();
  });
});

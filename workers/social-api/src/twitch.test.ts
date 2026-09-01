import { describe, expect, it } from 'vitest';
import { completeTwitchOAuth, parseTwitchChannel, twitchOAuthUrl } from './twitch';
import type { Env } from './types';

const env = { TWITCH_ENABLED: 'true', TWITCH_CLIENT_ID: 'client-id', TWITCH_CLIENT_SECRET: 'secret', TWITCH_REDIRECT_URI: 'https://tiragesimple.fr/_tiragesimple/v1/twitch/oauth/callback', DATA_ENCRYPTION_KEY: 'encryption-secret', SESSION_SIGNING_SECRET: 'session-secret', DB: {} } as Env;

describe('Twitch official connector', () => {
  it('accepts a channel login or canonical Twitch URL only', () => {
    expect(parseTwitchChannel('TwitchDev')).toBe('twitchdev');
    expect(parseTwitchChannel('https://www.twitch.tv/TwitchDev')).toBe('twitchdev');
    expect(parseTwitchChannel('https://example.com/TwitchDev')).toBeNull();
    expect(parseTwitchChannel('https://twitch.tv/directory/category/games')).toBeNull();
  });

  it('builds an OAuth request with the minimum chatter scope', async () => {
    const url = new URL(await twitchOAuthUrl(env, 'session-id'));
    expect(url.origin).toBe('https://id.twitch.tv');
    expect(url.searchParams.get('scope')).toBe('moderator:read:chatters');
    expect(url.searchParams.get('redirect_uri')).toBe(env.TWITCH_REDIRECT_URI);
    expect(url.searchParams.get('state')).toMatch(/^\d+\.[\w-]+\.[\w-]+$/u);
  });

  it('rejects a forged OAuth state before exchanging a token', async () => {
    await expect(completeTwitchOAuth(env, 'session-id', `${Math.floor(Date.now() / 1000)}.nonce.forged`, 'code')).rejects.toThrow('expirée ou invalide');
  });
});

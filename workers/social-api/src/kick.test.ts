import { describe, expect, it } from 'vitest';
import { completeKickOAuth, kickOAuthUrl, receiveKickWebhook } from './kick';
import type { Env } from './types';

const env = { KICK_ENABLED: 'true', KICK_CLIENT_ID: 'client-id', KICK_CLIENT_SECRET: 'secret', KICK_REDIRECT_URI: 'https://tiragesimple.fr/_tiragesimple/v1/kick/oauth/callback', DATA_ENCRYPTION_KEY: 'encryption-secret', SESSION_SIGNING_SECRET: 'session-secret', DB: {} } as Env;

describe('Kick official connector', () => {
  it('builds an OAuth 2.1 authorization URL with PKCE and minimum scopes', async () => {
    const url = new URL(await kickOAuthUrl(env, 'session-id'));
    expect(url.origin).toBe('https://id.kick.com');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(url.searchParams.get('scope')).toBe('user:read channel:read events:subscribe');
  });

  it('rejects a forged OAuth state before exchanging any code', async () => {
    const verifier = 'a'.repeat(43);
    await expect(completeKickOAuth(env, 'session-id', `${Math.floor(Date.now() / 1000)}.nonce.${verifier}.forged`, 'code')).rejects.toThrow('expirée ou invalide');
  });

  it('rejects unsigned webhook requests', async () => {
    const request = new Request('https://example.test/v1/kick/webhook', { method: 'POST', body: '{}' });
    expect((await receiveKickWebhook(request, env)).status).toBe(400);
  });
});

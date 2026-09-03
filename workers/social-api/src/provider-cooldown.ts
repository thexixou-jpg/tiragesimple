import type { Env } from './types';

export async function providerCooldown(env: Env, provider: string): Promise<number> {
  if (!env.DB) return 0;
  const row = await env.DB.prepare('SELECT retry_at FROM provider_cooldowns WHERE provider = ?').bind(provider).first<{retry_at:number}>();
  return row && row.retry_at > Date.now() ? row.retry_at : 0;
}

export async function saveProviderCooldown(env: Env, provider: string, seconds: number): Promise<void> {
  if (!env.DB || !Number.isSafeInteger(seconds) || seconds < 1) return;
  await env.DB.prepare('INSERT INTO provider_cooldowns (provider, retry_at) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET retry_at = MAX(retry_at, excluded.retry_at)')
    .bind(provider, Date.now() + seconds * 1000).run();
}

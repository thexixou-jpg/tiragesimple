import type { Env, ProviderCapabilities, ProviderId } from './types';

export const providerCapabilities: Record<ProviderId, ProviderCapabilities> = {
  youtube: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  instagram: { comments: true, likes: false, reposts: false, mentions: true, followers: false, replies: true },
  facebook: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  x: { comments: false, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  tiktok: { comments: false, likes: false, reposts: false, mentions: false, followers: false, replies: false },
};

export function getProviderCapabilities(provider: ProviderId): ProviderCapabilities {
  return providerCapabilities[provider];
}

export function providerStatus(env: Env): Record<ProviderId, string> {
  return {
    youtube: env.YOUTUBE_ENABLED === 'true' && Boolean(env.YOUTUBE_API_KEY) ? 'enabled' : 'beta',
    instagram: 'limited', facebook: 'limited', x: 'disabled', tiktok: 'unsupported',
  };
}

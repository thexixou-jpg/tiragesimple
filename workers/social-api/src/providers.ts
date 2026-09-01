import type { Env, ProviderCapabilities, ProviderId } from './types';

export const providerCapabilities: Record<ProviderId, ProviderCapabilities> = {
  youtube: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  youtube_live: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  twitch: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  bluesky: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  mastodon: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  lemmy: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  github: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  stackexchange: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
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
    youtube_live: env.YOUTUBE_ENABLED === 'true' && Boolean(env.YOUTUBE_API_KEY) && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'beta',
    twitch: env.TWITCH_ENABLED === 'true' && Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.TWITCH_REDIRECT_URI && env.DATA_ENCRYPTION_KEY && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    bluesky: env.BLUESKY_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    mastodon: env.MASTODON_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    lemmy: env.LEMMY_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    github: env.GITHUB_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    stackexchange: env.STACKEXCHANGE_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    instagram: 'limited', facebook: 'limited', x: 'disabled', tiktok: 'unsupported',
  };
}

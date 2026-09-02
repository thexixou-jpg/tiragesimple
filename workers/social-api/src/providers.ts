import type { Env, ProviderCapabilities, ProviderId } from './types';

export const providerCapabilities: Record<ProviderId, ProviderCapabilities> = {
  youtube: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  youtube_live: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  vimeo: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  soundcloud: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  mixcloud: { comments: true, likes: true, reposts: false, mentions: false, followers: false, replies: false },
  peertube: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  twitch: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  kick: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  trovo: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  discord: { comments: false, likes: true, reposts: false, mentions: false, followers: false, replies: false },
  bluesky: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  mastodon: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  pixelfed: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  lemmy: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  reddit: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  github: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  gitlab: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  bitbucket: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  devto: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  hackernews: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  stackexchange: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  wordpress: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
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
    vimeo: env.VIMEO_ENABLED === 'true' && Boolean(env.VIMEO_CLIENT_ID && env.VIMEO_CLIENT_SECRET && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    soundcloud: env.SOUNDCLOUD_ENABLED === 'true' && Boolean(env.SOUNDCLOUD_CLIENT_ID && env.SOUNDCLOUD_CLIENT_SECRET && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    mixcloud: env.MIXCLOUD_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    peertube: env.PEERTUBE_ENABLED === 'true' && Boolean(env.PEERTUBE_ALLOWED_HOSTS && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    twitch: env.TWITCH_ENABLED === 'true' && Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET && env.TWITCH_REDIRECT_URI && env.DATA_ENCRYPTION_KEY && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    kick: env.KICK_ENABLED === 'true' && Boolean(env.KICK_CLIENT_ID && env.KICK_CLIENT_SECRET && env.KICK_REDIRECT_URI && env.DATA_ENCRYPTION_KEY && env.DB) ? 'enabled' : 'setup_required',
    trovo: env.TROVO_ENABLED === 'true' && Boolean(env.TROVO_CLIENT_ID && env.DB) ? 'enabled' : 'setup_required',
    discord: env.DISCORD_ENABLED === 'true' && Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_BOT_TOKEN && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    bluesky: env.BLUESKY_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    mastodon: env.MASTODON_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    pixelfed: env.PIXELFED_ENABLED === 'true' && Boolean(env.PIXELFED_REDIRECT_URI && env.DATA_ENCRYPTION_KEY && env.SESSION_SIGNING_SECRET && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    lemmy: env.LEMMY_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    reddit: env.REDDIT_ENABLED === 'true' && Boolean(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_USER_AGENT && env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'setup_required',
    github: env.GITHUB_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    gitlab: env.GITLAB_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    bitbucket: env.BITBUCKET_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    devto: env.DEVTO_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    hackernews: env.HACKERNEWS_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    stackexchange: env.STACKEXCHANGE_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    wordpress: env.WORDPRESS_ENABLED === 'true' && Boolean(env.DB && env.SOCIAL_IMPORT_QUEUE) ? 'enabled' : 'disabled',
    instagram: 'limited', facebook: 'limited', x: 'disabled', tiktok: 'unsupported',
  };
}

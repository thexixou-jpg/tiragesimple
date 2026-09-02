export type ProviderId = 'youtube' | 'youtube_live' | 'vimeo' | 'soundcloud' | 'mixcloud' | 'twitch' | 'kick' | 'trovo' | 'discord' | 'bluesky' | 'mastodon' | 'lemmy' | 'reddit' | 'github' | 'gitlab' | 'stackexchange' | 'instagram' | 'facebook' | 'x' | 'tiktok';

export interface ContestRules {
  winnerCount: number;
  alternateCount: number;
  uniqueParticipants: boolean;
  duplicateEntries: boolean;
  excludedUsers: string[];
  requiredKeyword?: string;
  minimumMentions?: number;
  includeReplies: boolean;
  excludePublicationAuthor: boolean;
  interaction?: 'likes' | 'reposts' | 'answers' | 'comments' | 'listeners' | 'livechat' | 'chatters';
  clientSourced?: boolean;
  providerInteractionId?: string;
}

export interface ProviderCapabilities {
  comments: boolean;
  likes: boolean;
  reposts: boolean;
  mentions: boolean;
  followers: boolean;
  replies: boolean;
}

export interface SocialPublication {
  provider: ProviderId;
  providerPublicationId: string;
  canonicalUrl: string;
  authorProviderId?: string;
  authorName?: string;
  title?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
}

export interface SocialComment {
  providerCommentId: string;
  providerUserId: string;
  username?: string;
  displayName?: string;
  text: string;
  isReply: boolean;
  createdAt?: string;
}

export interface Participant {
  providerUserId: string;
  username?: string;
  displayName?: string;
  entriesCount: number;
  eligible: boolean;
  reasons: string[];
}

export interface Env {
  YOUTUBE_ENABLED?: string;
  BLUESKY_ENABLED?: string;
  MASTODON_ENABLED?: string;
  MASTODON_ALLOWED_HOSTS?: string;
  LEMMY_ENABLED?: string;
  LEMMY_ALLOWED_HOSTS?: string;
  REDDIT_ENABLED?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
  GITHUB_ENABLED?: string;
  GITHUB_API_TOKEN?: string;
  GITLAB_ENABLED?: string;
  GITLAB_API_TOKEN?: string;
  STACKEXCHANGE_ENABLED?: string;
  STACKEXCHANGE_API_KEY?: string;
  YOUTUBE_API_KEY?: string;
  VIMEO_ENABLED?: string;
  VIMEO_CLIENT_ID?: string;
  VIMEO_CLIENT_SECRET?: string;
  SOUNDCLOUD_ENABLED?: string;
  SOUNDCLOUD_CLIENT_ID?: string;
  SOUNDCLOUD_CLIENT_SECRET?: string;
  MIXCLOUD_ENABLED?: string;
  TWITCH_ENABLED?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  TWITCH_REDIRECT_URI?: string;
  KICK_ENABLED?: string;
  KICK_CLIENT_ID?: string;
  KICK_CLIENT_SECRET?: string;
  KICK_REDIRECT_URI?: string;
  TROVO_ENABLED?: string;
  TROVO_CLIENT_ID?: string;
  DISCORD_ENABLED?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DATA_ENCRYPTION_KEY?: string;
  ALLOWED_ORIGIN?: string;
  PUBLIC_SITE_URL?: string;
  MAX_PARTICIPANTS?: string;
  RETENTION_DAYS?: string;
  SESSION_SIGNING_SECRET?: string;
  DB?: D1Database;
  SOCIAL_IMPORT_QUEUE?: Queue<SocialImportJob>;
}

export interface SocialImportJob {
  provider: ProviderId;
  importId: string;
  pageToken?: string;
  phase?: 'replies';
  parentIds?: string[];
  nextThreadToken?: string;
}

export type ProviderId = 'youtube' | 'youtube_live' | 'bluesky' | 'mastodon' | 'lemmy' | 'github' | 'stackexchange' | 'instagram' | 'facebook' | 'x' | 'tiktok';

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
  interaction?: 'likes' | 'reposts' | 'answers' | 'comments' | 'livechat';
  clientSourced?: boolean;
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
  GITHUB_ENABLED?: string;
  GITHUB_API_TOKEN?: string;
  STACKEXCHANGE_ENABLED?: string;
  STACKEXCHANGE_API_KEY?: string;
  YOUTUBE_API_KEY?: string;
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

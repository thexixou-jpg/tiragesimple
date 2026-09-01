import type { Env, SocialComment, SocialPublication } from './types';
import { providerJson } from './provider-http';
import { getYouTubeVideoId } from './youtube';

interface LiveVideoResponse {
  items?: Array<{
    id: string;
    snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string; thumbnails?: { high?: { url: string }; default?: { url: string } } };
    liveStreamingDetails?: { activeLiveChatId?: string; actualStartTime?: string; actualEndTime?: string };
  }>;
}

interface LiveChatResponse {
  items?: Array<{
    id: string;
    snippet: { type: string; publishedAt: string; displayMessage?: string; textMessageDetails?: { messageText?: string } };
    authorDetails?: { channelId?: string; channelUrl?: string; displayName?: string; isChatOwner?: boolean };
  }>;
  pageInfo?: { totalResults?: number };
  pollingIntervalMillis?: number;
}

function apiKey(env: Env): string {
  if (env.YOUTUBE_ENABLED !== 'true' || !env.YOUTUBE_API_KEY) throw new Error('YouTube Live is not enabled');
  return env.YOUTUBE_API_KEY;
}

export async function getYouTubeLivePublication(url: string, env: Env): Promise<SocialPublication> {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) throw new Error('Utilisez l’URL d’un direct YouTube public.');
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
  endpoint.search = new URLSearchParams({ part: 'snippet,liveStreamingDetails', id: videoId, key: apiKey(env) }).toString();
  const payload = await providerJson<LiveVideoResponse>(endpoint);
  const video = payload.items?.[0];
  if (!video) throw new Error('Ce direct YouTube est introuvable ou privé.');
  const chatId = video.liveStreamingDetails?.activeLiveChatId;
  if (!chatId || video.liveStreamingDetails?.actualEndTime) throw new Error('Le chat n’est pas accessible : le direct doit être public, en cours et son chat activé.');
  return {
    provider: 'youtube_live', providerPublicationId: `${video.id}|${chatId}`, canonicalUrl: `https://www.youtube.com/watch?v=${video.id}`,
    authorProviderId: video.snippet.channelId, authorName: video.snippet.channelTitle, title: video.snippet.title,
    thumbnailUrl: video.snippet.thumbnails?.high?.url ?? video.snippet.thumbnails?.default?.url,
    publishedAt: video.liveStreamingDetails?.actualStartTime ?? video.snippet.publishedAt,
  };
}

export async function getYouTubeLiveChatSnapshot(providerPublicationId: string, env: Env): Promise<{ comments: SocialComment[]; totalResults: number }> {
  const separator = providerPublicationId.indexOf('|');
  const liveChatId = separator > 0 ? providerPublicationId.slice(separator + 1) : '';
  if (!liveChatId) throw new Error('Identifiant de chat YouTube Live invalide.');
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
  endpoint.search = new URLSearchParams({ part: 'snippet,authorDetails', liveChatId, maxResults: '2000', key: apiKey(env) }).toString();
  const payload = await providerJson<LiveChatResponse>(endpoint);
  const comments: SocialComment[] = [];
  for (const item of payload.items ?? []) {
    if (item.snippet.type !== 'textMessageEvent' || !item.authorDetails?.channelId) continue;
    comments.push({
      providerCommentId: item.id,
      providerUserId: item.authorDetails.channelId,
      username: item.authorDetails.channelUrl?.split('/').filter(Boolean).pop(),
      displayName: item.authorDetails.displayName,
      text: item.snippet.textMessageDetails?.messageText ?? item.snippet.displayMessage ?? '',
      isReply: false,
      createdAt: item.snippet.publishedAt,
    });
  }
  return { comments, totalResults: payload.items?.length ?? 0 };
}

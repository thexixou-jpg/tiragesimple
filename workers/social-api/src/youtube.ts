import type { Env, SocialComment, SocialPublication } from './types';

const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

interface YouTubeAuthorSnippet {
  authorChannelId?: { value: string };
  authorDisplayName: string;
  authorChannelUrl?: string;
  textDisplay: string;
  publishedAt: string;
}

interface YouTubeComment {
  id: string;
  snippet: YouTubeAuthorSnippet;
}

interface YouTubeCommentThreadResponse {
  nextPageToken?: string;
  pageInfo: { totalResults: number };
  items: Array<{ snippet: { topLevelComment: YouTubeComment }; replies?: { comments: YouTubeComment[] } }>;
}

interface YouTubeVideoResponse {
  items?: Array<{ id: string; snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string; thumbnails?: { high?: { url: string }; default?: { url: string } } } }>;
}

export function getYouTubeVideoId(input: string): string | null {
  try {
    const url = new URL(input);
    if (!youtubeHosts.has(url.hostname)) return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1).split('/')[0] : url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

function assertEnabled(env: Env): string {
  if (env.YOUTUBE_ENABLED !== 'true' || !env.YOUTUBE_API_KEY) throw new Error('YouTube is not enabled');
  return env.YOUTUBE_API_KEY;
}

export async function getYouTubePublication(url: string, env: Env): Promise<SocialPublication> {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) throw new Error('Invalid YouTube video or Short URL');
  const key = assertEnabled(env);
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
  endpoint.search = new URLSearchParams({ part: 'snippet', id: videoId, key }).toString();
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`YouTube request failed (${response.status})`);
  const payload = await response.json() as YouTubeVideoResponse;
  const video = payload.items?.[0];
  if (!video) throw new Error('YouTube video not found or private');
  return {
    provider: 'youtube', providerPublicationId: video.id, canonicalUrl: `https://www.youtube.com/watch?v=${video.id}`,
    authorProviderId: video.snippet.channelId, authorName: video.snippet.channelTitle, title: video.snippet.title,
    thumbnailUrl: video.snippet.thumbnails?.high?.url ?? video.snippet.thumbnails?.default?.url, publishedAt: video.snippet.publishedAt,
  };
}

export async function getYouTubeCommentPage(videoId: string, pageToken: string | undefined, includeReplies: boolean, env: Env): Promise<{ comments: SocialComment[]; nextPageToken?: string; totalResults: number }> {
  const key = assertEnabled(env);
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
  endpoint.search = new URLSearchParams({ part: includeReplies ? 'snippet,replies' : 'snippet', videoId, maxResults: '100', textFormat: 'plainText', key, ...(pageToken ? { pageToken } : {}) }).toString();
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`YouTube comments request failed (${response.status})`);
  const payload = await response.json() as YouTubeCommentThreadResponse;
  const comments: SocialComment[] = [];
  for (const thread of payload.items) {
    const top = thread.snippet.topLevelComment;
    const authorId = top.snippet.authorChannelId?.value;
    if (authorId) comments.push({ providerCommentId: top.id, providerUserId: authorId, displayName: top.snippet.authorDisplayName, username: top.snippet.authorChannelUrl?.split('/').pop(), text: top.snippet.textDisplay, isReply: false, createdAt: top.snippet.publishedAt });
    if (includeReplies) for (const reply of thread.replies?.comments ?? []) {
      const replyAuthorId = reply.snippet.authorChannelId?.value;
      if (replyAuthorId) comments.push({ providerCommentId: reply.id, providerUserId: replyAuthorId, displayName: reply.snippet.authorDisplayName, username: reply.snippet.authorChannelUrl?.split('/').pop(), text: reply.snippet.textDisplay, isReply: true, createdAt: reply.snippet.publishedAt });
    }
  }
  return { comments, nextPageToken: payload.nextPageToken, totalResults: payload.pageInfo.totalResults };
}

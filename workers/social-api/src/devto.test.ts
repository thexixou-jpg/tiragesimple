import { describe, expect, it } from 'vitest';
import { devComment, parseDevUrl } from './devto';

describe('parseDevUrl', () => {
  it('accepts article URLs', () => expect(parseDevUrl('https://dev.to/alice/my-article-123')).toEqual({ username: 'alice', slug: 'my-article-123', canonicalUrl: 'https://dev.to/alice/my-article-123' }));
  it('rejects tags, other hosts and query strings', () => { expect(parseDevUrl('https://dev.to/t/javascript')).toBeNull(); expect(parseDevUrl('https://example.com/alice/post')).toBeNull(); expect(parseDevUrl('https://dev.to/alice/post?x=1')).toBeNull(); });
});

describe('devComment', () => {
  it('uses the numeric user id and converts HTML to searchable text', () => expect(devComment({ id_code: 'abc12', created_at: '2026-01-01T00:00:00Z', body_html: '<p>Je &amp; participe</p>', user: { user_id: 42, username: 'Alice', name: 'Alice D.' }, children: [] }, true)).toEqual({ providerCommentId: 'abc12', providerUserId: '42', username: 'alice', displayName: 'Alice D.', text: 'Je & participe', isReply: true, createdAt: '2026-01-01T00:00:00Z' }));
  it('rejects hidden or anonymous comments', () => expect(devComment({ id_code: 'abc12', body_html: '<p>[hidden]</p>', user: {}, children: [] }, false)).toBeUndefined());
});

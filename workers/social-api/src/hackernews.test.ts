import { describe, expect, it } from 'vitest';
import { hackerNewsComment, parseHackerNewsUrl } from './hackernews';

describe('Hacker News connector', () => {
  it('accepts only canonical public item URLs', () => {
    expect(parseHackerNewsUrl('https://news.ycombinator.com/item?id=8863')).toBe('8863');
    expect(parseHackerNewsUrl('http://news.ycombinator.com/item?id=8863')).toBeNull();
    expect(parseHackerNewsUrl('https://news.ycombinator.com/item?id=8863&goto=x')).toBeNull();
    expect(parseHackerNewsUrl('https://evil.example/item?id=8863')).toBeNull();
  });

  it('normalizes an eligible comment with the case-sensitive user id', () => {
    expect(hackerNewsComment({ id: 12, type: 'comment', by: 'CaseUser', parent: 10, text: 'Hello <p>world &amp; friends', time: 1_700_000_000 }, '10')).toMatchObject({
      providerCommentId: '12', providerUserId: 'CaseUser', username: 'CaseUser', text: 'Hello world & friends', isReply: false,
    });
  });

  it('rejects deleted, dead, or anonymous comments', () => {
    expect(hackerNewsComment({ id: 12, type: 'comment', deleted: true, parent: 10 }, '10')).toBeUndefined();
    expect(hackerNewsComment({ id: 13, type: 'comment', dead: true, by: 'user', parent: 10, text: 'x' }, '10')).toBeUndefined();
    expect(hackerNewsComment({ id: 14, type: 'comment', parent: 10, text: 'x' }, '10')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { collectRedditThings, parseRedditUrl } from './reddit';

describe('parseRedditUrl', () => {
  it('accepts canonical and short Reddit links', () => {
    expect(parseRedditUrl('https://www.reddit.com/r/france/comments/1abcde/un_titre/')).toEqual({ postId:'1abcde' });
    expect(parseRedditUrl('https://redd.it/1abcde')).toEqual({ postId:'1abcde' });
  });
  it('rejects foreign hosts and profile links', () => {
    expect(parseRedditUrl('https://example.com/r/france/comments/1abcde/test')).toBeNull();
    expect(parseRedditUrl('https://reddit.com/user/example')).toBeNull();
  });
});

describe('collectRedditThings', () => {
  it('uses stable account ids, keeps replies and ignores deleted authors', () => {
    const comments: any[]=[]; const more=new Set<string>();
    collectRedditThings([
      { kind:'t1', data:{ id:'a', name:'t1_a', author:'alice', author_fullname:'t2_1', body:'bonjour', parent_id:'t3_post', replies:{ data:{ children:[{ kind:'t1', data:{ id:'b', name:'t1_b', author:'bob', author_fullname:'t2_2', body:'réponse', parent_id:'t1_a', replies:'' } }] } } } },
      { kind:'t1', data:{ id:'c', name:'t1_c', author:'[deleted]', body:'[deleted]', parent_id:'t3_post', replies:'' } },
      { kind:'more', data:{ children:['d','e'] } },
    ], comments, more);
    expect(comments.map(comment => [comment.providerUserId,comment.isReply])).toEqual([['t2_1',false],['t2_2',true]]);
    expect([...more]).toEqual(['d','e']);
  });
});

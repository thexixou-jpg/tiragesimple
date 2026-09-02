import { describe, expect, it } from 'vitest';
import { mixcloudComment, parseMixcloudUrl } from './mixcloud';

describe('parseMixcloudUrl', () => {
  it('accepts a public show URL', () => expect(parseMixcloudUrl('https://www.mixcloud.com/spartacus/party-time/')).toEqual({ username: 'spartacus', slug: 'party-time', key: '/spartacus/party-time/' }));
  it('rejects profiles, extra paths and other hosts', () => {
    expect(parseMixcloudUrl('https://www.mixcloud.com/spartacus/')).toBeNull();
    expect(parseMixcloudUrl('https://www.mixcloud.com/spartacus/party-time/comments/')).toBeNull();
    expect(parseMixcloudUrl('https://example.com/spartacus/party-time/')).toBeNull();
  });
});

describe('mixcloudComment', () => {
  it('uses official object keys as stable identities', () => expect(mixcloudComment({ key:'/comments/cr/64/c123/',comment:'Bravo',submit_date:'2026-01-01T00:00:00Z',user:{key:'/Alice-DJ/',username:'Alice-DJ',name:'Alice'} })).toEqual({ providerCommentId:'/comments/cr/64/c123/',providerUserId:'/Alice-DJ/',username:'alice-dj',displayName:'Alice',text:'Bravo',isReply:false,createdAt:'2026-01-01T00:00:00Z' }));
  it('rejects comments without an official user key', () => expect(mixcloudComment({ key:'/comments/cr/64/c123/',comment:'x',user:{username:'alice'} })).toBeUndefined());
});

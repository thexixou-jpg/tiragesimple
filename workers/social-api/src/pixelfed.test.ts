import {describe,expect,it} from 'vitest';
import {parsePixelfedUrl,pixelfedAllowedHosts} from './pixelfed';
import type {Env} from './types';

const env={PIXELFED_ALLOWED_HOSTS:'pixelfed.social,pixelfed.fr'} as Env;
describe('Pixelfed URL validation',()=>{
  it('accepts a public post on an allowed instance',()=>expect(parsePixelfedUrl('https://pixelfed.social/p/pixelfed/787579364602462995',env)).toEqual({host:'pixelfed.social',statusId:'787579364602462995',canonicalUrl:'https://pixelfed.social/p/pixelfed/787579364602462995'}));
  it.each(['http://pixelfed.social/p/user/787579364602462995','https://evil.test/p/user/787579364602462995','https://pixelfed.social.evil.test/p/user/787579364602462995','https://user:pass@pixelfed.social/p/user/787579364602462995','https://pixelfed.social/p/user/787579364602462995?x=1','https://pixelfed.social/api/v1/statuses/787579364602462995'])('rejects unsafe or unsupported URLs: %s',url=>expect(parsePixelfedUrl(url,env)).toBeNull());
  it('filters malformed configured hosts',()=>expect([...pixelfedAllowedHosts({PIXELFED_ALLOWED_HOSTS:'pixelfed.social,localhost,127.0.0.1,evil/path'} as Env)]).toEqual(['pixelfed.social']));
});

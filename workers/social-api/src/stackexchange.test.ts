import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStackExchangeUrl, parseStackExchangeReference, stackExchangeSites } from '../../../src/lib/stackexchange-sites';
import { getStackExchangePublication, getStackExchangeParticipantsPage } from './stackexchange';
import { normalizeRules } from './contest-rules';
import { ProviderRequestError } from './provider-http';

const env = { STACKEXCHANGE_ENABLED: 'true' };
const response = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => vi.unstubAllGlobals());

describe('Stack Exchange communities', () => {
  it.each(stackExchangeSites)('routes $name to its official site parameter', async community => {
    const parsed = parseStackExchangeUrl(`https://${community.host}/questions/42/example?utm_source=test#answer-70`)!;
    expect(parsed.site).toBe(community.site);
    expect(parseStackExchangeReference(parsed.publicationId)).toMatchObject({ site: community.site, id: '42' });
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.origin).toBe('https://api.stackexchange.com');
      expect(url.pathname).toBe('/2.3/questions/42');
      expect(url.searchParams.get('site')).toBe(community.site);
      return response({ items:[{ question_id:42, title:'A &amp; B', link:`https://${community.host}/questions/42/title`, owner:{user_id:7} }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getStackExchangePublication(parsed.canonicalUrl, env)).toMatchObject({
      providerPublicationId: parsed.publicationId, canonicalUrl:parsed.canonicalUrl, title:'A & B', authorProviderId:'7',
    });
  });
  it.each([
    'http://askubuntu.com/questions/42', 'https://askubuntu.com.evil.test/questions/42',
    'https://askubuntu.com@evil.test/questions/42', 'https://user:pass@superuser.com/questions/42',
    'https://superuser.com:8443/questions/42', 'https://127.0.0.1/questions/42',
    'https://math.stackexchange.com/questions/42', 'https://gaming.stackexchange.com/a/42',
    'https://serverfault.com/questions/0', 'https://askubuntu.com/questions/42/slug/99',
  ])('rejects unsupported or unsafe URL %s', url => {
    expect(parseStackExchangeUrl(url)).toBeNull();
  });
  it('keeps old numeric Stack Overflow references and separates same question IDs', () => {
    expect(parseStackExchangeReference('42')?.site).toBe('stackoverflow');
    expect(parseStackExchangeUrl('https://askubuntu.com/questions/42')?.publicationId).toBe('askubuntu|42');
    expect(parseStackExchangeUrl('https://superuser.com/questions/42')?.publicationId).toBe('superuser|42');
    for (const value of ['unknown|42', 'askubuntu|42|2', 'askubuntu|0', 'askubuntu|../42', '']) expect(parseStackExchangeReference(value)).toBeNull();
  });
  it('paginates comments on the selected site and deduplicates by numeric identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      expect(url.pathname).toBe('/2.3/questions/42/comments');
      expect(url.searchParams.get('site')).toBe('gaming');
      expect(url.searchParams.get('page')).toBe('2');
      return response({ items:[
        {comment_id:1,body:'concours',owner:{user_id:7,display_name:'Alice'}},
        {comment_id:2,body:'concours',owner:{user_id:7,display_name:'Nouveau pseudo'}},
        {comment_id:3,body:'concours',owner:{display_name:'Compte supprimé'}},
        {comment_id:4,body:'hors sujet',owner:{user_id:8}},
      ], has_more:true });
    }));
    const page = await getStackExchangeParticipantsPage('gaming|42', '2', normalizeRules({ interaction:'comments', requiredKeyword:'concours' }), env);
    expect(page.participants.filter(item => item.eligible)).toHaveLength(1);
    expect(page.participants.find(item => item.providerUserId === '8')?.eligible).toBe(false);
    expect(page.participants[0].providerUserId).toBe('7');
    expect(page.nextPageToken).toBe('3');
    expect(page.totalResults).toBe(4);
  });
  it('carries the full API backoff into the queue retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({items:[], has_more:true, backoff:180})));
    try {
      await getStackExchangeParticipantsPage('askubuntu|42', undefined, normalizeRules({interaction:'answers'}), env);
      expect.fail('must not accept a rate-limited page');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRequestError);
      expect(error).toMatchObject({retryable:true,retryAfterSeconds:180});
    }
  });
  it('fails closed for a missing pagination flag or invalid cursor', async () => {
    const fetchMock = vi.fn(async () => response({items:[]}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getStackExchangeParticipantsPage('superuser|42', undefined, normalizeRules({}), env)).rejects.toThrow('incomplète');
    for (const token of ['2abc', '0', '1.2', '1001']) {
      await expect(getStackExchangeParticipantsPage('superuser|42', token, normalizeRules({}), env)).rejects.toThrow('Pagination');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects mismatched question metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({items:[{question_id:99,title:'Wrong',link:'https://evil.test'}]})));
    await expect(getStackExchangePublication('https://serverfault.com/questions/42',env)).rejects.toThrow('incomplète');
  });
});

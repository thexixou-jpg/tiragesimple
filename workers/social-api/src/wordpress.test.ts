import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWordPressParticipantsPage, parseWordPressUrl } from './wordpress';
import type { Env } from './types';
import { normalizeRules } from './contest-rules';
afterEach(() => vi.restoreAllMocks());
describe('WordPress.com connector', () => {
  it('accepts only canonical WordPress.com post URLs', () => {
    expect(parseWordPressUrl('https://example.wordpress.com/2026/09/02/mon-concours/')).toEqual({ site:'example.wordpress.com', slug:'mon-concours', canonicalUrl:'https://example.wordpress.com/2026/09/02/mon-concours/' });
    expect(parseWordPressUrl('https://example.com/mon-concours/')).toBeNull();
    expect(parseWordPressUrl('https://example.wordpress.com/mon-concours/?x=1')).toBeNull();
    expect(parseWordPressUrl('http://example.wordpress.com/mon-concours/')).toBeNull();
  });
  it('keeps registered accounts and excludes guests without stable ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ found:-1, comments:[
      { ID:1, status:'approved', type:'comment', parent:false, raw_content:'Concours', author:{ ID:42, wpcom_id:42, login:'Alice', name:'Alice' } },
      { ID:2, status:'approved', type:'comment', parent:false, raw_content:'Concours', author:{ ID:0, name:'Visiteur' } },
    ] }), { status:200 }));
    const page=await getWordPressParticipantsPage('example.wordpress.com|99', undefined, normalizeRules({ requiredKeyword:'concours' }), { WORDPRESS_ENABLED:'true' } as Env);
    expect(page.participants).toHaveLength(1); expect(page.participants[0]).toMatchObject({ providerUserId:'42', username:'alice' });
  });
});

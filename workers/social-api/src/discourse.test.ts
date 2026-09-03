import {afterEach,describe,expect,it,vi} from 'vitest';
import {parseDiscourseUrl,discourseForums} from '../../../src/lib/discourse-forums';
import {discourseComment,getDiscoursePublication,getDiscourseParticipantsBatch} from './discourse';
import {normalizeRules} from './contest-rules';
const env={DISCOURSE_ENABLED:'true'};
const post=(id:number,number=id)=>({id,topic_id:42,post_number:number,post_type:1,user_id:id+10,username:'user'+id,cooked:'<p>Je &amp; participe</p>'});
const response=(data:unknown)=>new Response(JSON.stringify(data));
afterEach(()=>vi.unstubAllGlobals());
describe('official Discourse connector',()=>{
  it.each(discourseForums)('accepts public topics on $name',forum=>{
    expect(parseDiscourseUrl(`https://${forum.host}/t/title/42/3`)).toMatchObject({id:'42',host:forum.host});
    expect(parseDiscourseUrl(`https://${forum.host}/t/42/3`)?.id).toBe('42');
  });
  it.each(['http://meta.discourse.org/t/42','https://evil.test/t/42','https://meta.discourse.org.evil.test/t/42','https://user:pass@meta.discourse.org/t/42','https://meta.discourse.org:444/t/42','https://127.0.0.1/t/42','https://meta.discourse.org/t/42?api_key=secret','https://meta.discourse.org/admin','https://meta.discourse.org/t/0'])('rejects unsafe URL %s',url=>expect(parseDiscourseUrl(url)).toBeNull());
  it('excludes opening/system/hidden/deleted messages and normalizes identities',()=>{
    expect(discourseComment(post(1))).toBeUndefined();
    for(const changes of [{post_type:2},{hidden:true},{deleted_at:'2026-01-01'},{user_deleted:true},{user_id:-1}])expect(discourseComment({...post(2),...changes})).toBeUndefined();
    expect(discourseComment({...post(2),reply_to_post_number:1})).toMatchObject({providerUserId:'12',text:'Je & participe',isReply:false});
    expect(discourseComment({...post(2),reply_to_post_number:3})).toMatchObject({isReply:true});
  });
  it('loads metadata and freezes the stream for later batches',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
      expect(url).toBe('https://meta.discourse.org/t/42.json');
      expect(init.redirect).toBe('manual');
      return response({id:42,title:'Topic',archetype:'regular',post_stream:{posts:[post(1),post(2)],stream:[1,2,3]}});
    }));
    expect(await getDiscoursePublication('https://meta.discourse.org/t/42',env)).toMatchObject({provider:'discourse',providerPublicationId:'meta.discourse.org|42',authorProviderId:'11'});
    const page=await getDiscourseParticipantsBatch('meta.discourse.org|42',undefined,normalizeRules({includeReplies:true}),env);
    expect(page.nextPendingIds).toEqual(['3']);expect(page.totalResults).toBe(2);expect(page.participants).toHaveLength(1);
  });
  it('requests only the next twenty frozen IDs',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
      const parsed=new URL(url);
      expect(parsed.hostname).toBe('forums.docker.com');expect(parsed.pathname).toBe('/t/42/posts.json');
      expect(parsed.searchParams.getAll('post_ids[]')).toEqual(Array.from({length:20},(_,i)=>String(i+2)));
      return response({post_stream:{posts:Array.from({length:20},(_,i)=>post(i+2))}});
    }));
    const page=await getDiscourseParticipantsBatch('forums.docker.com|42',Array.from({length:21},(_,i)=>String(i+2)),normalizeRules({}),env);
    expect(page.nextPendingIds).toEqual(['22']);
  });
  it('fails closed when a message is missing or moved to another topic',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>response({post_stream:{posts:[]}})));
    await expect(getDiscourseParticipantsBatch('meta.discourse.org|42',['2'],normalizeRules({}),env)).rejects.toThrow('manque');
    vi.stubGlobal('fetch',vi.fn(async()=>response({post_stream:{posts:[{...post(2),topic_id:99}]}})));
    await expect(getDiscourseParticipantsBatch('meta.discourse.org|42',['2'],normalizeRules({}),env)).rejects.toThrow('manque');
  });
  it('refuses oversized or private topics',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>response({id:42,title:'Topic',post_stream:{posts:[post(1)],stream:Array.from({length:5001},(_,i)=>i+1)}})));
    await expect(getDiscoursePublication('https://meta.discourse.org/t/42',env)).rejects.toThrow('5 000');
    vi.stubGlobal('fetch',vi.fn(async()=>response({id:42,title:'Topic',archetype:'private_message',post_stream:{posts:[post(1)],stream:[1]}})));
    await expect(getDiscoursePublication('https://meta.discourse.org/t/42',env)).rejects.toThrow('public');
  });
  it('respects Retry-After without following redirects or challenges',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:429,headers:{'retry-after':'240'}})));
    await expect(getDiscoursePublication('https://meta.discourse.org/t/42',env)).rejects.toMatchObject({retryable:true,retryAfterSeconds:240});
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:302,headers:{location:'https://private.test'}})));
    await expect(getDiscoursePublication('https://meta.discourse.org/t/42',env)).rejects.toMatchObject({retryable:false});
  });
});

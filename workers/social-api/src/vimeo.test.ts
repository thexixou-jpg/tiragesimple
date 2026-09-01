import {describe,expect,it} from 'vitest';
import {parseVimeoUrl,vimeoComment} from './vimeo';

describe('parseVimeoUrl',()=>{
  it('accepts public and player video links',()=>{
    expect(parseVimeoUrl('https://vimeo.com/123456789')).toEqual({videoId:'123456789'});
    expect(parseVimeoUrl('https://player.vimeo.com/video/123456789')).toEqual({videoId:'123456789'});
    expect(parseVimeoUrl('https://vimeo.com/channels/staffpicks/123456789')).toEqual({videoId:'123456789'});
  });
  it('rejects foreign and non-video links',()=>{expect(parseVimeoUrl('https://example.com/123456789')).toBeNull();expect(parseVimeoUrl('https://vimeo.com/')).toBeNull();});
});

describe('vimeoComment',()=>{
  it('uses a stable member uri and marks replies',()=>expect(vimeoComment({uri:'/videos/9/comments/4',text:'Bonjour',created_on:'2026-01-01T00:00:00Z',metadata:{connections:{user:{uri:'/users/12',name:'Alice'}}}},true)).toMatchObject({providerUserId:'/users/12',username:'alice',displayName:'Alice',isReply:true}));
  it('accepts a stable guest uri and rejects deleted comments',()=>{expect(vimeoComment({uri:'/videos/9/comments/5',text:'Salut',metadata:{connections:{guest_user:{uri:'/guest_users/abc',name:'Invité'}}}},false)?.providerUserId).toBe('/guest_users/abc');expect(vimeoComment({uri:'/videos/9/comments/6',text:'x',deleted_on:'2026-01-01'},false)).toBeUndefined();});
});

import {describe,expect,it} from 'vitest';
import {gitlabComment,parseGitLabUrl} from './gitlab';

describe('parseGitLabUrl',()=>{
  it('accepts issues and merge requests in nested namespaces',()=>{expect(parseGitLabUrl('https://gitlab.com/group/sub/project/-/issues/42')).toMatchObject({projectPath:'group/sub/project',kind:'issues',iid:42});expect(parseGitLabUrl('https://gitlab.com/a/b/-/merge_requests/7')).toMatchObject({projectPath:'a/b',kind:'merge_requests',iid:7});});
  it('rejects profiles, other hosts and arbitrary paths',()=>{expect(parseGitLabUrl('https://gitlab.com/a/b')).toBeNull();expect(parseGitLabUrl('https://example.com/a/b/-/issues/1')).toBeNull();expect(parseGitLabUrl('https://gitlab.com/a/b/-/pipelines/1')).toBeNull();});
});

describe('gitlabComment',()=>{
  it('uses the numeric author id',()=>expect(gitlabComment({id:9,body:'Je participe',created_at:'2026-01-01T00:00:00Z',system:false,author:{id:4,username:'Alice',name:'Alice D.'}})).toEqual({providerCommentId:'9',providerUserId:'4',username:'alice',displayName:'Alice D.',text:'Je participe',isReply:false,createdAt:'2026-01-01T00:00:00Z'}));
  it('normalizes GraphQL global ids',()=>expect(gitlabComment({id:'gid://gitlab/Note/9',body:'Je participe',createdAt:'2026-01-01T00:00:00Z',system:false,author:{id:'gid://gitlab/User/4',username:'Alice'}})).toMatchObject({providerCommentId:'9',providerUserId:'4',username:'alice'}));
  it('excludes system, internal and anonymous notes',()=>{expect(gitlabComment({id:9,body:'changed label',system:true,author:{id:4}})).toBeUndefined();expect(gitlabComment({id:9,body:'secret',internal:true,author:{id:4}})).toBeUndefined();expect(gitlabComment({id:9,body:'x'})).toBeUndefined();});
});

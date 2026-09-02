import { describe, expect, it } from 'vitest';
import { parseBitbucketUrl } from './bitbucket';

describe('Bitbucket connector', () => {
  it('accepts canonical public pull request URLs', () => {
    expect(parseBitbucketUrl('https://bitbucket.org/atlassian/aui/pull-requests/5425')).toEqual({ workspace: 'atlassian', repo: 'aui', pullRequestId: '5425', canonicalUrl: 'https://bitbucket.org/atlassian/aui/pull-requests/5425' });
    expect(parseBitbucketUrl('https://bitbucket.org/team/repo.js/pull-requests/12/')).not.toBeNull();
  });

  it('rejects noncanonical and untrusted URLs', () => {
    expect(parseBitbucketUrl('http://bitbucket.org/atlassian/aui/pull-requests/5425')).toBeNull();
    expect(parseBitbucketUrl('https://api.bitbucket.org/2.0/repositories/x/y/pullrequests/1')).toBeNull();
    expect(parseBitbucketUrl('https://bitbucket.org/x/y/pull-requests/1/diff')).toBeNull();
    expect(parseBitbucketUrl('https://bitbucket.org/x/y/pull-requests/1?tab=comments')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { socialRulesSummary, type SummaryRules } from './social-rules-summary';
const base: SummaryRules = { winnerCount: 2, alternateCount: 1, duplicateEntries: false, includeReplies: false, excludePublicationAuthor: true, excludedAccountCount: 0 };
describe('social contest summaries', () => {
  it('states only YouTube criteria actually checked', () => {
    const text = socialRulesSummary('youtube', { ...base, includeReplies: true, requiredKeyword: 'concours', excludedAccountCount: 2 }).join('\n');
    expect(text).toContain('Commentaires et réponses inclus');
    expect(text).toContain('Texte contenant « concours »');
    expect(text).toContain('likes non vérifiés');
    expect(text).toContain('2 exclusion(s) configurée(s)');
  });
  it('distinguishes weighted comments from unique selected accounts', () => {
    expect(socialRulesSummary('youtube', { ...base, duplicateEntries: true }).join('\n')).toContain('un compte ne peut être sélectionné qu’une fois');
  });
  it('does not advertise comments or keywords for Bluesky', () => {
    const text = socialRulesSummary('bluesky', { ...base, interaction: 'reposts' }).join('\n');
    expect(text).toContain('Participation via un repost');
    expect(text).not.toContain('commentaire');
  });
  it('uses Mastodon vocabulary for favourites and boosts', () => {
    expect(socialRulesSummary('mastodon', { ...base, interaction: 'likes' }).join('\n')).toContain('favori Mastodon');
    expect(socialRulesSummary('mastodon', { ...base, interaction: 'reposts' }).join('\n')).toContain('boost Mastodon');
  });
  it('describes Lemmy comments without claiming access to voters', () => {
    const text = socialRulesSummary('lemmy', { ...base, includeReplies: true, requiredKeyword: 'concours' }).join('\n');
    expect(text).toContain('Commentaires et réponses inclus');
    expect(text).toContain('Une seule chance par identité ActivityPub');
    expect(text).toContain('Votes et abonnement à la communauté non vérifiés');
  });
  it('limits GitHub summaries to general conversation comments', () => {
    const text = socialRulesSummary('github', { ...base, requiredKeyword: 'ready' }).join('\n');
    expect(text).toContain('Commentaires généraux de la conversation inclus');
    expect(text).toContain('Une seule chance par identifiant utilisateur GitHub');
    expect(text).toContain('Réactions, commits et statut de contributeur non vérifiés');
  });
});

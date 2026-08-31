/** The same factual summary is used before drawing, when copying, and on public results. */
export interface SummaryRules {
  winnerCount: number;
  alternateCount: number;
  duplicateEntries: boolean;
  includeReplies: boolean;
  excludePublicationAuthor: boolean;
  requiredKeyword?: string;
  interaction?: string;
  excludedAccountCount: number;
}

export function socialRulesSummary(provider: string, rules: SummaryRules): string[] {
  return [
    `${rules.winnerCount} gagnant(s) · ${rules.alternateCount} suppléant(s), tous distincts`,
    ...(provider === 'youtube' ? [
      rules.includeReplies ? 'Commentaires et réponses inclus' : 'Commentaires principaux uniquement, sans les réponses',
      rules.duplicateEntries ? 'Chaque commentaire éligible donne une chance ; un compte ne peut être sélectionné qu’une fois' : 'Une seule chance par identifiant de chaîne',
      rules.requiredKeyword ? `Texte contenant « ${rules.requiredKeyword} » (sans distinction majuscules/minuscules)` : 'Aucun filtre sur le texte',
      'Abonnement à la chaîne et likes non vérifiés',
    ] : provider === 'mastodon' ? [
      rules.interaction === 'reposts' ? 'Participation via un boost Mastodon' : 'Participation via un favori Mastodon',
      'Une seule chance par identifiant de compte ActivityPub',
      'Abonnement au compte non vérifié',
    ] : [
      rules.interaction === 'reposts' ? 'Participation via un repost' : 'Participation via un like',
      'Une seule chance par identifiant Bluesky (DID)',
      'Abonnement au compte non vérifié',
    ]),
    rules.excludePublicationAuthor ? 'Compte organisateur exclu' : 'Compte organisateur autorisé à participer',
    `${rules.excludedAccountCount} exclusion(s) configurée(s) — identités non publiées`,
  ];
}

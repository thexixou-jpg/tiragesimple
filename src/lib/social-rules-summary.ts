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
  clientSourced?: boolean;
}

export function socialRulesSummary(provider: string, rules: SummaryRules): string[] {
  return [
    `${rules.winnerCount} gagnant(s) · ${rules.alternateCount} suppléant(s), tous distincts`,
    ...(provider === 'youtube' || provider === 'youtube_live' || provider === 'vimeo' || provider === 'soundcloud' || provider === 'mixcloud' || provider === 'twitch' || provider === 'kick' || provider === 'trovo' || provider === 'lemmy' || provider === 'reddit' || provider === 'github' || provider === 'stackexchange' ? [
      provider === 'twitch' ? 'Comptes présents dans le chat Twitch au moment de l’import' :
      provider === 'kick' ? 'Auteurs des messages reçus pendant la fenêtre de collecte Kick' :
      provider === 'trovo' ? 'Auteurs des messages normaux reçus pendant la fenêtre de collecte Trovo' :
      provider === 'youtube_live' ? 'Instantané des messages texte disponibles dans le chat du direct' : provider === 'soundcloud' ? 'Commentaires publics de la piste inclus ; aucune réponse imbriquée' : provider === 'mixcloud' ? (rules.interaction === 'comments' ? 'Commentaires publics de l’émission inclus' : rules.interaction === 'listeners' ? 'Auditeurs identifiés rendus publics par Mixcloud inclus' : 'Comptes ayant ajouté l’émission aux favoris inclus') : provider === 'github' ? 'Commentaires généraux de la conversation inclus ; revues de code exclues' : provider === 'stackexchange' ? (rules.interaction === 'comments' ? 'Commentaires de la question inclus ; réponses exclues' : 'Réponses à la question incluses ; commentaires exclus') : rules.includeReplies ? 'Commentaires et réponses inclus' : 'Commentaires principaux uniquement, sans les réponses',
      rules.duplicateEntries ? `Chaque ${provider === 'stackexchange' ? 'contribution' : provider === 'youtube_live' || provider === 'kick' || provider === 'trovo' ? 'message' : 'commentaire'} éligible donne une chance ; un compte ne peut être sélectionné qu’une fois` : provider === 'twitch' ? 'Une seule chance par identifiant utilisateur Twitch' : provider === 'kick' ? 'Une seule chance par identifiant utilisateur Kick' : provider === 'trovo' ? 'Une seule chance par identifiant utilisateur Trovo' : provider === 'lemmy' ? 'Une seule chance par identité ActivityPub' : provider === 'reddit' ? 'Une seule chance par identifiant utilisateur Reddit' : provider === 'vimeo' ? 'Une seule chance par identité membre ou invité Vimeo' : provider === 'soundcloud' ? 'Une seule chance par URN utilisateur SoundCloud' : provider === 'mixcloud' ? 'Une seule chance par clé de profil Mixcloud' : provider === 'github' ? 'Une seule chance par identifiant utilisateur GitHub' : provider === 'stackexchange' ? 'Une seule chance par identifiant utilisateur Stack Overflow' : 'Une seule chance par identifiant de chaîne',
      rules.requiredKeyword ? `Texte contenant « ${rules.requiredKeyword} » (sans distinction majuscules/minuscules)` : provider === 'mixcloud' && rules.interaction !== 'comments' ? 'Aucun texte traité pour ce mode de participation' : 'Aucun filtre sur le texte',
      provider === 'twitch' ? 'Messages envoyés, follow, abonnement et rôles non utilisés' : provider === 'kick' ? 'Follow, abonnement et présence silencieuse non vérifiés' : provider === 'trovo' ? 'Viewers silencieux, follows, abonnements, cadeaux et messages antérieurs exclus' : provider === 'lemmy' ? 'Votes et abonnement à la communauté non vérifiés' : provider === 'reddit' ? 'Votes et adhésion au subreddit non vérifiés' : provider === 'vimeo' ? 'Likes, vues, followers et collections non vérifiés' : provider === 'soundcloud' ? 'Likes, reposts, abonnements et écoutes non vérifiés' : provider === 'mixcloud' ? 'Un seul mode Mixcloud appliqué ; écoutes anonymes et reposts exclus' : provider === 'github' ? 'Réactions, commits et statut de contributeur non vérifiés' : provider === 'stackexchange' ? 'Votes, réputation et statut de réponse acceptée non utilisés' : provider === 'youtube_live' ? 'Abonnement, likes, dons et messages supprimés non vérifiés' : 'Abonnement à la chaîne et likes non vérifiés',
    ] : provider === 'discord' ? [
      'Participation via la réaction Discord sélectionnée',
      'Une seule chance par identifiant utilisateur Discord ; bots exclus',
      'Contenu, rôles, présence et autres réactions non utilisés',
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
    ...(rules.clientSourced ? ['Collecte réalisée par le navigateur via l’API officielle ; liste non revérifiée par le serveur'] : []),
  ];
}

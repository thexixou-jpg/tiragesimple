export type SocialProviderId = 'youtube' | 'bluesky' | 'mastodon' | 'instagram' | 'facebook' | 'x' | 'tiktok';
export type ProviderStatus = 'available' | 'beta' | 'limited' | 'unavailable';

export interface ProviderCapabilities {
  comments: boolean;
  likes: boolean;
  reposts: boolean;
  mentions: boolean;
  followers: boolean;
  replies: boolean;
}

export interface SocialProviderDefinition {
  id: SocialProviderId;
  name: string;
  status: ProviderStatus;
  statusLabel: string;
  title: string;
  description: string;
  intro: string;
  connection: string;
  limitations: string[];
  capabilities: ProviderCapabilities;
}

export const socialProviders: SocialProviderDefinition[] = [
  {
    id: 'bluesky', name: 'Bluesky', status: 'available', statusLabel: 'Disponible',
    title: 'Tirage au sort Bluesky : likes ou reposts | TirageSimple',
    description: 'Tirez des gagnants parmi les likes ou reposts d’un post Bluesky public. Import officiel, comptes uniques, exclusions et résultat partageable.',
    intro: 'Transformez les likes ou les reposts de votre publication Bluesky en un tirage transparent, sans connecter de compte.',
    connection: 'API publique Bluesky, sans mot de passe ni connexion.',
    limitations: ['Likes ou reposts, sans combiner les deux.', 'Les commentaires, citations et abonnements ne sont pas vérifiés.', 'Un import incomplet ou trop volumineux ne permet pas de lancer un tirage.'],
    capabilities: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  },
  {
    id: 'youtube', name: 'YouTube', status: 'available', statusLabel: 'Disponible',
    title: 'Tirage au sort YouTube : commentaires de vidéo | TirageSimple',
    description: 'Préparez un tirage au sort YouTube à partir des commentaires d’une vidéo ou d’un Short, avec filtres et participants uniques.',
    intro: 'Importez les commentaires d’une vidéo YouTube pour tirer des gagnants selon des règles transparentes.',
    connection: 'Une clé API YouTube côté serveur est nécessaire. La connexion Google ne sera demandée que pour les fonctions nécessitant l’autorisation du propriétaire.',
    limitations: ['Les commentaires désactivés ne peuvent pas être importés.', 'Les réponses sont une option distincte.', 'Les abonnements à une chaîne ne sont pas vérifiables automatiquement.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  },
  {
    id: 'mastodon', name: 'Mastodon', status: 'available', statusLabel: 'Disponible sur 5 instances',
    title: 'Tirage au sort Mastodon : favoris ou boosts | TirageSimple',
    description: 'Tirez un gagnant parmi les favoris ou boosts d’un post Mastodon public, sans OAuth, sur les instances prises en charge.',
    intro: 'Importez les favoris ou les boosts d’un post Mastodon public et effectuez un tirage transparent sans connecter votre compte.',
    connection: 'API REST publique Mastodon, sans mot de passe ni connexion.',
    limitations: ['Instances prises en charge : mastodon.social, mastodon.online, mastodon.world, mstdn.social et piaille.fr.', 'Favoris ou boosts, sans combiner les deux.', 'Les réponses, abonnements et interactions privées ne sont pas vérifiés.'],
    capabilities: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  },
  {
    id: 'instagram', name: 'Instagram', status: 'limited', statusLabel: 'Fonctionnalités limitées',
    title: 'Tirage au sort Instagram : commentaires de publication | TirageSimple',
    description: 'Fonctionnalité Instagram prévue pour les commentaires de publications de comptes professionnels connectés.',
    intro: 'Les tirages Instagram seront limités aux données réellement autorisées par l’API officielle Meta.',
    connection: 'Connexion OAuth à un compte Instagram professionnel nécessaire.',
    limitations: ['Uniquement les contenus du compte professionnel autorisé.', 'L’abonnement à un compte ne sera pas présenté comme vérifiable.', 'Les personnes ayant aimé une publication ne seront pas des participants tant que l’API ne fournit pas cette liste.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: true, followers: false, replies: true },
  },
  {
    id: 'facebook', name: 'Facebook', status: 'limited', statusLabel: 'Fonctionnalités limitées',
    title: 'Tirage au sort Facebook : commentaires de Page | TirageSimple',
    description: 'Fonctionnalité Facebook prévue pour les commentaires de publications de Pages autorisées.',
    intro: 'Les concours Facebook seront réservés aux Pages dont l’organisateur autorise l’accès officiel.',
    connection: 'Connexion OAuth Facebook et autorisations Meta pour une Page nécessaires.',
    limitations: ['Les profils personnels et les groupes ne sont pas ciblés.', 'Les droits Meta et l’App Review déterminent les données réellement accessibles.', 'Les likes individuels ne sont pas supposés disponibles.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  },
  {
    id: 'x', name: 'X', status: 'unavailable', statusLabel: 'Désactivé : API payante',
    title: 'Tirage au sort X : réponses, likes et reposts | TirageSimple',
    description: 'Fonctionnalité X prévue mais désactivée tant que le coût de l’API n’est pas maîtrisé.',
    intro: 'X ne sera activé que lorsqu’un budget et des quotas API permettront un tirage fiable.',
    connection: 'Accès développeur X et crédits API nécessaires.',
    limitations: ['Le coût dépend du nombre de posts et de comptes lus.', 'Les règles disponibles dépendront du niveau d’accès API actif.'],
    capabilities: { comments: false, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
  {
    id: 'tiktok', name: 'TikTok', status: 'unavailable', statusLabel: 'Non pris en charge',
    title: 'Tirage au sort TikTok : état de disponibilité | TirageSimple',
    description: 'Tirage TikTok non disponible : l’API officielle standard ne fournit pas les commentaires nécessaires à un concours.',
    intro: 'TirageSimple ne récupérera pas les commentaires TikTok par scraping ou moyen non autorisé.',
    connection: 'Aucune connexion proposée pour un tirage de commentaires.',
    limitations: ['L’API Display officielle concerne le profil et les vidéos du compte connecté.', 'Les outils de recherche TikTok ne sont pas destinés à un service de concours commercial.'],
    capabilities: { comments: false, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
];

export const getSocialProvider = (id: SocialProviderId): SocialProviderDefinition => {
  const provider = socialProviders.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown social provider: ${id}`);
  return provider;
};

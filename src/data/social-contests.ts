export type SocialProviderId = 'youtube' | 'youtube_live' | 'bluesky' | 'mastodon' | 'lemmy' | 'github' | 'stackexchange' | 'instagram' | 'facebook' | 'x' | 'tiktok';
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
    id: 'youtube_live', name: 'YouTube Live', status: 'available', statusLabel: 'Disponible · directs en cours',
    title: 'Tirage au sort YouTube Live : participants du chat en direct',
    description: 'Tirez des gagnants parmi les auteurs des messages actuellement disponibles dans le chat d’un direct YouTube, avec filtre et comptes uniques.',
    intro: 'Créez un instantané officiel du chat d’un direct YouTube en cours, puis tirez vos gagnants parmi les auteurs des messages éligibles.',
    connection: 'API YouTube Live Streaming officielle, sans connexion Google du spectateur.',
    limitations: ['Direct public en cours avec chat activé uniquement.', 'L’instantané contient les messages rendus disponibles par YouTube au moment de l’import, pas une archive garantie du direct.', 'Les likes, abonnements, Super Chats et messages supprimés ne deviennent pas automatiquement des chances.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
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
    id: 'mastodon', name: 'Mastodon', status: 'available', statusLabel: 'Disponible sur 13 instances',
    title: 'Tirage au sort Mastodon : favoris ou boosts | TirageSimple',
    description: 'Tirez un gagnant parmi les favoris ou boosts d’un post Mastodon public, sans OAuth, sur les instances prises en charge.',
    intro: 'Importez les favoris ou les boosts d’un post Mastodon public et effectuez un tirage transparent sans connecter votre compte.',
    connection: 'API REST publique Mastodon, sans mot de passe ni connexion.',
    limitations: ['13 instances vérifiées, dont mastodon.social, piaille.fr, Framapiaf, Mamot et Mastodon.art.', 'Favoris ou boosts, sans combiner les deux.', 'Les réponses, abonnements et interactions privées ne sont pas vérifiés.'],
    capabilities: { comments: false, likes: true, reposts: true, mentions: false, followers: false, replies: false },
  },
  {
    id: 'lemmy', name: 'Lemmy', status: 'available', statusLabel: 'Disponible sur 4 instances',
    title: 'Tirage au sort Lemmy : commentaires d’un post | TirageSimple',
    description: 'Importez les commentaires d’un post Lemmy public et tirez des gagnants avec filtre textuel, réponses, exclusions et comptes uniques.',
    intro: 'Transformez les commentaires publics d’un post Lemmy en un tirage transparent, sans connecter de compte.',
    connection: 'API publique Lemmy 0.19, sans mot de passe ni connexion.',
    limitations: ['Instances prises en charge : Lemmy.world, Lemmy.ml, jlai.lu et Feddit.org.', 'Les votes et abonnements ne sont pas accessibles comme listes de participants.', 'La collecte n’est pas figée si des commentaires sont ajoutés pendant l’import.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  },
  {
    id: 'github', name: 'GitHub', status: 'available', statusLabel: 'Disponible · dépôts publics',
    title: 'Tirage au sort GitHub : commentaires d’issue ou pull request',
    description: 'Tirez des gagnants parmi les commentaires d’une issue ou pull request GitHub publique, avec comptes uniques, filtre et exclusions.',
    intro: 'Importez les commentaires généraux d’une issue ou pull request publique et choisissez vos gagnants sans connecter de compte GitHub.',
    connection: 'API REST publique GitHub, avec quota gratuit strict sans authentification.',
    limitations: ['Dépôts publics uniquement.', 'Les revues de code, réactions, commits et discussions GitHub ne sont pas inclus.', 'Quota public partagé limité tant qu’aucun jeton serveur n’est configuré.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
  {
    id: 'stackexchange', name: 'Stack Overflow', status: 'available', statusLabel: 'Disponible · questions publiques',
    title: 'Tirage au sort Stack Overflow : réponses ou commentaires',
    description: 'Tirez des gagnants parmi les auteurs de réponses ou de commentaires d’une question Stack Overflow publique. Import officiel et comptes uniques.',
    intro: 'Importez les réponses ou commentaires d’une question Stack Overflow et effectuez un tirage sans connecter de compte.',
    connection: 'API publique Stack Exchange, sans mot de passe ni connexion.',
    limitations: ['Questions publiques de Stack Overflow uniquement.', 'Choisissez les réponses ou les commentaires de la question, sans les combiner.', 'Les utilisateurs supprimés sans identifiant stable ne sont pas éligibles.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
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

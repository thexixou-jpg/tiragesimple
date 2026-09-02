export type SocialProviderId = 'youtube' | 'youtube_live' | 'vimeo' | 'soundcloud' | 'mixcloud' | 'twitch' | 'kick' | 'trovo' | 'discord' | 'bluesky' | 'mastodon' | 'lemmy' | 'reddit' | 'github' | 'gitlab' | 'devto' | 'hackernews' | 'stackexchange' | 'instagram' | 'facebook' | 'x' | 'tiktok';
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
    id: 'twitch', name: 'Twitch', status: 'limited', statusLabel: 'OAuth prêt · activation requise',
    title: 'Tirage au sort Twitch : viewers présents dans le chat',
    description: 'Préparez un tirage parmi les comptes présents dans un chat Twitch avec la connexion officielle du diffuseur ou d’un modérateur.',
    intro: 'Connectez Twitch officiellement puis importez la liste paginée des comptes présents dans le chat de votre chaîne ou d’une chaîne que vous modérez.',
    connection: 'OAuth Twitch avec la permission minimale moderator:read:chatters.',
    limitations: ['Le compte connecté doit être le diffuseur ou un modérateur de la chaîne.', 'La liste Twitch des chatters peut avoir un léger délai lors des arrivées et départs.', 'La présence dans le chat ne prouve ni un message envoyé, ni un abonnement, ni un follow.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
  {
    id: 'kick', name: 'Kick', status: 'limited', statusLabel: 'OAuth prêt · activation requise',
    title: 'Tirage au sort Kick : messages du chat en direct',
    description: 'Collectez officiellement les messages reçus pendant une période définie sur votre chat Kick, puis tirez des gagnants par identifiant unique.',
    intro: 'Connectez votre propre chaîne Kick, ouvrez une fenêtre de collecte pendant le direct puis choisissez vos gagnants parmi les auteurs des messages reçus.',
    connection: 'OAuth 2.1 Kick avec PKCE et permission minimale de lecture des événements de la chaîne.',
    limitations: ['La chaîne connectée doit être celle qui organise le concours.', 'Seuls les messages reçus après le démarrage de la collecte sont inclus : aucun historique n’est inventé.', 'Les follows, abonnements et viewers silencieux ne sont pas utilisés comme participations.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  },
  {
    id: 'trovo', name: 'Trovo', status: 'limited', statusLabel: 'Collecteur prêt · clé applicative requise',
    title: 'Tirage au sort Trovo : messages du chat en direct',
    description: 'Collectez les nouveaux messages d’un chat Trovo public via le WebSocket officiel, puis tirez des gagnants par identifiant unique.',
    intro: 'Ouvrez une fenêtre de participation sur une chaîne Trovo publique et tirez vos gagnants parmi les auteurs des nouveaux messages reçus.',
    connection: 'API et service de chat WebSocket officiels Trovo, sans connexion du streamer.',
    limitations: ['Seuls les messages reçus après le démarrage explicite de la collecte sont inclus.', 'La fenêtre doit rester ouverte dans le navigateur pendant le concours.', 'Les viewers silencieux, follows, abonnements, cadeaux et anciens messages ne participent pas.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
  {
    id: 'discord', name: 'Discord', status: 'limited', statusLabel: 'Bot prêt · activation requise',
    title: 'Tirage au sort Discord : réactions à un message',
    description: 'Tirez des gagnants parmi les comptes ayant réagi avec un emoji précis à un message Discord, via le bot officiel TirageSimple.',
    intro: 'Installez le bot TirageSimple sur votre serveur, collez le lien d’un message et choisissez la réaction qui définit la participation.',
    connection: 'Bot Discord officiel avec les seules permissions Voir le salon et Lire l’historique des messages.',
    limitations: ['Le bot doit être installé et autorisé dans le salon du message.', 'Une seule réaction est choisie par tirage ; les bots sont automatiquement exclus.', 'Le contenu du message, les rôles, présences et membres silencieux ne sont pas utilisés.'],
    capabilities: { comments: false, likes: true, reposts: false, mentions: false, followers: false, replies: false },
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
    id: 'vimeo', name: 'Vimeo', status: 'limited', statusLabel: 'Connecteur prêt · application requise',
    title: 'Tirage au sort Vimeo : commentaires d’une vidéo',
    description: 'Tirez des gagnants parmi les commentaires et réponses d’une vidéo Vimeo publique, avec comptes uniques, filtre textuel et exclusions.',
    intro: 'Transformez les commentaires publics d’une vidéo Vimeo en une liste transparente, sans demander aux participants de connecter leur compte.',
    connection: 'API Vimeo officielle avec jeton d’application limité aux données publiques.',
    limitations: ['Une application Vimeo doit être configurée côté serveur.', 'Vidéos publiques et commentaires accessibles uniquement.', 'Likes, followers, vues et collections ne sont pas utilisés comme listes de participants.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  },
  {
    id: 'soundcloud', name: 'SoundCloud', status: 'limited', statusLabel: 'Connecteur prêt · clé API requise',
    title: 'Tirage au sort SoundCloud : commentaires d’une piste',
    description: 'Tirez des gagnants parmi les commentaires d’une piste SoundCloud publique, avec comptes uniques, filtre textuel et exclusions.',
    intro: 'Transformez les commentaires horodatés d’une piste SoundCloud publique en une liste de participants transparente et dédupliquée.',
    connection: 'API SoundCloud officielle avec jeton OAuth d’application pour les ressources publiques.',
    limitations: ['Une application SoundCloud et un abonnement Artist Pro sont actuellement requis pour obtenir les identifiants API.', 'Pistes publiques dont les commentaires sont accessibles uniquement.', 'Likes, reposts, abonnements et écoutes ne sont pas utilisés comme listes de participants.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
  {
    id: 'mixcloud', name: 'Mixcloud', status: 'available', statusLabel: 'Disponible · sans connexion',
    title: 'Tirage au sort Mixcloud : commentaires, favoris ou auditeurs',
    description: 'Tirez des gagnants parmi les commentaires, favoris ou auditeurs identifiés d’une émission Mixcloud publique, sans connecter de compte.',
    intro: 'Choisissez une émission Mixcloud et transformez ses interactions publiques en un tirage transparent avec pagination complète.',
    connection: 'API publique Mixcloud officielle, en lecture seule et sans OAuth.',
    limitations: ['Commentaires, favoris ou auditeurs identifiés : un seul mode par tirage.', 'Le filtre textuel et les chances multiples concernent uniquement les commentaires.', 'Les écoutes anonymes et les reposts ne deviennent pas des participations.'],
    capabilities: { comments: true, likes: true, reposts: false, mentions: false, followers: false, replies: false },
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
    id: 'reddit', name: 'Reddit', status: 'limited', statusLabel: 'Connecteur prêt · accès API requis',
    title: 'Tirage au sort Reddit : commentaires d’une publication',
    description: 'Tirez des gagnants parmi les commentaires d’une publication Reddit publique avec comptes uniques, réponses, filtre textuel et exclusions.',
    intro: 'Importez l’arbre complet des commentaires d’une publication Reddit publique, puis appliquez des règles transparentes à des identifiants de compte stables.',
    connection: 'API Reddit officielle avec identifiants OAuth serveur et User-Agent déclaré.',
    limitations: ['Une application Reddit autorisée doit être configurée côté serveur.', 'Les votes, abonnements, récompenses et membres du subreddit ne sont pas accessibles comme listes de participants.', 'Les comptes supprimés sans identifiant stable et les commentaires supprimés sont exclus.'],
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
    id: 'gitlab', name: 'GitLab', status: 'available', statusLabel: 'Disponible · projets publics',
    title: 'Tirage au sort GitLab : commentaires d’issue ou merge request',
    description: 'Tirez des gagnants parmi les commentaires d’une issue ou merge request GitLab.com publique, avec comptes uniques, filtre et exclusions.',
    intro: 'Importez les commentaires humains d’une conversation GitLab publique et tirez vos gagnants avec une identité numérique stable.',
    connection: 'API REST et GraphQL officielles de GitLab.com, sans connexion pour les projets publics.',
    limitations: ['Projets publics sur gitlab.com uniquement.', 'Les notes système, internes et confidentielles sont exclues.', 'Les discussions de revue de code, approbations, commits et réactions ne sont pas incluses.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: false },
  },
  {
    id: 'devto', name: 'DEV Community', status: 'available', statusLabel: 'Disponible · sans connexion',
    title: 'Tirage au sort DEV Community : commentaires d’un article',
    description: 'Tirez des gagnants parmi les commentaires et réponses d’un article DEV Community public, avec comptes uniques, filtres et exclusions.',
    intro: 'Importez tout le fil de commentaires d’un article DEV.to public et tirez vos gagnants avec les identifiants stables des membres.',
    connection: 'API Forem officielle de DEV Community, accessible en lecture publique sans clé API.',
    limitations: ['Articles publics de dev.to uniquement.', 'Les réactions et abonnés ne sont pas exposés comme listes de participants.', 'Les commentaires masqués ou sans compte identifiable sont exclus.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
  },
  {
    id: 'hackernews', name: 'Hacker News', status: 'available', statusLabel: 'Disponible · sans connexion',
    title: 'Tirage au sort Hacker News : commentaires d’une publication',
    description: 'Tirez des gagnants parmi les commentaires et réponses d’une publication Hacker News publique, avec membres uniques, filtres et exclusions.',
    intro: 'Importez progressivement tout le fil d’une publication Hacker News et tirez vos gagnants parmi les comptes identifiés.',
    connection: 'API officielle Hacker News hébergée par Firebase, publique et accessible sans clé.',
    limitations: ['Publications publiques news.ycombinator.com uniquement.', 'Les commentaires supprimés, morts ou anonymes sont exclus mais leurs réponses restent parcourues.', 'Les votes, le karma et l’abonnement ne sont pas des critères de participation.'],
    capabilities: { comments: true, likes: false, reposts: false, mentions: false, followers: false, replies: true },
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

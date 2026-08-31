# Tirages réseaux sociaux — V2 backend

Le site public reste statique sur `tiragesimple.fr`. Les appels sociaux et les données temporaires sont isolés dans un Worker Cloudflare déployé sur `api.tiragesimple.fr`.

## Pré-requis avant activation YouTube

1. Créer un projet Google Cloud et activer YouTube Data API v3.
2. Créer une clé API restreinte au backend Worker.
3. Créer D1 et une Queue Cloudflare. R2 ne sera nécessaire que si les imports bruts volumineux doivent être conservés temporairement.
4. Appliquer `workers/social-api/migrations/0001_initial.sql`.
5. Créer les secrets avec `wrangler secret put`; ne jamais ajouter les valeurs dans Git.
6. Mettre `YOUTUBE_ENABLED=true` seulement après les tests de quota et de suppression.

## Connecteurs YouTube, Bluesky, Mastodon et Lemmy

- `POST /v1/youtube/imports` : valide une URL, crée un import temporaire et place les pages de commentaires dans la Queue ;
- `GET /v1/imports/:id` : expose la progression uniquement au navigateur qui a créé l’import (cookie signé, `HttpOnly`, `Secure`) ;
- `POST /v1/imports/:id/draw` : sélectionne gagnants et suppléants avec Web Crypto ;
- `GET /v1/draws/:id` : expose une preuve seulement si l’organisateur a explicitement rendu le résultat public.
- `GET /tirage/:id` : page publique de résultat, non indexable. Le Worker devra recevoir la route Cloudflare `tiragesimple.fr/tirage/*` pour tenir cette URL publique.

Les réponses YouTube sont importées avec `comments.list(parentId)` et leur propre pagination, avant de poursuivre les pages de commentaires principaux. Les réponses intégrées à `commentThreads.list` ne sont pas utilisées.

Bluesky utilise `getLikes` ou `getRepostedBy` via l’API publique officielle. Les handles sont résolus en DID ; aucune connexion de compte n’est nécessaire. `BLUESKY_ENABLED=true` active le connecteur. Les réponses, citations, abonnements et combinaisons de critères ne sont pas proposés.

Mastodon utilise les routes publiques `favourited_by` ou `reblogged_by` de l’instance d’origine et suit uniquement son paramètre `max_id`. `MASTODON_ALLOWED_HOSTS` constitue une liste fermée : le Worker ne suit jamais un hôte fourni par une réponse de pagination. Les comptes sont dédupliqués avec leur URI ActivityPub lorsque disponible.

Lemmy utilise `GET /api/v3/post` puis `GET /api/v3/comment/list` sur une liste fermée d’instances 0.19. Les commentaires sont paginés par lots de 50 et les personnes sont dédupliquées par leur `actor_id` ActivityPub. Les votes ne sont jamais présentés comme accessibles.

Appliquer aussi `migrations/0002_import_pages.sql` avant le déploiement. Les lots enregistrent un checkpoint et les participations dans une transaction : une livraison répétée ne doit pas doubler les chances. Les écritures JSON groupées respectent le plafond de requêtes D1 par invocation sur le plan gratuit. Les erreurs temporaires sont retentées avec backoff ; un import incomplet ne devient jamais prêt.

Limites : 10 imports/heure/session, 10 000 comptes par défaut, 100 000 interactions et 1 200 pages API/import ; budgets journaliers partagés de 6 000 requêtes YouTube et 10 000 pour chacun des connecteurs publics. L’aperçu Bluesky réserve deux unités pour résolution + publication. Ces budgets sont protecteurs, pas une garantie de disponibilité permanente du forfait Cloudflare gratuit.

Routes Bluesky : `POST /v1/bluesky/publication` et `POST /v1/bluesky/imports`. Progression et tirage réutilisent les routes communes. Le frontend lit `/v1/providers` avant activation. Le Worker est aussi accessible via `tiragesimple.fr/_tiragesimple/*`.

Tests : `npm run validate`, dont les tests d’intégration SQLite de pagination, reprises, quotas, confidentialité et suppression.

## Rétention

Les participants, imports et résultats ont une date d’expiration. Le Worker exécute chaque jour à 04:00 UTC une tâche de suppression des données expirées et des comptes déconnectés. Les preuves publiques ne conservent que les agrégats, les identifiants publics choisis par l’organisateur et les hashes autorisés.

## Principes non négociables

- API officielles uniquement ; aucun scraping.
- Identifiant interne du fournisseur pour la déduplication.
- Tokens OAuth chiffrés au repos et jamais exposés au navigateur.
- Les possibilités affichées dépendent de `capabilities` et de la configuration active.
- Un hash de résultat est une preuve technique, pas une certification externe.

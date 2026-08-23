# Tirages réseaux sociaux — V2 backend

Le site public reste statique sur `tiragesimple.fr`. Les appels sociaux et les données temporaires sont isolés dans un Worker Cloudflare déployé sur `api.tiragesimple.fr`.

## Pré-requis avant activation YouTube

1. Créer un projet Google Cloud et activer YouTube Data API v3.
2. Créer une clé API restreinte au backend Worker.
3. Créer D1 et une Queue Cloudflare. R2 ne sera nécessaire que si les imports bruts volumineux doivent être conservés temporairement.
4. Appliquer `workers/social-api/migrations/0001_initial.sql`.
5. Créer les secrets avec `wrangler secret put`; ne jamais ajouter les valeurs dans Git.
6. Mettre `YOUTUBE_ENABLED=true` seulement après les tests de quota et de suppression.

## MVP YouTube implémenté (non déployé)

- `POST /v1/youtube/imports` : valide une URL, crée un import temporaire et place les pages de commentaires dans la Queue ;
- `GET /v1/imports/:id` : expose la progression uniquement au navigateur qui a créé l’import (cookie signé, `HttpOnly`, `Secure`) ;
- `POST /v1/imports/:id/draw` : sélectionne gagnants et suppléants avec Web Crypto ;
- `GET /v1/draws/:id` : expose une preuve seulement si l’organisateur a explicitement rendu le résultat public.
- `GET /tirage/:id` : page publique de résultat, non indexable. Le Worker devra recevoir la route Cloudflare `tiragesimple.fr/tirage/*` pour tenir cette URL publique.

Les réponses YouTube sont volontairement refusées dans ce MVP : l’endpoint officiel `commentThreads.list` ne retourne qu’un sous-ensemble possible des réponses intégrées. Les annoncer comme exhaustives serait trompeur. Une pagination dédiée `comments.list(parentId)` sera ajoutée avant d’activer cette option.

## Rétention

Les participants, imports et résultats ont une date d’expiration. Le Worker exécute chaque jour à 04:00 UTC une tâche de suppression des données expirées et des comptes déconnectés. Les preuves publiques ne conservent que les agrégats, les identifiants publics choisis par l’organisateur et les hashes autorisés.

## Principes non négociables

- API officielles uniquement ; aucun scraping.
- Identifiant interne du fournisseur pour la déduplication.
- Tokens OAuth chiffrés au repos et jamais exposés au navigateur.
- Les possibilités affichées dépendent de `capabilities` et de la configuration active.
- Un hash de résultat est une preuve technique, pas une certification externe.

# Tirages réseaux sociaux — V2 backend

Le site public reste statique sur `tiragesimple.fr`. Les appels sociaux et les données temporaires sont isolés dans un Worker Cloudflare déployé sur `api.tiragesimple.fr`.

## Pré-requis avant activation YouTube

1. Créer un projet Google Cloud et activer YouTube Data API v3.
2. Créer une clé API restreinte au backend Worker.
3. Créer D1, R2 et une Queue Cloudflare.
4. Appliquer `workers/social-api/migrations/0001_initial.sql`.
5. Créer les secrets avec `wrangler secret put`; ne jamais ajouter les valeurs dans Git.
6. Mettre `YOUTUBE_ENABLED=true` seulement après les tests de quota et de suppression.

## Rétention

Les participants, commentaires et imports ont une date d’expiration. La tâche planifiée de suppression devra effacer les données brutes, les tokens déconnectés et les objets R2 à expiration. Les preuves publiques ne conservent que les agrégats et hashes autorisés.

## Principes non négociables

- API officielles uniquement ; aucun scraping.
- Identifiant interne du fournisseur pour la déduplication.
- Tokens OAuth chiffrés au repos et jamais exposés au navigateur.
- Les possibilités affichées dépendent de `capabilities` et de la configuration active.
- Un hash de résultat est une preuve technique, pas une certification externe.

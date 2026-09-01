# Activation des tirages sociaux — guide opérateur

Ce guide configure YouTube, Bluesky, Mastodon, Lemmy et GitHub. Instagram, Facebook, X et TikTok restent volontairement désactivés ou limités tant que leurs accès officiels ne sont pas configurés. Bluesky, Mastodon, Lemmy et GitHub public fonctionnent sans secret de plateforme supplémentaire.

## 1. Google Cloud : clé YouTube

1. Dans Google Cloud Console, crée un projet dédié à TirageSimple.
2. Active **YouTube Data API v3**.
3. Crée une clé API.
4. Restreins cette clé à l’API **YouTube Data API v3**. Ne la mets jamais dans une variable `PUBLIC_*`, dans Git ou dans le navigateur.

Le MVP ne demande pas de connexion Google : il lit les commentaires publics côté serveur avec cette clé. OAuth ne sera ajouté que si une fonctionnalité exige l’autorisation du propriétaire.

## 2. Cloudflare : ressources de données

Depuis le dossier du projet, connecté au bon compte Cloudflare :

```powershell
npx wrangler d1 create tiragesimple-social
npx wrangler queues create tiragesimple-social-imports
```

Conserve l’identifiant `database_id` renvoyé par la première commande.

Copie ensuite `workers/social-api/wrangler.production.example.toml` en `workers/social-api/wrangler.production.toml`, puis remplace `REPLACE_WITH_D1_DATABASE_ID` par cet identifiant. Ce fichier local est ignoré par Git.

Applique la migration :

```powershell
npx wrangler d1 execute tiragesimple-social --remote --file workers/social-api/migrations/0001_initial.sql --config workers/social-api/wrangler.production.toml
```

## 3. Secrets du Worker

Génère deux secrets locaux :

```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Exécute ensuite les commandes suivantes une par une. Lorsque Wrangler demande une valeur, colle-la :

```powershell
npx wrangler secret put YOUTUBE_API_KEY --config workers/social-api/wrangler.production.toml
npx wrangler secret put SESSION_SIGNING_SECRET --config workers/social-api/wrangler.production.toml
npx wrangler secret put DATA_ENCRYPTION_KEY --config workers/social-api/wrangler.production.toml
npx wrangler secret put DRAW_SIGNING_SECRET --config workers/social-api/wrangler.production.toml
```

Les variables non sensibles (`YOUTUBE_ENABLED`, `BLUESKY_ENABLED`, `MASTODON_ENABLED`, `MASTODON_ALLOWED_HOSTS`, `LEMMY_ENABLED`, `LEMMY_ALLOWED_HOSTS`, `GITHUB_ENABLED`, origine autorisée, rétention et limite) sont déjà présentes dans le modèle de configuration. N’ajoute une instance fédérée à une liste qu’après avoir contrôlé son domaine et sa compatibilité API.

GitHub peut rester sans secret pour le lancement : seuls les dépôts publics sont alors accessibles et le budget interne est limité à 50 requêtes par jour. Si le trafic le justifie, crée un jeton GitHub à permissions minimales, ajoute-le uniquement comme secret Worker `GITHUB_API_TOKEN`, puis redéploie. Ne place jamais ce jeton dans Pages ou dans une variable `PUBLIC_*`.

## 4. Déploiement et routes

Déploie le Worker :

```powershell
npx wrangler deploy --config workers/social-api/wrangler.production.toml
```

Dans Cloudflare, ajoute ces routes au Worker `tiragesimple-social-api` :

- `api.tiragesimple.fr/*` pour l’API ;
- `tiragesimple.fr/tirage/*` pour les résultats partagés.

Ne route pas `tiragesimple.fr/*` : le reste doit continuer à être servi par Cloudflare Pages.

Crée enfin le sous-domaine DNS `api` si Cloudflare ne le crée pas automatiquement pour la route, puis ajoute au build Cloudflare Pages :

```text
PUBLIC_SOCIAL_API_URL=https://api.tiragesimple.fr
```

Redéploie Pages pour injecter cette variable dans l’interface statique.

## 5. Vérification sans données réelles

1. Ouvre `https://api.tiragesimple.fr/v1/providers` : les connecteurs activés, dont YouTube et GitHub, doivent être `enabled`.
2. Sur `/tirage-au-sort-youtube/`, teste une petite vidéo publique dont les commentaires sont activés.
3. Vérifie l’import, le filtre, le tirage et la suppression après rétention.
4. Partage un résultat de test : `https://tiragesimple.fr/tirage/TS-...` doit répondre mais ne doit pas être indexable (`noindex`).
5. Sur `/tirage-au-sort-github/`, teste une issue publique comportant des commentaires. Vérifie que seules les réponses de conversation sont comptées, sans réactions ni commentaires de revue de code.

## Rappels de sécurité et de conformité

- Ne partage aucune clé API ou secret dans cette conversation.
- La clé Google est utilisée uniquement par le Worker.
- Les données de concours sont supprimées après la durée configurée.
- Les résultats partagés le sont uniquement après une action explicite de l’organisateur.
- Les réponses YouTube utilisent une pagination dédiée `comments.list`. Appliquer `0002_import_pages.sql` avant cette version. Le connecteur ne termine pas un import si la pagination échoue ou si les limites sont dépassées.

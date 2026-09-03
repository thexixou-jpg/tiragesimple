# Forums Discourse

## Activation

`DISCOURSE_ENABLED=true` active le connecteur. Réutilise D1,
SOCIAL_IMPORT_QUEUE et la migration 0005_provider_cooldowns.sql. Pas de nouvelle
clé API, OAuth ou migration nécessaire.

Domaines explicitement vérifiés : community.home-assistant.io,
forums.docker.com et meta.discourse.org. La liste partagée frontend/Worker est
dans src/lib/discourse-forums.ts. Aucun hôte arbitraire ou redirection n’est suivi.

## Données et garanties

- GET /t/{id}.json : titre, auteur, première page et liste complète des IDs publics.
- GET /t/{id}/posts.json?post_ids[]=… : lots de 20 IDs.
- Liste figée au premier lot, transmise dans les jobs backend suivants.
- Limite de 5 000 messages pour borner jobs, volume D1 et coût API.
- Premier message exclu ; messages système, masqués, supprimés et utilisateurs
  supprimés ou sans identifiant stable exclus.
- Les réponses entre membres sont celles avec reply_to_post_number > 1.
- Une page manquante ou incohérente bloque le tirage, jamais de validation silencieuse.
- Retry-After est enregistré en D1 par forum. Aucun appel vers ce forum avant
  expiration. Pas de repli sur une autre IP pour contourner un quota.
- Seuls les identifiants numériques propres au forum sont acceptés pour les exclusions.
- Les lectures sont anonymes et sans cookie utilisateur ; un accès interdit reste interdit.
- Ne jamais présenter ce service comme partenaire ou certification des forums.

L’API permet la lecture technique des sujets publics, pas la publication de
concours contraires aux règles locales. La page utilisateur rappelle ce point.

## Sources officielles

- https://docs.discourse.org/
- https://meta.discourse.org/t/fetch-all-posts-from-a-topic-using-the-api/260886

## Vérification

`npm run validate` vérifie URL/SSRF, collecte multi-lots, messages manquants,
types de messages exclus, Retry-After, règles, déduplication, gagnants et suppléants.
Les endpoints JSON publics ont été vérifiés sans authentification.

Contrôle en production le 3 septembre 2026 : aperçus réussis pour les trois
forums depuis le Worker Cloudflare. Import Home Assistant (sujet 732927) :
4 messages analysés, 3 comptes éligibles, 1 gagnant et 1 suppléant distincts.
Résultat privé, sans lien public. Les 169 tests et les 56 pages compilées passent.

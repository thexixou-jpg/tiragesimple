# Stack Exchange — communautés prises en charge

Extension vérifiée le 3 septembre 2026.

| Communauté | Domaine | Paramètre API |
| --- | --- | --- |
| Stack Overflow | stackoverflow.com | stackoverflow |
| Super User | superuser.com | superuser |
| Server Fault | serverfault.com | serverfault |
| Ask Ubuntu | askubuntu.com | askubuntu |
| Arqade | gaming.stackexchange.com | gaming |

La liste est partagée entre navigateur et Worker dans
`src/lib/stackexchange-sites.ts`. Aucun domaine fourni par l’utilisateur
n’est appelé directement : toutes les requêtes vont à
`https://api.stackexchange.com/2.3`.

## Activation et fonctionnement

- Réutilise `STACKEXCHANGE_ENABLED=true`, D1 et la file SOCIAL_IMPORT_QUEUE.
- `STACKEXCHANGE_API_KEY` est facultative et reste un secret serveur.
- Pas de nouvelle migration, d’OAuth ni de compte utilisateur à configurer.
- Page réseau : `/tirage-au-sort-stack-exchange/`.
- L’ancienne page Stack Overflow et les références numériques existantes restent valides.
- Pour les autres sites, la référence est `site|question_id`. Les identités
  utilisateur numériques sont propres au site ; on ne fusionne pas plusieurs
  communautés dans un import.
- Sources séparées : réponses, ou commentaires directement sous la question.
- Votes, réputation, badges et réponse acceptée ne sont pas vérifiés.
- Une réponse API sans tableau `items` ou indicateur `has_more` interrompt l’import.
- Le délai `backoff` est transmis à la file pour ne pas relancer plus tôt.
- La bascule automatique du serveur vers une autre IP dans le navigateur a
  été retirée pour ce connecteur. Les anciennes routes de reçus/imports restent
  compatibles, mais l’interface n’utilise plus ce repli pour éviter un quota.

## Vérification

`npm run validate` couvre le parseur partagé, les domaines refusés, la
pagination, le backoff, les métadonnées, les exclusions et un tirage avec
suppléant sur chacune des quatre nouvelles communautés (API simulée).
Les domaines et paramètres ont également été vérifiés avec `/sites`,
et des questions publiques chargées depuis les quatre API réelles.

Sources officielles :

- https://api.stackexchange.com/docs/sites
- https://api.stackexchange.com/docs/answers-on-questions
- https://api.stackexchange.com/docs/comments-on-questions
- https://api.stackexchange.com/docs/throttle

Un quota partagé épuisé reste un blocage légitime ; ne pas le contourner en
changeant d’IP. Un résultat vérifiable n’est pas une certification externe.

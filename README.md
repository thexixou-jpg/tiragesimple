# TirageSimple.fr

Site statique français de tirages au sort et de choix aléatoires. Toutes les données utilisateur restent dans le navigateur.

## Principes

- Astro et TypeScript strict
- sortie 100 % statique
- aucun backend, compte, base de données ou API payante
- hasard centralisé avec Web Crypto
- composants et contrôleurs mutualisés par famille d’outils
- mobile first, accessible et SEO-friendly

## Commandes

```sh
npm install
npm run dev
npm run validate
npm run preview
```

`npm run validate` exécute les tests unitaires, le contrôle TypeScript/Astro, le build puis la validation des métadonnées, H1, liens internes et fichiers SEO.

## Architecture

```text
src/
├── components/   composants Astro partagés
├── data/         registre central des outils et navigation
├── layouts/      layouts général, outil et légal
├── lib/          moteurs purs et utilitaires testés
├── pages/        routes statiques
├── scripts/      contrôleurs navigateur par famille d’outils
└── styles/       design system global
```

Le registre `src/data/tools.ts` est la source des cartes, catégories et outils associés. Pour ajouter un outil, créer sa définition, sa page et réutiliser le contrôleur de famille adapté.

## Déploiement Cloudflare Pages

- version Node : 22
- commande de build : `npm run build`
- dossier de sortie : `dist`
- domaine de production attendu : `tiragesimple.fr`

Les fichiers `public/_headers` et `public/robots.txt` sont copiés dans le build. Le sitemap est généré automatiquement.

## Avant ouverture publique

1. Compléter l’identité, le contact et l’hébergeur dans `src/pages/mentions-legales.astro`.
2. Connecter le repository GitHub au projet Cloudflare Pages.
3. Configurer `tiragesimple.fr`, le certificat HTTPS et la redirection éventuelle de `www`.
4. Vérifier les pages légales avec le responsable du site.
5. Ne charger une régie publicitaire ou un outil d’analytics qu’après avoir raccordé le système de consentement prévu dans `src/lib/consent.ts`.

## Confidentialité

Les listes sont traitées localement. Le partage est volontaire et encode la configuration dans l’URL ; il ne doit pas être utilisé pour des données sensibles.

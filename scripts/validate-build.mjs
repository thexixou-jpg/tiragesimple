import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/(.:\/)/u, '$1');

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const failures = [];
const pages = htmlFiles(dist);
const uniqueValues = new Map();
const advertisingPages = new Set([
  'index.html',
  'a-propos/index.html',
  'roue-aleatoire/index.html',
  'tirage-au-sort/index.html',
  'generateur-equipes/index.html',
  'tirage-au-sort-youtube/index.html',
  'guides/concours-youtube-commentaires/index.html',
  'guides/creer-equipes-aleatoires/index.html',
  'guides/tirage-au-sort-transparent/index.html',
]);
const legalPages = new Set(['mentions-legales/index.html', 'confidentialite/index.html', 'cookies/index.html']);
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const page = relative(dist, file).replaceAll('\\', '/');
  const isNoindex = /<meta name="robots" content="noindex/u.test(html);
  const mainText = (html.match(/<main[\s\S]*?<\/main>/u)?.[0] ?? '')
    .replace(/<script[\s\S]*?<\/script>/gu, ' ')
    .replace(/<style[\s\S]*?<\/style>/gu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&[^;]+;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const wordCount = mainText ? mainText.split(' ').length : 0;
  if (!isNoindex && page !== 'index.html' && !legalPages.has(page) && wordCount < 280) {
    failures.push(`${page}: contenu indexable trop court (${wordCount} mots)`);
  }
  const hasAdsenseScript = html.includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1857504175964365');
  if (advertisingPages.has(page) !== hasAdsenseScript) {
    failures.push(`${page}: chargement AdSense non conforme à la liste des pages éditoriales autorisées`);
  }
  if (page.startsWith('guides/') && page !== 'guides/index.html' && !html.includes('<meta property="og:type" content="article"')) {
    failures.push(`${page}: métadonnée OpenGraph Article manquante`);
  }
  const required = [
    ['title', /<title>[^<]+<\/title>/u],
    ['description', /<meta name="description" content="[^"]+"/u],
    ['canonical', /<link rel="canonical" href="https:\/\/tiragesimple\.fr\/[^"]*"/u],
    ['H1', /<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/u],
    ['OpenGraph title', /<meta property="og:title" content="[^"]+"/u],
  ];
  for (const [name, pattern] of required) if (!pattern.test(html)) failures.push(`${page}: ${name} manquant`);
  const schemas = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)) {
    try { schemas.push(JSON.parse(match[1])); }
    catch { failures.push(`${page}: données structurées JSON-LD invalides`); }
  }
  if (page === 'index.html' && !schemas.some((schema) => schema['@graph']?.some((item) => item['@type'] === 'WebSite'))) {
    failures.push(`${page}: données structurées WebSite manquantes`);
  }
  const isSocialInformationPage = page === 'tirage-au-sort-reseaux-sociaux/index.html' || page.startsWith('tirage-au-sort-instagram/') || page.startsWith('tirage-au-sort-youtube/') || page.startsWith('tirage-au-sort-x/') || page.startsWith('tirage-au-sort-tiktok/') || page.startsWith('tirage-au-sort-facebook/');
  const acceptedStructuredTypes = new Set(['WebApplication', 'Article', 'AboutPage', 'CollectionPage']);
  const hasAcceptedStructuredData = schemas.some((schema) => acceptedStructuredTypes.has(schema['@type'])
    || schema['@graph']?.some((item) => acceptedStructuredTypes.has(item['@type'])));
  if (page !== 'index.html' && page !== '404.html' && page !== 'mentions-legales/index.html' && page !== 'confidentialite/index.html' && page !== 'cookies/index.html' && !isSocialInformationPage
    && !hasAcceptedStructuredData) {
    failures.push(`${page}: données structurées de contenu manquantes`);
  }
  const h1Count = [...html.matchAll(/<h1(?:\s[^>]*)?>/gu)].length;
  if (h1Count !== 1) failures.push(`${page}: ${h1Count} H1 trouvés`);

  const uniqueFields = {
    title: html.match(/<title>([^<]+)<\/title>/u)?.[1],
    description: html.match(/<meta name="description" content="([^"]+)"/u)?.[1],
    canonical: html.match(/<link rel="canonical" href="([^"]+)"/u)?.[1],
  };
  if (page !== '404.html' && uniqueFields.canonical) {
    const canonicalPath = new URL(uniqueFields.canonical).pathname;
    if (canonicalPath !== '/' && !canonicalPath.endsWith('/')) failures.push(`${page}: canonical sans slash final`);
  }
  for (const [field, value] of Object.entries(uniqueFields)) {
    if (!value) continue;
    const key = `${field}:${value}`;
    if (uniqueValues.has(key)) failures.push(`${page}: ${field} identique à ${uniqueValues.get(key)}`);
    else uniqueValues.set(key, page);
  }

  for (const match of html.matchAll(/href="(\/[^"]*)"/gu)) {
    const href = match[1].split(/[?#]/u)[0];
    if (!href || href.includes('.')) continue;
    const target = href === '/' ? join(dist, 'index.html') : join(dist, href, 'index.html');
    if (!existsSync(target)) failures.push(`${page}: lien interne introuvable ${href}`);
  }
}

for (const asset of ['robots.txt', 'sitemap-index.xml', 'og.jpg', '404.html']) {
  if (!existsSync(join(dist, asset))) failures.push(`Fichier absent : ${asset}`);
}

const headersPath = join(dist, '_headers');
if (!existsSync(headersPath)) failures.push('Fichier absent : _headers');
else {
  const headers = readFileSync(headersPath, 'utf8');
  if (!headers.includes("frame-ancestors 'none'")) failures.push('_headers : protection frame-ancestors absente');
  if (!headers.includes("object-src 'none'")) failures.push('_headers : protection object-src absente');
  if (!headers.includes("script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:")) failures.push('_headers : CSP incompatible avec le script AdSense');
}

const sitemapPath = join(dist, 'sitemap-0.xml');
if (!existsSync(sitemapPath)) failures.push('Fichier absent : sitemap-0.xml');
else {
  const sitemapXml = readFileSync(sitemapPath, 'utf8');
  for (const requiredUrl of [
    'https://tiragesimple.fr/tirage-au-sort-youtube/',
    'https://tiragesimple.fr/roue-des-prenoms/',
    'https://tiragesimple.fr/roue-alphabet/',
    'https://tiragesimple.fr/a-propos/',
    'https://tiragesimple.fr/guides/tirage-au-sort-transparent/',
  ]) if (!sitemapXml.includes(requiredUrl)) failures.push(`Sitemap : URL attendue absente ${requiredUrl}`);
  for (const excludedUrl of [
    'https://tiragesimple.fr/tirage-au-sort-instagram/',
    'https://tiragesimple.fr/tirage-au-sort-facebook/',
    'https://tiragesimple.fr/tirage-au-sort-x/',
    'https://tiragesimple.fr/tirage-au-sort-tiktok/',
  ]) if (sitemapXml.includes(excludedUrl)) failures.push(`Sitemap : URL non opérationnelle présente ${excludedUrl}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${pages.length} pages HTML validées : métadonnées, H1, liens internes et fichiers SEO présents.`);
}

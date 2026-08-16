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
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const page = relative(dist, file).replaceAll('\\', '/');
  const required = [
    ['title', /<title>[^<]+<\/title>/u],
    ['description', /<meta name="description" content="[^"]+"/u],
    ['canonical', /<link rel="canonical" href="https:\/\/tiragesimple\.fr\/[^"]*"/u],
    ['H1', /<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/u],
    ['OpenGraph title', /<meta property="og:title" content="[^"]+"/u],
  ];
  for (const [name, pattern] of required) if (!pattern.test(html)) failures.push(`${page}: ${name} manquant`);
  const h1Count = [...html.matchAll(/<h1(?:\s[^>]*)?>/gu)].length;
  if (h1Count !== 1) failures.push(`${page}: ${h1Count} H1 trouvés`);

  const uniqueFields = {
    title: html.match(/<title>([^<]+)<\/title>/u)?.[1],
    description: html.match(/<meta name="description" content="([^"]+)"/u)?.[1],
    canonical: html.match(/<link rel="canonical" href="([^"]+)"/u)?.[1],
  };
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

for (const asset of ['robots.txt', 'sitemap-index.xml', 'og.png', '404.html']) {
  if (!existsSync(join(dist, asset))) failures.push(`Fichier absent : ${asset}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`${pages.length} pages HTML validées : métadonnées, H1, liens internes et fichiers SEO présents.`);
}

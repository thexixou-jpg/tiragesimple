export interface GuideDefinition {
  slug: string;
  title: string;
  description: string;
  category: string;
  readingTime: string;
}

export const guides: GuideDefinition[] = [
  {
    slug: 'tirage-au-sort-transparent',
    title: 'Organiser un tirage au sort transparent',
    description: 'Une méthode concrète pour préparer la liste, fixer les règles, tirer les gagnants et conserver une preuve compréhensible.',
    category: 'Méthode',
    readingTime: '7 min',
  },
  {
    slug: 'creer-equipes-aleatoires',
    title: 'Créer des équipes aléatoires vraiment utiles',
    description: 'Nombre d’équipes, taille, niveaux et participants impairs : les bons choix avant de répartir un groupe.',
    category: 'Groupes',
    readingTime: '6 min',
  },
  {
    slug: 'concours-youtube-commentaires',
    title: 'Réussir un concours YouTube par commentaires',
    description: 'Règlement, commentaires éligibles, doublons et limites de l’API : le guide pratique avant le tirage.',
    category: 'YouTube',
    readingTime: '8 min',
  },
];

export function getGuide(slug: string): GuideDefinition {
  const guide = guides.find((item) => item.slug === slug);
  if (!guide) throw new Error(`Guide inconnu : ${slug}`);
  return guide;
}

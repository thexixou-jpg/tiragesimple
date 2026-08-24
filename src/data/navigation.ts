import type { ToolCategory } from './tools';

export const mainNavigation = [
  { href: '/roue-aleatoire', label: 'Roue' },
  { href: '/tirage-au-sort', label: 'Tirage au sort' },
  { href: '/tirage-au-sort-reseaux-sociaux', label: 'Concours sociaux' },
  { href: '/generateur-equipes', label: 'Équipes' },
];

export const categoryOrder: ToolCategory[] = ['roues', 'tirages', 'groupes', 'hasard', 'listes'];

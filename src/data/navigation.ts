import type { ToolCategory } from './tools';

export const mainNavigation = [
  { href: '/roue-aleatoire', label: 'Roue' },
  { href: '/tirage-au-sort', label: 'Tirage au sort' },
  { href: '/generateur-equipes', label: 'Équipes' },
  { href: '/#tous-les-outils', label: 'Tous les outils' },
];

export const categoryOrder: ToolCategory[] = ['roues', 'tirages', 'reseaux', 'groupes', 'hasard', 'listes'];

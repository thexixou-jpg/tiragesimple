export type ToolCategory = 'roues' | 'tirages' | 'groupes' | 'hasard' | 'listes';

export interface ToolDefinition {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  category: ToolCategory;
  icon: string;
  related: string[];
  popular?: boolean;
}

export const categoryLabels: Record<ToolCategory, string> = {
  roues: 'Roues',
  tirages: 'Tirages',
  groupes: 'Groupes',
  hasard: 'Hasard',
  listes: 'Outils de listes',
};

export const tools: ToolDefinition[] = [
  { slug: 'roue-aleatoire', title: 'Roue aléatoire', shortTitle: 'Roue aléatoire', description: 'Ajoutez vos choix et laissez la roue désigner un gagnant.', category: 'roues', icon: '◉', related: ['roue-des-prenoms', 'roue-alphabet', 'tirage-au-sort'], popular: true },
  { slug: 'roue-des-prenoms', title: 'Roue des prénoms', shortTitle: 'Roue des prénoms', description: 'Tirez un prénom au hasard avec une roue prête à personnaliser.', category: 'roues', icon: 'Aa', related: ['roue-aleatoire', 'tirage-nom', 'roue-alphabet'] },
  { slug: 'roue-alphabet', title: 'Roue de l’alphabet', shortTitle: 'Roue alphabet', description: 'Faites tourner une roue contenant les 26 lettres de A à Z.', category: 'roues', icon: 'AZ', related: ['lettre-aleatoire', 'roue-aleatoire', 'roue-des-prenoms'] },
  { slug: 'tirage-au-sort', title: 'Tirage au sort', shortTitle: 'Tirage au sort', description: 'Tirez un ou plusieurs gagnants dans une liste.', category: 'tirages', icon: '✦', related: ['roue-aleatoire', 'tirage-nom', 'tirage-sans-remise'], popular: true },
  { slug: 'tirage-sans-remise', title: 'Tirage sans remise', shortTitle: 'Sans remise', description: 'Tirez chaque élément une seule fois, jusqu’à épuisement.', category: 'tirages', icon: '↻', related: ['tirage-au-sort', 'ordre-aleatoire', 'roue-aleatoire'] },
  { slug: 'generateur-equipes', title: 'Générateur d’équipes', shortTitle: 'Équipes', description: 'Créez rapidement des équipes aléatoires et équilibrées.', category: 'groupes', icon: '◆', related: ['generateur-groupes', 'melanger-liste', 'ordre-aleatoire'], popular: true },
  { slug: 'generateur-groupes', title: 'Générateur de groupes', shortTitle: 'Groupes', description: 'Répartissez une classe ou un atelier en groupes équilibrés.', category: 'groupes', icon: '⬡', related: ['generateur-equipes', 'ordre-aleatoire', 'melanger-liste'] },
  { slug: 'nombre-aleatoire', title: 'Nombre aléatoire', shortTitle: 'Nombre aléatoire', description: 'Générez un ou plusieurs nombres dans l’intervalle choisi.', category: 'hasard', icon: '#', related: ['de-en-ligne', 'lettre-aleatoire', 'couleur-aleatoire'], popular: true },
  { slug: 'melanger-liste', title: 'Mélanger une liste', shortTitle: 'Mélanger une liste', description: 'Réorganisez les éléments de votre liste au hasard.', category: 'listes', icon: '≋', related: ['ordre-aleatoire', 'tirage-nom', 'generateur-groupes'] },
  { slug: 'ordre-aleatoire', title: 'Ordre aléatoire', shortTitle: 'Ordre aléatoire', description: 'Créez un ordre de passage numéroté et impartial.', category: 'listes', icon: '☷', related: ['melanger-liste', 'tirage-sans-remise', 'generateur-equipes'] },
  { slug: 'tirage-nom', title: 'Tirage d’un nom', shortTitle: 'Tirage d’un nom', description: 'Choisissez instantanément un nom dans une liste.', category: 'tirages', icon: '●', related: ['tirage-au-sort', 'roue-aleatoire', 'tirage-sans-remise'] },
  { slug: 'de-en-ligne', title: 'Dé en ligne', shortTitle: 'Dé en ligne', description: 'Lancez des dés de D4 à D100 et calculez le total.', category: 'hasard', icon: '⚄', related: ['nombre-aleatoire', 'pile-ou-face', 'oui-ou-non'], popular: true },
  { slug: 'pile-ou-face', title: 'Pile ou face', shortTitle: 'Pile ou face', description: 'Lancez une pièce virtuelle en un clic.', category: 'hasard', icon: '◑', related: ['oui-ou-non', 'de-en-ligne', 'nombre-aleatoire'], popular: true },
  { slug: 'oui-ou-non', title: 'Oui ou non', shortTitle: 'Oui ou non', description: 'Obtenez une réponse simple pour vous décider.', category: 'hasard', icon: '✓', related: ['pile-ou-face', 'nombre-aleatoire', 'roue-de-la-chance'] },
  { slug: 'roue-de-la-chance', title: 'Roue de la chance', shortTitle: 'Roue de la chance', description: 'Une roue vive et colorée pour vos choix aléatoires.', category: 'roues', icon: '✺', related: ['roue-aleatoire', 'oui-ou-non', 'tirage-au-sort'] },
  { slug: 'lettre-aleatoire', title: 'Lettre aléatoire', shortTitle: 'Lettre aléatoire', description: 'Tirez des lettres de l’alphabet, avec ou sans accents.', category: 'hasard', icon: 'A', related: ['nombre-aleatoire', 'couleur-aleatoire', 'de-en-ligne'] },
  { slug: 'couleur-aleatoire', title: 'Couleur aléatoire', shortTitle: 'Couleur aléatoire', description: 'Générez une couleur avec ses codes HEX, RGB et HSL.', category: 'hasard', icon: '◐', related: ['lettre-aleatoire', 'nombre-aleatoire', 'roue-de-la-chance'] },
];

export const getTool = (slug: string): ToolDefinition => {
  const tool = tools.find((item) => item.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
};

export const getRelatedTools = (slug: string): ToolDefinition[] =>
  getTool(slug).related.map(getTool);

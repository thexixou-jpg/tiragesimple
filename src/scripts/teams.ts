import { trackEvent } from '../lib/analytics';
import { parseList } from '../lib/lists';
import { distributeBySize, distributeEvenly } from '../lib/teams';
import { setFieldError, validateInteger } from '../lib/validation';

function initTeamTool(root: HTMLElement): void {
  if (root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  const isTeams = root.dataset.variant === 'teams';
  const singular = isTeams ? 'Équipe' : 'Groupe';
  const plural = isTeams ? 'équipes' : 'groupes';
  const pluralWithArticle = isTeams ? 'd’équipes' : 'de groupes';
  const input = root.querySelector<HTMLTextAreaElement>('[data-list-input]');
  const dedupe = root.querySelector<HTMLInputElement>('[data-remove-duplicates]');
  const mode = root.querySelector<HTMLSelectElement>('[data-team-mode]');
  const value = root.querySelector<HTMLInputElement>('[data-team-value]');
  const valueLabel = root.querySelector<HTMLElement>('[data-team-value-label]');
  const createButton = root.querySelector<HTMLButtonElement>('[data-create-teams]');
  const remixButton = root.querySelector<HTMLButtonElement>('[data-remix]');
  const output = root.querySelector<HTMLElement>('[data-team-output]');
  if (!input || !mode || !value || !createButton || !output) return;

  let lastGroups: string[][] = [];
  let groupNames: string[] = [];

  const updateCopyValue = (): void => {
    output.dataset.copyValue = lastGroups.map((members, index) => {
      const name = groupNames[index] ?? `${singular} ${index + 1}`;
      return `${name}\n${members.map((member) => `- ${member}`).join('\n')}`;
    }).join('\n\n');
  };

  const render = (groups: string[][]): void => {
    lastGroups = groups;
    groupNames = groups.map((_, index) => groupNames[index] ?? `${singular} ${index + 1}`);
    output.replaceChildren();
    groups.forEach((members, index) => {
      const card = document.createElement('article');
      card.className = 'team-card';
      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'team-name';
      name.value = groupNames[index]!;
      name.setAttribute('aria-label', `Nom de ${singular.toLowerCase()} ${index + 1}`);
      name.addEventListener('input', () => { groupNames[index] = name.value.trim() || `${singular} ${index + 1}`; updateCopyValue(); });
      const count = document.createElement('span');
      count.className = 'team-count';
      count.textContent = `${members.length} ${members.length === 1 ? 'personne' : 'personnes'}`;
      const list = document.createElement('ul');
      members.forEach((member) => {
        const item = document.createElement('li');
        item.textContent = member;
        list.append(item);
      });
      card.append(name, count, list);
      output.append(card);
    });
    output.hidden = false;
    if (remixButton) remixButton.hidden = false;
    updateCopyValue();
  };

  const create = (): void => {
    const participants = parseList(input.value, { removeDuplicates: dedupe?.checked });
    if (participants.length === 0) { setFieldError(root, 'Ajoutez au moins une personne.'); return; }
    const validation = validateInteger(value.value, mode.value === 'count' ? `Le nombre ${pluralWithArticle}` : 'La taille', { min: 1, max: 10_000 });
    if (!validation.valid) { setFieldError(root, validation.error); return; }
    if (mode.value === 'count' && validation.value! > participants.length) {
      setFieldError(root, `Le nombre ${pluralWithArticle} ne peut pas dépasser le nombre de personnes.`);
      return;
    }
    setFieldError(root);
    groupNames = [];
    const groups = mode.value === 'count'
      ? distributeEvenly(participants, validation.value!)
      : distributeBySize(participants, validation.value!);
    render(groups);
    trackEvent('tool_used', { tool: isTeams ? 'generateur-equipes' : 'generateur-groupes', item_count: participants.length, group_count: groups.length });
  };

  mode.addEventListener('change', () => {
    if (valueLabel) valueLabel.textContent = mode.value === 'count' ? `Nombre de ${plural}` : `Taille par ${isTeams ? 'équipe' : 'groupe'}`;
  });
  input.addEventListener('input', () => { output.hidden = true; if (remixButton) remixButton.hidden = true; });
  createButton.addEventListener('click', create);
  remixButton?.addEventListener('click', () => {
    const participants = lastGroups.flat();
    const groups = distributeEvenly(participants, lastGroups.length);
    render(groups);
  });
}

document.querySelectorAll<HTMLElement>('[data-team-tool]').forEach(initTeamTool);

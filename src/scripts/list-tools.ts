import { trackEvent } from '../lib/analytics';
import { parseList, serializeList } from '../lib/lists';
import { randomItem, shuffle } from '../lib/random';
import { setFieldError } from '../lib/validation';

function initSimpleListTool(root: HTMLElement): void {
  const mode = root.dataset.mode as 'shuffle' | 'order' | 'name';
  const input = root.querySelector<HTMLTextAreaElement>('[data-list-input]');
  const dedupe = root.querySelector<HTMLInputElement>('[data-remove-duplicates]');
  const action = root.querySelector<HTMLButtonElement>('[data-list-action]');
  const redraw = root.querySelector<HTMLButtonElement>('[data-list-redraw]');
  const replace = root.querySelector<HTMLButtonElement>('[data-replace-list]');
  const resultCard = root.querySelector<HTMLElement>('[data-result-card]');
  const resultValue = root.querySelector<HTMLElement>('[data-result-value]');
  if (!input || !action || !resultCard || !resultValue) return;
  let latest: string[] = [];

  const run = (): void => {
    const items = parseList(input.value, { removeDuplicates: dedupe?.checked });
    if (items.length === 0) { setFieldError(root, 'Ajoutez au moins un élément.'); return; }
    setFieldError(root);
    resultValue.replaceChildren();
    if (mode === 'name') {
      latest = [randomItem(items)];
      resultValue.textContent = latest[0]!;
    } else {
      latest = shuffle(items);
      const list = document.createElement(mode === 'order' ? 'ol' : 'ul');
      list.className = 'generated-list';
      latest.forEach((value) => { const item = document.createElement('li'); item.textContent = value; list.append(item); });
      resultValue.append(list);
    }
    resultValue.dataset.copyValue = mode === 'order'
      ? latest.map((value, index) => `${index + 1}. ${value}`).join('\n')
      : serializeList(latest);
    resultCard.hidden = false;
    if (replace) replace.hidden = false;
    trackEvent('tool_used', { tool: mode === 'shuffle' ? 'melanger-liste' : mode === 'order' ? 'ordre-aleatoire' : 'tirage-nom', item_count: items.length });
  };

  action.addEventListener('click', run);
  redraw?.addEventListener('click', run);
  replace?.addEventListener('click', () => {
    input.value = serializeList(latest);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
}
document.querySelectorAll<HTMLElement>('[data-simple-list-tool]').forEach(initSimpleListTool);

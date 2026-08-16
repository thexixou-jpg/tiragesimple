import { trackEvent } from '../lib/analytics';
import { randomInteger, randomItem } from '../lib/random';
import { setFieldError, validateInteger } from '../lib/validation';

function restartAnimation(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  requestAnimationFrame(() => element.classList.add(className));
}

function initQuickTool(root: HTMLElement): void {
  const mode = root.dataset.mode;
  const action = root.querySelector<HTMLButtonElement>('[data-quick-action]');
  if (!action) return;

  if (mode === 'dice') {
    const type = root.querySelector<HTMLSelectElement>('[data-dice-type]');
    const countInput = root.querySelector<HTMLInputElement>('[data-dice-count]');
    const result = root.querySelector<HTMLElement>('[data-quick-result]');
    const grid = root.querySelector<HTMLElement>('[data-dice-grid]');
    const total = root.querySelector<HTMLElement>('[data-dice-total]');
    if (!type || !countInput || !result || !grid || !total) return;
    action.addEventListener('click', () => {
      const count = validateInteger(countInput.value, 'Le nombre de dés', { min: 1, max: 100 });
      if (!count.valid) { setFieldError(root, count.error); return; }
      setFieldError(root);
      const faces = Number(type.value);
      const rolls = Array.from({ length: count.value! }, () => randomInteger(1, faces));
      grid.replaceChildren();
      rolls.forEach((roll) => { const die = document.createElement('span'); die.className = 'die-result'; die.textContent = String(roll); grid.append(die); });
      total.textContent = String(rolls.reduce((sum, roll) => sum + roll, 0));
      result.hidden = false;
      restartAnimation(grid, 'is-rolling');
      trackEvent('tool_used', { tool: 'de-en-ligne', dice_count: rolls.length, faces });
    });
    return;
  }

  const answer = root.querySelector<HTMLElement>('[data-quick-answer]');
  if (!answer) return;
  if (mode === 'coin') {
    const coin = root.querySelector<HTMLElement>('[data-coin]');
    const face = root.querySelector<HTMLElement>('[data-coin-face]');
    const historyList = root.querySelector<HTMLOListElement>('[data-quick-history]');
    if (!coin || !face || !historyList) return;
    const history: string[] = [];
    action.addEventListener('click', () => {
      const result = randomItem(['Pile', 'Face'] as const);
      face.textContent = result === 'Pile' ? 'P' : 'F';
      answer.textContent = result;
      restartAnimation(coin, 'is-flipping');
      history.unshift(result);
      history.splice(8);
      historyList.replaceChildren(...history.map((value) => { const item = document.createElement('li'); item.textContent = value; return item; }));
      trackEvent('tool_used', { tool: 'pile-ou-face' });
    });
    return;
  }

  const orb = root.querySelector<HTMLElement>('[data-answer-orb]');
  if (!orb) return;
  action.addEventListener('click', () => {
    const result = randomItem(['Oui', 'Non'] as const);
    orb.textContent = result === 'Oui' ? '✓' : '×';
    orb.dataset.answer = result.toLowerCase();
    answer.textContent = result;
    restartAnimation(orb, 'is-answering');
    trackEvent('tool_used', { tool: 'oui-ou-non' });
  });
}
document.querySelectorAll<HTMLElement>('[data-quick-tool]').forEach(initQuickTool);

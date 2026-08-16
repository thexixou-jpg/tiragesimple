import { trackEvent } from '../lib/analytics';
import { generateNumbers } from '../lib/numbers';
import { setFieldError, validateInteger } from '../lib/validation';

function initNumberTool(root: HTMLElement): void {
  const minInput = root.querySelector<HTMLInputElement>('[data-number-min]');
  const maxInput = root.querySelector<HTMLInputElement>('[data-number-max]');
  const countInput = root.querySelector<HTMLInputElement>('[data-number-count]');
  const order = root.querySelector<HTMLSelectElement>('[data-number-order]');
  const unique = root.querySelector<HTMLInputElement>('[data-number-unique]');
  const button = root.querySelector<HTMLButtonElement>('[data-generate-numbers]');
  const resultCard = root.querySelector<HTMLElement>('[data-result-card]');
  const resultValue = root.querySelector<HTMLElement>('[data-result-value]');
  if (!minInput || !maxInput || !countInput || !button || !resultCard || !resultValue) return;

  button.addEventListener('click', () => {
    const min = validateInteger(minInput.value, 'Le minimum');
    const max = validateInteger(maxInput.value, 'Le maximum');
    const count = validateInteger(countInput.value, 'La quantité', { min: 1, max: 10_000 });
    const error = min.error ?? max.error ?? count.error;
    if (error) { setFieldError(root, error); return; }
    if (min.value! > max.value!) { setFieldError(root, 'Le minimum doit être inférieur ou égal au maximum.'); return; }
    const range = max.value! - min.value! + 1;
    if (!Number.isSafeInteger(range)) { setFieldError(root, 'Cet intervalle est trop grand.'); return; }
    if (unique?.checked && count.value! > range) { setFieldError(root, 'La quantité sans doublons dépasse le nombre de valeurs disponibles.'); return; }
    setFieldError(root);
    const values = generateNumbers({ min: min.value!, max: max.value!, count: count.value!, unique: unique?.checked, sorted: order?.value === 'sorted' });
    const text = values.map((value) => value.toLocaleString('fr-FR')).join(values.length > 10 ? '\n' : ' · ');
    resultValue.textContent = text;
    resultValue.dataset.copyValue = values.join('\n');
    resultCard.hidden = false;
    trackEvent('tool_used', { tool: 'nombre-aleatoire', count: values.length });
  });
}
document.querySelectorAll<HTMLElement>('[data-number-tool]').forEach(initNumberTool);

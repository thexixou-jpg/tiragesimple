import { trackEvent } from '../lib/analytics';
import { generateColor } from '../lib/colors';
import { ACCENTED_LETTERS, BASIC_LETTERS, generateLetters } from '../lib/letters';
import { setFieldError, validateInteger } from '../lib/validation';

function initLetterTool(root: HTMLElement): void {
  const countInput = root.querySelector<HTMLInputElement>('[data-letter-count]');
  const accents = root.querySelector<HTMLInputElement>('[data-letter-accents]');
  const unique = root.querySelector<HTMLInputElement>('[data-letter-unique]');
  const button = root.querySelector<HTMLButtonElement>('[data-generate-letters]');
  const card = root.querySelector<HTMLElement>('[data-result-card]');
  const value = root.querySelector<HTMLElement>('[data-result-value]');
  if (!countInput || !button || !card || !value) return;
  button.addEventListener('click', () => {
    const count = validateInteger(countInput.value, 'La quantité', { min: 1, max: 1_000 });
    if (!count.valid) { setFieldError(root, count.error); return; }
    const alphabetSize = BASIC_LETTERS.length + (accents?.checked ? ACCENTED_LETTERS.length : 0);
    if (unique?.checked && count.value! > alphabetSize) { setFieldError(root, `La quantité sans doublons ne peut pas dépasser ${alphabetSize}.`); return; }
    setFieldError(root);
    const letters = generateLetters(count.value!, accents?.checked, unique?.checked);
    value.textContent = letters.join(' · ');
    value.dataset.copyValue = letters.join('\n');
    card.hidden = false;
    trackEvent('tool_used', { tool: 'lettre-aleatoire', count: letters.length });
  });
}

function initColorTool(root: HTMLElement): void {
  const preview = root.querySelector<HTMLElement>('[data-color-preview]');
  const button = root.querySelector<HTMLButtonElement>('[data-generate-color]');
  if (!preview || !button) return;
  const generate = (): void => {
    const color = generateColor();
    preview.style.backgroundColor = color.hex;
    preview.setAttribute('aria-label', `Aperçu de la couleur ${color.hex}`);
    (['hex', 'rgb', 'hsl'] as const).forEach((format) => {
      const target = root.querySelector<HTMLElement>(`[data-color-format="${format}"]`);
      if (target) { target.textContent = color[format]; target.dataset.copyValue = color[format]; }
    });
    trackEvent('tool_used', { tool: 'couleur-aleatoire' });
  };
  button.addEventListener('click', generate);
  generate();
}

document.querySelectorAll<HTMLElement>('[data-letter-tool]').forEach(initLetterTool);
document.querySelectorAll<HTMLElement>('[data-color-tool]').forEach(initColorTool);

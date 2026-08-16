import { formatCount, parseList } from '../lib/lists';
import { trackEvent } from '../lib/analytics';

function setTemporaryLabel(button: HTMLElement, text: string): void {
  const label = button.querySelector<HTMLElement>('[data-button-label]');
  if (!label) return;
  const original = label.textContent ?? '';
  label.textContent = text;
  window.setTimeout(() => { label.textContent = original; }, 1_800);
}

function initListEditor(editor: HTMLElement): void {
  const input = editor.querySelector<HTMLTextAreaElement>('[data-list-input]');
  const count = editor.querySelector<HTMLElement>('[data-list-count]');
  const dedupe = editor.querySelector<HTMLInputElement>('[data-remove-duplicates]');
  const clear = editor.querySelector<HTMLButtonElement>('[data-clear-list]');
  if (!input || !count) return;

  const update = (): void => {
    const items = parseList(input.value, { removeDuplicates: dedupe?.checked });
    count.textContent = formatCount(items.length);
    editor.dispatchEvent(new CustomEvent('listchange', { bubbles: true, detail: { items } }));
  };
  input.addEventListener('input', update);
  dedupe?.addEventListener('change', update);
  clear?.addEventListener('click', () => {
    input.value = '';
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  update();
}

function initCopyButton(button: HTMLElement): void {
  button.addEventListener('click', async () => {
    const selector = button.dataset.copyTarget;
    const target = selector ? document.querySelector<HTMLElement>(selector) : null;
    const text = target?.dataset.copyValue ?? target?.innerText ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setTemporaryLabel(button, 'Copié !');
      trackEvent('result_copied');
    } catch {
      setTemporaryLabel(button, 'Échec');
    }
  });
}

function initFullscreenButton(button: HTMLElement): void {
  button.addEventListener('click', async () => {
    const selector = button.dataset.fullscreenTarget;
    const target = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (!target) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (target.requestFullscreen) await target.requestFullscreen();
  });
}

document.querySelectorAll<HTMLElement>('[data-list-editor]').forEach(initListEditor);
document.querySelectorAll<HTMLElement>('[data-copy-target]').forEach(initCopyButton);
document.querySelectorAll<HTMLElement>('[data-fullscreen-target]').forEach(initFullscreenButton);

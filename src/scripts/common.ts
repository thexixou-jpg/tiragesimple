import { formatCount, parseList } from '../lib/lists';
import { trackEvent } from '../lib/analytics';
/* Consent is managed externally when enabled. */
/*
function initConsentBanner(): void {
  const banner = document.querySelector<HTMLElement>('[data-consent-banner]');
  if (!banner) return;
  const options = banner.querySelector<HTMLElement>('[data-consent-options]');
  const analytics = banner.querySelector<HTMLInputElement>('[data-consent-analytics]');
  const advertising = banner.querySelector<HTMLInputElement>('[data-consent-advertising]');
  const show = (customize = false): void => {
    banner.hidden = false;
    banner.setAttribute('aria-hidden', 'false');
    if (options) options.hidden = !customize;
    if (customize) analytics && (analytics.checked = readConsent()?.analytics === true);
    if (customize) advertising && (advertising.checked = readConsent()?.advertising === true);
  };
  const hide = (): void => { banner.hidden = true; banner.setAttribute('aria-hidden', 'true'); };
  const commit = (a: boolean, p: boolean): void => {
    const preference = saveConsent({ analytics: a, advertising: p });
    hide();
    window.dispatchEvent(new CustomEvent('tiragesimple:consentchange', { detail: preference }));
    if (p) loadAdsIfConsented();
  };
  if (!readConsent()) show();
  loadAdsIfConsented();
  banner.querySelector('[data-consent-accept]')?.addEventListener('click', () => commit(true, true));
  banner.querySelector('[data-consent-reject]')?.addEventListener('click', () => commit(false, false));
  banner.querySelector('[data-consent-customize]')?.addEventListener('click', () => show(true));
  banner.querySelector('[data-consent-save]')?.addEventListener('click', () => commit(analytics?.checked === true, advertising?.checked === true));
  document.querySelectorAll('[data-open-consent]').forEach((button) => button.addEventListener('click', () => show(true)));
}
*/

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

function initThemeToggle(button: HTMLButtonElement): void {
  const icon = button.querySelector<HTMLElement>('[data-theme-icon]');
  const label = button.querySelector<HTMLElement>('[data-theme-label]');
  const applyTheme = (theme: 'light' | 'dark'): void => {
    document.documentElement.dataset.theme = theme;
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', theme === 'dark' ? 'Activer le thème clair' : 'Activer le thème sombre');
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '◐';
    if (label) label.textContent = theme === 'dark' ? 'Thème clair' : 'Thème sombre';
    window.dispatchEvent(new CustomEvent('themechange'));
  };
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current);
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('tiragesimple:theme', next); } catch { /* Theme still changes for this visit. */ }
    applyTheme(next);
  });
}

function initResultShareButton(button: HTMLButtonElement): void {
  if (button.dataset.shareResult === 'wheel') return;
  button.addEventListener('click', async () => {
    const target = document.querySelector<HTMLElement>(button.dataset.shareTarget ?? '');
    const result = target?.dataset.copyValue ?? target?.innerText ?? '';
    if (!result) return;
    const shareData = { title: 'Résultat TirageSimple', text: `Résultat du tirage : ${result}`, url: window.location.href };
    const supportsShare = typeof (navigator as { share?: unknown }).share === 'function';
    try {
      if (supportsShare) await navigator.share(shareData);
      else await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
      setTemporaryLabel(button, supportsShare ? 'Partagé !' : 'Lien copié !');
    } catch { /* Closing the share sheet does not need an error message. */ }
  });
}

document.querySelectorAll<HTMLElement>('[data-list-editor]').forEach(initListEditor);
document.querySelectorAll<HTMLElement>('[data-copy-target]').forEach(initCopyButton);
document.querySelectorAll<HTMLElement>('[data-fullscreen-target]').forEach(initFullscreenButton);
document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach(initThemeToggle);
document.querySelectorAll<HTMLButtonElement>('[data-share-target]').forEach(initResultShareButton);

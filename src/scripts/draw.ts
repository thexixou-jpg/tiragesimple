import { trackEvent } from '../lib/analytics';
import { drawItems } from '../lib/draw';
import { formatCount, parseList, removeFirst, serializeList } from '../lib/lists';
import { setFieldError, validateInteger } from '../lib/validation';

function renderNames(target: HTMLElement, names: readonly string[]): void {
  target.replaceChildren();
  if (names.length === 1) {
    target.textContent = names[0]!;
  } else {
    const list = document.createElement('ol');
    list.className = 'winner-list';
    names.forEach((name) => {
      const item = document.createElement('li');
      item.textContent = name;
      list.append(item);
    });
    target.append(list);
  }
  target.dataset.copyValue = names.map((name, index) => `${index + 1}. ${name}`).join('\n');
}

function initDrawTool(root: HTMLElement): void {
  if (root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';
  const mode = root.dataset.mode === 'without-replacement' ? 'without-replacement' : 'multiple';
  const input = root.querySelector<HTMLTextAreaElement>('[data-list-input]');
  const dedupe = root.querySelector<HTMLInputElement>('[data-remove-duplicates]');
  const countInput = root.querySelector<HTMLInputElement>('[data-draw-count]');
  const withoutReplacement = root.querySelector<HTMLInputElement>('[data-without-replacement]');
  const drawButton = root.querySelector<HTMLButtonElement>('[data-draw-button]');
  const redrawButton = root.querySelector<HTMLButtonElement>('[data-redraw]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-reset-draw]');
  const resultCard = root.querySelector<HTMLElement>('[data-result-card]');
  const resultValue = root.querySelector<HTMLElement>('[data-result-value]');
  const remainingCount = root.querySelector<HTMLElement>('[data-remaining-count]');
  const historyList = root.querySelector<HTMLOListElement>('[data-draw-history]');
  const listCount = root.querySelector<HTMLElement>('[data-list-count]');
  if (!input || !drawButton || !resultCard || !resultValue) return;

  let original: string[] = [];
  let remaining: string[] = [];
  let history: string[] = [];

  const renderHistory = (): void => {
    if (!historyList) return;
    historyList.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'Aucun élément tiré.';
      historyList.append(empty);
      return;
    }
    history.forEach((name) => {
      const item = document.createElement('li');
      item.textContent = name;
      historyList.append(item);
    });
  };

  const syncList = (): void => {
    original = parseList(input.value, { removeDuplicates: dedupe?.checked });
    if (mode === 'without-replacement') {
      remaining = [...original];
      history = [];
      if (remainingCount) remainingCount.textContent = String(remaining.length);
      resultCard.hidden = true;
      renderHistory();
    }
    drawButton.disabled = original.length === 0;
    setFieldError(root);
  };

  const drawMultiple = (): void => {
    const items = parseList(input.value, { removeDuplicates: dedupe?.checked });
    const validation = validateInteger(countInput?.value ?? '', 'Le nombre de gagnants', { min: 1, max: 10_000 });
    if (!validation.valid) { setFieldError(root, validation.error); return; }
    const count = validation.value!;
    const unique = withoutReplacement?.checked ?? true;
    if (unique && count > items.length) {
      setFieldError(root, 'Le nombre de gagnants ne peut pas dépasser le nombre de participants sans remise.');
      return;
    }
    setFieldError(root);
    const winners = drawItems(items, count, unique);
    renderNames(resultValue, winners);
    resultCard.hidden = false;
    trackEvent('tool_used', { tool: 'tirage-au-sort', item_count: items.length, winner_count: count });
  };

  const drawWithoutReplacement = (): void => {
    if (remaining.length === 0) { setFieldError(root, 'Tous les éléments ont été tirés. Réinitialisez pour recommencer.'); return; }
    const [winner] = drawItems(remaining, 1);
    remaining = removeFirst(remaining, winner!);
    history = [...history, winner!];
    input.value = serializeList(remaining);
    if (listCount) listCount.textContent = formatCount(remaining.length);
    renderNames(resultValue, [winner!]);
    resultCard.hidden = false;
    if (remainingCount) remainingCount.textContent = String(remaining.length);
    drawButton.disabled = remaining.length === 0;
    renderHistory();
    setFieldError(root, remaining.length === 0 ? 'Tous les éléments ont été tirés.' : '');
    trackEvent('tool_used', { tool: 'tirage-sans-remise', remaining: remaining.length });
  };

  input.addEventListener('input', syncList);
  dedupe?.addEventListener('change', syncList);
  drawButton.addEventListener('click', mode === 'multiple' ? drawMultiple : drawWithoutReplacement);
  redrawButton?.addEventListener('click', drawMultiple);
  resetButton?.addEventListener('click', () => {
    remaining = [...original];
    history = [];
    input.value = serializeList(remaining);
    if (listCount) listCount.textContent = formatCount(remaining.length);
    if (remainingCount) remainingCount.textContent = String(remaining.length);
    drawButton.disabled = remaining.length === 0;
    resultCard.hidden = true;
    setFieldError(root);
    renderHistory();
  });
  syncList();
}

document.querySelectorAll<HTMLElement>('[data-draw-tool]').forEach(initDrawTool);

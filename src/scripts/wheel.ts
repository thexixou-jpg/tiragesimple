import { trackEvent } from '../lib/analytics';
import { parseList, removeFirst, serializeList } from '../lib/lists';
import { randomInteger } from '../lib/random';
import { buildShareUrl, readSharedConfig, shareUrl } from '../lib/share';
import { loadLocal, saveLocal, STORAGE_KEYS } from '../lib/storage';
import { normalizeAngle, targetRotation } from '../lib/wheel-math';

interface WheelState {
  participants: string[];
  removeDuplicates: boolean;
  sound: boolean;
  displaySize?: WheelSize;
}

type WheelSize = 'compact' | 'standard' | 'large';
interface SharedWheelConfig extends Pick<WheelState, 'participants' | 'removeDuplicates'> { result?: { winner: string; timestamp: number }; }
interface HistoryEntry { winner: string; timestamp: number; }
interface HistoryState { wheel?: HistoryEntry[]; chance?: HistoryEntry[]; }

const STANDARD_COLORS = ['#6757e8', '#198cff', '#8b5cf6', '#0ea5a4', '#ec4899', '#f59e0b', '#4f46e5', '#06b6d4'];
const CHANCE_COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#84cc16'];
const FULL_TURN = Math.PI * 2;

function initWheel(root: HTMLElement): void {
  if (root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const variant = root.dataset.variant === 'chance' ? 'chance' : 'standard';
  const canvas = root.querySelector<HTMLCanvasElement>('[data-wheel-canvas]');
  const stage = root.querySelector<HTMLElement>('[data-wheel-stage]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-list-input]');
  const dedupe = root.querySelector<HTMLInputElement>('[data-remove-duplicates]');
  const spinButton = root.querySelector<HTMLButtonElement>('[data-spin]');
  const replayButton = root.querySelector<HTMLButtonElement>('[data-replay]');
  const removeButton = root.querySelector<HTMLButtonElement>('[data-remove-winner]');
  const soundButton = root.querySelector<HTMLButtonElement>('[data-sound-toggle]');
  const shareButton = root.querySelector<HTMLButtonElement>('[data-share-button]');
  const shareResultButton = root.querySelector<HTMLButtonElement>('[data-share-result="wheel"]');
  const sizeButtons = root.querySelectorAll<HTMLButtonElement>('[data-wheel-size]');
  const status = root.querySelector<HTMLElement>('[data-wheel-status]');
  const resultCard = root.querySelector<HTMLElement>('[data-result-card]');
  const resultValue = root.querySelector<HTMLElement>('[data-result-value]');
  const historyList = root.querySelector<HTMLOListElement>('[data-wheel-history]');
  const clearHistory = root.querySelector<HTMLButtonElement>('[data-clear-history]');
  const confetti = root.querySelector<HTMLElement>('[data-confetti]');
  if (!canvas || !stage || !input || !spinButton || !status || !resultCard || !resultValue || !historyList) return;

  const storageKey = variant === 'chance' ? `${STORAGE_KEYS.wheel}:chance` : STORAGE_KEYS.wheel;
  const saved = loadLocal<WheelState | null>(storageKey, null);
  const shared = readSharedConfig<SharedWheelConfig>();
  const initial = shared ?? saved;
  if (initial?.participants?.length) input.value = serializeList(initial.participants);
  if (dedupe && typeof initial?.removeDuplicates === 'boolean') dedupe.checked = initial.removeDuplicates;
  let sound = saved?.sound ?? true;
  let displaySize: WheelSize = saved?.displaySize ?? 'standard';
  let participants: string[] = [];
  let rotation = 0;
  let spinning = false;
  let lastWinner = '';
  let historyState = loadLocal<HistoryState>(STORAGE_KEYS.history, {});
  let history = variant === 'chance' ? (historyState.chance ?? []) : (historyState.wheel ?? []);

  const colors = variant === 'chance' ? CHANCE_COLORS : STANDARD_COLORS;

  const setStatus = (message = ''): void => {
    status.textContent = message;
    status.hidden = !message;
  };

  const updateSoundButton = (): void => {
    if (!soundButton) return;
    soundButton.setAttribute('aria-pressed', String(sound));
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = sound ? '♪' : '×';
    soundButton.replaceChildren(icon, document.createTextNode(` Son ${sound ? 'activé' : 'désactivé'}`));
  };

  const updateDisplaySize = (size: WheelSize): void => {
    displaySize = size;
    root.dataset.wheelSize = size;
    sizeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.wheelSize === size)));
    requestAnimationFrame(drawWheel);
  };

  const saveState = (): void => {
    saveLocal(storageKey, { participants, removeDuplicates: dedupe?.checked ?? false, sound, displaySize } satisfies WheelState);
  };

  const saveHistory = (): void => {
    historyState = variant === 'chance' ? { ...historyState, chance: history } : { ...historyState, wheel: history };
    saveLocal(STORAGE_KEYS.history, historyState);
  };

  const renderHistory = (): void => {
    historyList.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty-state';
      empty.textContent = 'Aucun tirage pour le moment.';
      historyList.append(empty);
      return;
    }
    for (const entry of history.slice(0, 10)) {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      const time = document.createElement('time');
      name.textContent = entry.winner;
      time.dateTime = new Date(entry.timestamp).toISOString();
      time.textContent = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(entry.timestamp);
      item.append(name, time);
      historyList.append(item);
    }
  };

  const drawWheel = (): void => {
    const size = Math.max(260, Math.min(stage.clientWidth, 560));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    const center = size / 2;
    const radius = center - 5;
    const items = participants.length > 0 ? participants : ['Ajoutez des choix'];
    const segment = FULL_TURN / items.length;
    items.forEach((item, index) => {
      const start = -Math.PI / 2 + index * segment;
      const end = start + segment;
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, start, end);
      context.closePath();
      context.fillStyle = participants.length > 0 ? colors[index % colors.length]! : getComputedStyle(document.documentElement).getPropertyValue('--wheel-empty').trim();
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.75)';
      context.lineWidth = items.length > 200 ? 0.25 : 1.5;
      context.stroke();

      if (items.length <= 100) {
        context.save();
        context.translate(center, center);
        context.rotate(start + segment / 2);
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        context.fillStyle = participants.length > 0 ? '#fff' : getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim();
        context.font = `700 ${Math.max(9, Math.min(15, 250 / items.length + 8))}px Inter, system-ui, sans-serif`;
        const maxLength = items.length > 24 ? 12 : 24;
        const label = item.length > maxLength ? `${item.slice(0, maxLength - 1)}…` : item;
        context.fillText(label, radius - 18, 0, Math.max(36, radius * 0.62));
        context.restore();
      }
    });
    canvas.setAttribute('aria-label', `Roue avec ${participants.length} choix`);
  };

  const updateParticipants = (): void => {
    participants = parseList(input.value, { removeDuplicates: dedupe?.checked, limit: 10_000 });
    spinButton.disabled = participants.length === 0 || spinning;
    setStatus(participants.length === 0 ? 'Ajoutez au moins un choix pour tourner la roue.' : '');
    drawWheel();
    saveState();
  };

  const playWinSound = (): void => {
    if (!sound) return;
    try {
      const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.setValueAtTime(523, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(784, audio.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.3);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.31);
      oscillator.addEventListener('ended', () => void audio.close());
    } catch { /* The wheel remains usable when audio is blocked. */ }
  };

  const celebrate = (): void => {
    if (!confetti || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    confetti.replaceChildren();
    for (let index = 0; index < 28; index += 1) {
      const piece = document.createElement('i');
      piece.style.setProperty('--x', `${randomInteger(-140, 140)}px`);
      piece.style.setProperty('--delay', `${randomInteger(0, 180)}ms`);
      piece.style.setProperty('--color', colors[index % colors.length]!);
      confetti.append(piece);
    }
    window.setTimeout(() => confetti.replaceChildren(), 1_800);
  };

  const finishSpin = (winner: string): void => {
    spinning = false;
    input.disabled = false;
    if (dedupe) dedupe.disabled = false;
    spinButton.disabled = participants.length === 0;
    lastWinner = winner;
    resultValue.textContent = winner;
    resultValue.dataset.copyValue = winner;
    resultCard.hidden = false;
    history = [{ winner, timestamp: Date.now() }, ...history].slice(0, 20);
    saveHistory();
    renderHistory();
    playWinSound();
    celebrate();
  };

  const spin = (): void => {
    if (spinning || participants.length === 0) return;
    const winnerIndex = randomInteger(0, participants.length - 1);
    const winner = participants[winnerIndex]!;
    const turns = randomInteger(6, 9);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 240 : randomInteger(4_000, 6_000);
    const from = rotation;
    const to = targetRotation(from, winnerIndex, participants.length, turns);
    const started = performance.now();
    spinning = true;
    input.disabled = true;
    if (dedupe) dedupe.disabled = true;
    spinButton.disabled = true;
    resultCard.hidden = true;
    setStatus('La roue tourne…');
    trackEvent('wheel_spun', { variant, item_count: participants.length });

    const frame = (now: number): void => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 5;
      rotation = from + (to - from) * eased;
      canvas.style.transform = `rotate(${rotation}rad)`;
      if (progress < 1) requestAnimationFrame(frame);
      else {
        rotation = normalizeAngle(to);
        canvas.style.transform = `rotate(${rotation}rad)`;
        setStatus('');
        finishSpin(winner);
      }
    };
    requestAnimationFrame(frame);
  };

  input.addEventListener('input', updateParticipants);
  dedupe?.addEventListener('change', updateParticipants);
  spinButton.addEventListener('click', spin);
  replayButton?.addEventListener('click', spin);
  removeButton?.addEventListener('click', () => {
    if (!lastWinner) return;
    participants = removeFirst(participants, lastWinner);
    input.value = serializeList(participants);
    resultCard.hidden = true;
    updateParticipants();
    if (participants.length > 0) spin();
  });
  soundButton?.addEventListener('click', () => { sound = !sound; updateSoundButton(); saveState(); });
  clearHistory?.addEventListener('click', () => { history = []; saveHistory(); renderHistory(); });
  sizeButtons.forEach((button) => button.addEventListener('click', () => {
    const size = button.dataset.wheelSize;
    if (size !== 'compact' && size !== 'standard' && size !== 'large') return;
    updateDisplaySize(size);
    saveState();
  }));
  shareButton?.addEventListener('click', async () => {
    try {
      const url = buildShareUrl({ participants, removeDuplicates: dedupe?.checked ?? false });
      const mode = await shareUrl(url);
      const label = shareButton.querySelector<HTMLElement>('[data-button-label]');
      if (label) label.textContent = mode === 'copied' ? 'Lien copié !' : 'Partagé !';
      trackEvent('share_clicked', { tool: variant === 'chance' ? 'roue-de-la-chance' : 'roue-aleatoire' });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Impossible de partager cette roue.');
    }
  });
  shareResultButton?.addEventListener('click', async () => {
    if (!lastWinner) return;
    try {
      const url = buildShareUrl({ participants, removeDuplicates: dedupe?.checked ?? false, result: { winner: lastWinner, timestamp: Date.now() } });
      const mode = await shareUrl(url, `Résultat : ${lastWinner} – TirageSimple`);
      const label = shareResultButton.querySelector<HTMLElement>('[data-button-label]');
      if (label) label.textContent = mode === 'copied' ? 'Lien copié !' : 'Partagé !';
      trackEvent('share_clicked', { tool: variant === 'chance' ? 'roue-de-la-chance' : 'roue-aleatoire', content: 'result' });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Impossible de partager ce résultat.');
    }
  });

  new ResizeObserver(drawWheel).observe(stage);
  updateSoundButton();
  updateDisplaySize(displaySize);
  renderHistory();
  updateParticipants();
  if (shared?.result?.winner) {
    lastWinner = shared.result.winner;
    resultValue.textContent = lastWinner;
    resultValue.dataset.copyValue = lastWinner;
    resultCard.hidden = false;
  }
  window.addEventListener('themechange', drawWheel);
}

document.querySelectorAll<HTMLElement>('[data-wheel]').forEach(initWheel);

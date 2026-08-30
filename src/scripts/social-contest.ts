interface Publication { title?: string; authorName?: string; publishedAt?: string; thumbnailUrl?: string }
interface ImportState { status: string; progress_current: number; participant_count: number; error_message?: string }
interface Winner { displayName?: string; username?: string; providerUserId?: string }
interface Draw { publicId: string; publicUrl?: string; winners: Winner[]; alternates: Winner[] }

for (const root of document.querySelectorAll<HTMLElement>('[data-social-contest]')) {
  const provider = root.dataset.provider === 'bluesky' ? 'bluesky' : 'youtube';
  const api = (root.dataset.apiUrl || '/_tiragesimple').replace(/\/$/u, '');
  const form = root.querySelector<HTMLFormElement>('[data-contest-form]')!;
  const input = root.querySelector<HTMLInputElement>('[data-video-url]')!;
  const feedback = root.querySelector<HTMLElement>('[data-feedback]')!;
  const preview = root.querySelector<HTMLElement>('[data-preview]')!;
  const publication = root.querySelector<HTMLElement>('[data-publication]')!;
  const importButton = root.querySelector<HTMLButtonElement>('[data-import]')!;
  const drawPanel = root.querySelector<HTMLElement>('[data-draw]')!;
  const drawButton = root.querySelector<HTMLButtonElement>('[data-draw-button]')!;
  const progress = root.querySelector<HTMLElement>('[data-progress]')!;
  const result = root.querySelector<HTMLElement>('[data-result]')!;
  let ready = false, busy = false, analyzedUrl = '', importId = '', revision = 0;
  let previewTimer: number | undefined, pollTimer: number | undefined;
  const say = (message: string) => { feedback.textContent = message; };
  const errorText = (error: unknown) => error instanceof Error ? error.message : 'Une erreur est survenue.';
  const request = async <T>(path: string, body?: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${api}${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'include',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    } catch { throw new Error('Connexion au service impossible. Vérifiez votre connexion et réessayez.'); }
    const payload = await response.json().catch(() => ({ error: 'Le service ne répond pas correctement.' }));
    if (!response.ok || payload.error) throw new Error(payload.error || 'Le service est indisponible.');
    return payload as T;
  };
  const lock = (value: boolean) => {
    busy = value;
    form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach(el => { el.disabled = value; });
    importButton.disabled = value || !ready || !analyzedUrl;
  };
  const resetDraw = () => {
    window.clearTimeout(pollTimer); importId = ''; drawPanel.hidden = true; drawButton.disabled = true;
    result.hidden = true; result.replaceChildren();
  };
  const eligibleUrl = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (provider === 'bluesky'
        ? url.hostname === 'bsky.app' && /^\/profile\/[^/]+\/post\/[^/]+\/?$/u.test(url.pathname)
        : ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname));
    } catch { return false; }
  };
  const analyze = async () => {
    if (!ready || busy || !form.reportValidity()) return;
    const url = input.value.trim();
    if (!eligibleUrl(url)) { say(`Utilisez un lien ${provider === 'bluesky' ? 'bsky.app vers une publication' : 'YouTube vers une vidéo ou un Short'}.`); return; }
    const current = ++revision;
    analyzedUrl = ''; importButton.disabled = true; publication.hidden = true;
    preview.dataset.state = 'loading'; say('Chargement de l’aperçu…');
    try {
      const { publication: data } = await request<{ publication: Publication }>(`/v1/${provider}/publication`, { url });
      if (current !== revision || url !== input.value.trim()) return;
      root.querySelector<HTMLElement>('[data-publication-title]')!.textContent = data.title || 'Publication';
      const date = data.publishedAt && !Number.isNaN(Date.parse(data.publishedAt)) ? new Intl.DateTimeFormat('fr-FR').format(new Date(data.publishedAt)) : '';
      root.querySelector<HTMLElement>('[data-publication-meta]')!.textContent = [data.authorName, date].filter(Boolean).join(' · ');
      const image = root.querySelector<HTMLImageElement>('[data-thumbnail]');
      if (image) {
        image.hidden = !data.thumbnailUrl;
        image.onerror = () => { image.hidden = true; };
        if (data.thumbnailUrl) { image.src = data.thumbnailUrl; image.alt = `Miniature : ${data.title || 'vidéo'}`; }
        else image.removeAttribute('src');
      }
      analyzedUrl = url; publication.hidden = false; preview.dataset.state = 'ready'; importButton.disabled = false;
      say('Aperçu prêt. Choisissez vos règles puis lancez l’import.');
    } catch (error) {
      if (current !== revision) return;
      preview.dataset.state = 'error'; say(errorText(error));
    }
  };
  const readRules = () => {
    const data = new FormData(form);
    const duplicateEntries = provider === 'youtube' && data.get('duplicateEntries') === 'on';
    return { winnerCount: Number(data.get('winnerCount')), alternateCount: Number(data.get('alternateCount')),
      uniqueParticipants: !duplicateEntries, duplicateEntries,
      includeReplies: provider === 'youtube' && data.get('includeReplies') === 'on',
      excludePublicationAuthor: data.get('excludePublicationAuthor') === 'on',
      requiredKeyword: provider === 'youtube' ? String(data.get('requiredKeyword') || '').trim() : undefined,
      excludedUsers: String(data.get('excludedUsers') || '').split(/[\n,]/u).map(v => v.trim().replace(/^@/u, '')).filter(Boolean),
      ...(provider === 'bluesky' ? { interaction: String(data.get('interaction')) } : {}),
    };
  };
  const poll = async (id: string, current: number) => {
    try {
      const { import: state } = await request<{ import: ImportState }>(`/v1/imports/${id}`);
      if (current !== revision || id !== importId) return;
      progress.textContent = `${state.progress_current} ${provider === 'youtube' ? 'commentaires et réponses analysés' : 'interactions analysées'} · ${state.participant_count} comptes éligibles`;
      if (state.status === 'failed') { lock(false); say(state.error_message || 'Import interrompu. Aucun tirage partiel ne sera effectué.'); return; }
      if (state.status === 'ready') {
        lock(false);
        drawButton.disabled = state.participant_count === 0;
        say(state.participant_count ? 'Import terminé. Les règles affichées sont celles appliquées à cette liste.' : 'Aucun participant éligible avec ces règles.');
        return;
      }
      pollTimer = window.setTimeout(() => { void poll(id, current); }, 1800);
    } catch (error) { if (current === revision) { lock(false); say(`${errorText(error)} Relancez l’import si nécessaire.`); } }
  };
  form.addEventListener('submit', event => { event.preventDefault(); window.clearTimeout(previewTimer); void analyze(); });
  input.addEventListener('input', () => {
    revision++; analyzedUrl = ''; publication.hidden = true; preview.dataset.state = 'idle'; importButton.disabled = true; resetDraw();
    window.clearTimeout(previewTimer);
    if (eligibleUrl(input.value.trim())) previewTimer = window.setTimeout(() => { void analyze(); }, 700);
  });
  form.addEventListener('change', event => { if (event.target !== input && !busy) { revision++; resetDraw(); say('Règles modifiées : importez à nouveau pour les appliquer.'); } });
  importButton.addEventListener('click', async () => {
    if (busy || !ready || analyzedUrl !== input.value.trim() || !form.reportValidity()) return;
    const rules = readRules(); // Read before disabling form controls.
    resetDraw(); const current = ++revision; lock(true); say('Import en cours. Les grands volumes peuvent prendre plusieurs minutes.');
    try {
      const payload = await request<{ import: { id: string } }>(`/v1/${provider}/imports`, { url: analyzedUrl, rules });
      importId = payload.import.id; drawPanel.hidden = false; progress.textContent = 'Import en attente…';
      void poll(importId, current);
    } catch (error) { lock(false); say(errorText(error)); }
  });
  drawButton.disabled = true;
  drawButton.addEventListener('click', async () => {
    if (!importId || drawButton.disabled) return;
    drawButton.disabled = true; lock(true); say('Tirage sécurisé en cours…');
    const visibility = root.querySelector<HTMLInputElement>('[data-public-visibility]')!;
    visibility.disabled = true;
    try {
      const { draw } = await request<{ draw: Draw }>(`/v1/imports/${importId}/draw`, { publicVisibility: visibility.checked });
      result.replaceChildren(); result.hidden = false;
      const format = (w: Winner) => w.username ? `${w.displayName || w.username} (@${w.username.replace(/^@/u, '')})` : w.displayName || w.providerUserId || 'Participant';
      const title = document.createElement('p'); title.className = 'result-label'; title.textContent = 'Gagnant(s)';
      const names = document.createElement('p'); names.className = 'result-value'; names.textContent = draw.winners.map(format).join(', ');
      result.append(title, names);
      if (draw.alternates.length) { const p = document.createElement('p'); p.textContent = `Suppléant(s) : ${draw.alternates.map(format).join(', ')}`; result.append(p); }
      if (draw.publicUrl) {
        const link = document.createElement('a'); link.href = draw.publicUrl; link.textContent = 'Ouvrir le résultat partagé'; link.target = '_blank'; link.rel = 'noopener'; result.append(link);
      }
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'button button-secondary'; copy.textContent = 'Copier le résultat';
      const text = `Tirage ${draw.publicId}\n${analyzedUrl}\nGagnants : ${draw.winners.map(format).join(', ')}\nSuppléants : ${draw.alternates.map(format).join(', ') || 'aucun'}\n${progress.textContent}\n${draw.publicUrl || 'Résultat privé'}`;
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Résultat copié'; } catch { say('Copie indisponible : sélectionnez le résultat pour le copier.'); } });
      result.append(copy); say('Tirage terminé. Pour un nouveau tirage, lancez un nouvel import.');
    } catch (error) { say(errorText(error)); }
    finally { lock(false); visibility.disabled = false; }
  });
  void request<{ providers: Record<string, string> }>('/v1/providers').then(data => {
    ready = data.providers[provider] === 'enabled';
    say(ready ? 'Prêt. Collez le lien de votre publication.' : 'Ce connecteur est temporairement indisponible.');
    if (ready && eligibleUrl(input.value.trim())) void analyze();
  }).catch(error => say(errorText(error)));
}

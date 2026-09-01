interface Publication { title?: string; authorName?: string; publishedAt?: string; thumbnailUrl?: string }
interface ImportState { status: string; progress_current: number; participant_count: number; error_message?: string }
interface Winner { displayName?: string; username?: string; providerUserId?: string }
interface Draw {
  publicId: string; publicUrl?: string; winners: Winner[]; alternates: Winner[];
  participantSnapshotHash: string; randomCommitmentHash: string; resultHash: string; verificationSeed: string;
  receipt: Record<string, unknown>;
}

for (const root of document.querySelectorAll<HTMLElement>('[data-social-contest]')) {
  const provider = root.dataset.provider === 'bluesky' ? 'bluesky' : root.dataset.provider === 'mastodon' ? 'mastodon' : root.dataset.provider === 'lemmy' ? 'lemmy' : root.dataset.provider === 'github' ? 'github' : 'youtube';
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
  const rulesSummary = root.querySelector<HTMLElement>('[data-rules-summary]')!;
  const result = root.querySelector<HTMLElement>('[data-result]')!;
  let ready = false, busy = false, analyzedUrl = '', importId = '', revision = 0;
  let requestedCount = 1, appliedSummary: string[] = [];
  let previewTimer: number | undefined, pollTimer: number | undefined, receiptObjectUrl = '';
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
    if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl); receiptObjectUrl = '';
    result.hidden = true; result.replaceChildren();
    rulesSummary.replaceChildren(); appliedSummary = [];
  };
  const sha256Hex = async (value: string) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const eligibleUrl = (value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
      if (provider === 'bluesky') return url.hostname === 'bsky.app' && /^\/profile\/[^/]+\/post\/[^/]+\/?$/u.test(url.pathname);
      if (provider === 'mastodon') {
        const hosts = (root.dataset.allowedHosts || '').split(',');
        const path = decodeURIComponent(url.pathname);
        return hosts.includes(url.hostname.toLowerCase()) && [/^\/@[^/]+\/[A-Za-z0-9_-]+\/?$/u, /^\/users\/[^/]+\/statuses\/[A-Za-z0-9_-]+\/?$/u, /^\/web\/statuses\/[A-Za-z0-9_-]+\/?$/u].some(pattern => pattern.test(path));
      }
      if (provider === 'lemmy') {
        const hosts = (root.dataset.allowedHosts || '').split(',');
        return hosts.includes(url.hostname.toLowerCase()) && /^\/post\/[1-9]\d{0,19}\/?$/u.test(url.pathname);
      }
      if (provider === 'github') return url.hostname.toLowerCase() === 'github.com' && /^\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}\/(?:issues|pull)\/[1-9]\d{0,9}\/?$/u.test(url.pathname);
      return ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname);
    } catch { return false; }
  };
  const analyze = async () => {
    if (!ready || busy || !form.reportValidity()) return;
    const url = input.value.trim();
    if (!eligibleUrl(url)) { say(`Utilisez un lien ${provider === 'bluesky' ? 'bsky.app vers une publication' : provider === 'mastodon' ? 'provenant d’une instance Mastodon prise en charge' : provider === 'lemmy' ? 'vers un post d’une instance Lemmy prise en charge' : provider === 'github' ? 'vers une issue ou pull request GitHub publique' : 'YouTube vers une vidéo ou un Short'}.`); return; }
    resetDraw();
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
    const commentProvider = provider === 'youtube' || provider === 'lemmy' || provider === 'github';
    const replyProvider = provider === 'youtube' || provider === 'lemmy';
    const duplicateEntries = commentProvider && data.get('duplicateEntries') === 'on';
    return { winnerCount: Number(data.get('winnerCount')), alternateCount: Number(data.get('alternateCount')),
      uniqueParticipants: !duplicateEntries, duplicateEntries,
      includeReplies: replyProvider && data.get('includeReplies') === 'on',
      excludePublicationAuthor: data.get('excludePublicationAuthor') === 'on',
      requiredKeyword: commentProvider ? String(data.get('requiredKeyword') || '').trim() : undefined,
      excludedUsers: String(data.get('excludedUsers') || '').split(/[\n,]/u).map(v => v.trim().replace(/^@/u, '')).filter(Boolean),
      ...(!commentProvider ? { interaction: String(data.get('interaction')) } : {}),
    };
  };
  const poll = async (id: string, current: number) => {
    try {
      const { import: state } = await request<{ import: ImportState }>(`/v1/imports/${id}`);
      if (current !== revision || id !== importId) return;
      progress.textContent = `${state.progress_current} ${provider === 'youtube' || provider === 'lemmy' ? 'commentaires et réponses analysés' : provider === 'github' ? 'commentaires analysés' : 'interactions analysées'} · ${state.participant_count} comptes éligibles`;
      if (state.status === 'failed') { lock(false); say(state.error_message || 'Import interrompu. Aucun tirage partiel ne sera effectué.'); return; }
      if (state.status === 'ready') {
        lock(false);
        drawButton.disabled = state.participant_count < requestedCount;
        say(state.participant_count < requestedCount
          ? `Il faut ${requestedCount} comptes distincts pour vos gagnants et suppléants, mais seulement ${state.participant_count} sont éligibles. Réduisez les nombres ou ajustez les règles puis réimportez.`
          : 'Import terminé. Vérifiez le récapitulatif avant de lancer le tirage.');
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
  form.addEventListener('change', event => { if (event.target !== input && !busy) { if (importId) revision++; resetDraw(); say('Règles modifiées : importez à nouveau pour les appliquer.'); } });
  importButton.addEventListener('click', async () => {
    if (busy || !ready || analyzedUrl !== input.value.trim() || !form.reportValidity()) return;
    const rules = readRules(); // Read before disabling form controls.
    if (provider === 'youtube' && rules.excludedUsers.some(id => !/^UC[\w-]{22}$/u.test(id))) { say('Pour les exclusions YouTube, indiquez des identifiants de chaîne UC… (24 caractères), pas des pseudos ni des URL.'); return; }
    resetDraw(); const current = ++revision; lock(true); say('Import en cours. Les grands volumes peuvent prendre plusieurs minutes.');
    try {
      const payload = await request<{ import: { id: string }; rulesSummary: string[]; requestedCount: number }>(`/v1/${provider}/imports`, { url: analyzedUrl, rules });
      appliedSummary = payload.rulesSummary; requestedCount = payload.requestedCount;
      rulesSummary.replaceChildren(...appliedSummary.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
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
      const reference = document.createElement('p'); reference.className = 'result-reference';
      const referenceLabel = document.createElement('strong'); referenceLabel.textContent = 'Référence : ';
      reference.append(referenceLabel, draw.publicId); result.append(reference);
      const proof = document.createElement('details'); proof.className = 'draw-proof';
      const proofTitle = document.createElement('summary'); proofTitle.textContent = 'Afficher les empreintes techniques';
      const proofHelp = document.createElement('p'); proofHelp.textContent = 'Ces empreintes détectent une modification du jeu de données ou du résultat. Elles ne constituent pas une certification indépendante et la liste privée ne permet pas à un tiers de rejouer seul le tirage.';
      const proofList = document.createElement('dl');
      for (const [label, value] of [['Liste des participants', draw.participantSnapshotHash], ['Engagement aléatoire', draw.randomCommitmentHash], ['Graine révélée', draw.verificationSeed], ['Résultat', draw.resultHash]] as const) {
        const term = document.createElement('dt'); term.textContent = label;
        const description = document.createElement('dd'); const code = document.createElement('code'); code.textContent = value; description.append(code); proofList.append(term, description);
      }
      proof.append(proofTitle, proofHelp, proofList); result.append(proof);
      const proofStatus = document.createElement('p'); proofStatus.className = 'proof-status';
      try {
        const commitment = await sha256Hex(draw.verificationSeed);
        proofStatus.textContent = commitment === draw.randomCommitmentHash ? '✓ Engagement aléatoire cohérent, vérifié localement.' : '⚠ Engagement aléatoire incohérent : conservez le reçu et contactez-nous.';
        proofStatus.dataset.state = commitment === draw.randomCommitmentHash ? 'valid' : 'invalid';
      } catch { proofStatus.textContent = 'Vérification locale indisponible dans ce navigateur.'; proofStatus.dataset.state = 'unknown'; }
      proof.append(proofStatus);
      if (draw.publicUrl) {
        const link = document.createElement('a'); link.href = draw.publicUrl; link.textContent = 'Ouvrir le résultat partagé'; link.target = '_blank'; link.rel = 'noopener'; result.append(link);
      }
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'button button-secondary'; copy.textContent = 'Copier le résultat';
      const text = `Tirage ${draw.publicId}\n${analyzedUrl}\nGagnants : ${draw.winners.map(format).join(', ')}\nSuppléants : ${draw.alternates.map(format).join(', ') || 'aucun'}\n${progress.textContent}\nRègles appliquées :\n${appliedSummary.map(line => `- ${line}`).join('\n')}\nEmpreinte participants : ${draw.participantSnapshotHash}\nEngagement aléatoire : ${draw.randomCommitmentHash}\nGraine révélée : ${draw.verificationSeed}\nEmpreinte résultat : ${draw.resultHash}\n${draw.publicUrl || 'Résultat privé'}`;
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Résultat copié'; } catch { say('Copie indisponible : sélectionnez le résultat pour le copier.'); } });
      receiptObjectUrl = URL.createObjectURL(new Blob([JSON.stringify(draw.receipt, null, 2)], { type: 'application/json' }));
      const download = document.createElement('a'); download.className = 'button button-secondary'; download.href = receiptObjectUrl; download.download = `${draw.publicId}.json`; download.textContent = 'Télécharger le reçu JSON';
      const resultActions = document.createElement('div'); resultActions.className = 'result-actions'; resultActions.append(copy, download);
      result.append(resultActions); say('Tirage terminé. Téléchargez le reçu si vous souhaitez le conserver après son expiration.');
    } catch (error) { say(errorText(error)); }
    finally { lock(false); visibility.disabled = false; }
  });
  void request<{ providers: Record<string, string> }>('/v1/providers').then(data => {
    ready = data.providers[provider] === 'enabled';
    say(ready ? 'Prêt. Collez le lien de votre publication.' : 'Ce connecteur est temporairement indisponible.');
    if (ready && eligibleUrl(input.value.trim())) void analyze();
  }).catch(error => say(errorText(error)));
}

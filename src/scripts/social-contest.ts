import { parseStackExchangeUrl } from '../lib/stackexchange-sites';
interface Publication { title?: string; authorName?: string; publishedAt?: string; thumbnailUrl?: string }
interface ClientPublication extends Publication { authorProviderId?: string; chatToken?: string; websocketUrl?: string; reactions?: Array<{ id:string; label:string; count:number }> }
interface ClientComment { providerCommentId: string; providerUserId: string; username?: string; displayName?: string; text: string; isReply: false; createdAt?: string }
interface ImportState { status: string; progress_current: number; participant_count: number; error_message?: string }
interface Winner { displayName?: string; username?: string; providerUserId?: string }
interface Draw {
  publicId: string; publicUrl?: string; winners: Winner[]; alternates: Winner[];
  participantSnapshotHash: string; randomCommitmentHash: string; resultHash: string; verificationSeed: string;
  receipt: Record<string, unknown>;
}

for (const root of document.querySelectorAll<HTMLElement>('[data-social-contest]')) {
  const provider = root.dataset.provider === 'bluesky' ? 'bluesky' : root.dataset.provider === 'mastodon' ? 'mastodon' : root.dataset.provider === 'pixelfed' ? 'pixelfed' : root.dataset.provider === 'lemmy' ? 'lemmy' : root.dataset.provider === 'reddit' ? 'reddit' : root.dataset.provider === 'github' ? 'github' : root.dataset.provider === 'gitlab' ? 'gitlab' : root.dataset.provider === 'bitbucket' ? 'bitbucket' : root.dataset.provider === 'devto' ? 'devto' : root.dataset.provider === 'hackernews' ? 'hackernews' : root.dataset.provider === 'stackexchange' ? 'stackexchange' : root.dataset.provider === 'wordpress' ? 'wordpress' : root.dataset.provider === 'peertube' ? 'peertube' : root.dataset.provider === 'youtube_live' ? 'youtube_live' : root.dataset.provider === 'vimeo' ? 'vimeo' : root.dataset.provider === 'soundcloud' ? 'soundcloud' : root.dataset.provider === 'mixcloud' ? 'mixcloud' : root.dataset.provider === 'twitch' ? 'twitch' : root.dataset.provider === 'kick' ? 'kick' : root.dataset.provider === 'trovo' ? 'trovo' : root.dataset.provider === 'discord' ? 'discord' : 'youtube';
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
  let ready = false, busy = false, analyzedUrl = '', importId = '', revision = 0, clientSourced = false;
  let clientPublication: ClientPublication | undefined;
  let requestedCount = 1, appliedSummary: string[] = [];
  let previewTimer: number | undefined, pollTimer: number | undefined, receiptObjectUrl = '';
  let trovoSocket: WebSocket | undefined, trovoHeartbeat: number | undefined, trovoComments: ClientComment[] = [];
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
  const publicApi = async <T>(url: string): Promise<T> => {
    let response: Response;
    try { response = await fetch(url, { credentials: 'omit', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('L’API publique ne répond pas depuis votre navigateur.'); }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error_id || payload.message && response.status >= 400) throw new Error(payload.error_message || payload.message || `API publique indisponible (${response.status}).`);
    if (payload.backoff) throw new Error(`La plateforme demande une pause de ${payload.backoff} secondes. Réessayez ensuite.`);
    return payload as T;
  };
  const directPreview = async (url: string): Promise<ClientPublication> => {
    const parsed = new URL(url);
    if (provider === 'github') {
      const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/([1-9]\d{0,9})\/?$/u)!;
      const data = await publicApi<{ title?: string; created_at?: string; user?: { id?: number; login?: string } }>(`https://api.github.com/repos/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}/issues/${match[3]}`);
      if (!data.title || !data.user?.id) throw new Error('Conversation GitHub publique introuvable.');
      return { title: data.title, authorName: data.user.login, authorProviderId: String(data.user.id), publishedAt: data.created_at };
    }
    throw new Error('Collecte navigateur non disponible.');
  };
  const directComments = async (url: string): Promise<ClientComment[]> => {
    if (provider === 'trovo') {
      if (!trovoSocket) throw new Error('La collecte Trovo n’est pas active.');
      trovoSocket.close(1000, 'collection complete'); trovoSocket = undefined; window.clearInterval(trovoHeartbeat);
      return trovoComments.slice();
    }
    const parsed = new URL(url); const comments: ClientComment[] = [];
    if (provider === 'github') {
      const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/([1-9]\d{0,9})\/?$/u)!;
      for (let page = 1; page <= 100; page++) {
        say(`Collecte officielle GitHub dans votre navigateur · page ${page}…`);
        const items = await publicApi<Array<{ id?: number; node_id?: string; body?: string; created_at?: string; user?: { id?: number; login?: string } }>>(`https://api.github.com/repos/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}/issues/${match[3]}/comments?per_page=100&page=${page}&sort=created&direction=asc`);
        for (const item of items) if (item.id && item.user?.id && item.user.login) comments.push({ providerCommentId: item.node_id || String(item.id), providerUserId: String(item.user.id), username: item.user.login.toLowerCase(), displayName: item.user.login, text: item.body || '', isReply: false, createdAt: item.created_at });
        if (items.length < 100) return comments;
      }
    }
    throw new Error('La collecte dépasse 10 000 contributions et a été interrompue sans tirage partiel.');
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
      if (provider === 'pixelfed') { const hosts=(root.dataset.allowedHosts||'').split(','); return hosts.includes(url.hostname.toLowerCase()) && /^\/p\/[A-Za-z0-9_.-]{1,64}\/[1-9]\d{5,24}\/?$/u.test(url.pathname) && !url.search && !url.hash; }
      if (provider === 'lemmy') {
        const hosts = (root.dataset.allowedHosts || '').split(',');
        return hosts.includes(url.hostname.toLowerCase()) && /^\/post\/[1-9]\d{0,19}\/?$/u.test(url.pathname);
      }
      if (provider === 'github') return url.hostname.toLowerCase() === 'github.com' && /^\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}\/(?:issues|pull)\/[1-9]\d{0,9}\/?$/u.test(url.pathname);
      if (provider === 'stackexchange') return Boolean(parseStackExchangeUrl(value));
      if (provider === 'twitch') return ['twitch.tv', 'www.twitch.tv'].includes(url.hostname.toLowerCase()) && /^\/[A-Za-z0-9_]{4,25}\/?$/u.test(url.pathname);
      if (provider === 'kick') return ['kick.com', 'www.kick.com'].includes(url.hostname.toLowerCase()) && /^\/[A-Za-z0-9_-]{3,25}\/?$/u.test(url.pathname);
      if (provider === 'trovo') return ['trovo.live', 'www.trovo.live'].includes(url.hostname.toLowerCase()) && /^\/[A-Za-z0-9_]{3,50}\/?$/u.test(url.pathname);
      if (provider === 'discord') return ['discord.com', 'www.discord.com'].includes(url.hostname.toLowerCase()) && /^\/channels\/[1-9]\d{16,19}\/[1-9]\d{16,19}\/[1-9]\d{16,19}\/?$/u.test(url.pathname);
      if (provider === 'reddit') return ['reddit.com','www.reddit.com','old.reddit.com'].includes(url.hostname.toLowerCase()) && /^\/r\/[A-Za-z0-9_]{2,21}\/comments\/[a-z0-9]{5,10}(?:\/[^/]*)?\/?$/iu.test(url.pathname) || url.hostname.toLowerCase() === 'redd.it' && /^\/[a-z0-9]{5,10}\/?$/iu.test(url.pathname);
      if (provider === 'vimeo') return ['vimeo.com','www.vimeo.com'].includes(url.hostname.toLowerCase()) && /\/[1-9]\d{5,14}\/?$/u.test(url.pathname) || url.hostname.toLowerCase() === 'player.vimeo.com' && /^\/video\/[1-9]\d{5,14}\/?$/u.test(url.pathname);
      if (provider === 'soundcloud') return ['soundcloud.com','www.soundcloud.com'].includes(url.hostname.toLowerCase()) && /^\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}\/?$/u.test(url.pathname) || url.hostname.toLowerCase() === 'on.soundcloud.com' && /^\/[A-Za-z0-9_-]{3,100}\/?$/u.test(url.pathname);
      if (provider === 'mixcloud') return ['mixcloud.com','www.mixcloud.com'].includes(url.hostname.toLowerCase()) && /^\/[A-Za-z0-9_.-]{1,150}\/[A-Za-z0-9_.-]{1,150}\/?$/u.test(url.pathname);
      if (provider === 'gitlab') return url.hostname.toLowerCase() === 'gitlab.com' && /^\/(?:[A-Za-z0-9_.-]{1,255}\/){2,20}-\/(?:issues|merge_requests)\/[1-9]\d{0,9}\/?$/u.test(url.pathname);
      if (provider === 'devto') return url.hostname.toLowerCase() === 'dev.to' && /^\/[A-Za-z0-9_-]{2,100}\/[A-Za-z0-9-]{1,300}\/?$/u.test(url.pathname) && !url.search && !url.hash;
      if (provider === 'bitbucket') return url.hostname.toLowerCase() === 'bitbucket.org' && /^\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9._-]{1,100}\/pull-requests\/[1-9]\d{0,9}\/?$/u.test(url.pathname) && !url.search && !url.hash;
      if (provider === 'hackernews') return url.hostname.toLowerCase() === 'news.ycombinator.com' && url.pathname === '/item' && /^[1-9]\d{0,11}$/u.test(url.searchParams.get('id') || '') && [...url.searchParams.keys()].every(key => key === 'id') && url.searchParams.getAll('id').length === 1 && !url.hash;
      if (provider === 'wordpress') return url.hostname.toLowerCase().endsWith('.wordpress.com') && url.hostname.toLowerCase() !== 'www.wordpress.com' && /^\/(?:[^/]+\/)*[A-Za-z0-9][A-Za-z0-9-]{0,299}\/?$/u.test(url.pathname) && !url.search && !url.hash;
      if (provider === 'peertube') { const hosts=(root.dataset.allowedHosts||'').split(','); return hosts.includes(url.hostname.toLowerCase()) && /^\/(?:videos\/watch|w)\/[A-Za-z0-9_-]{8,64}\/?$/u.test(url.pathname) && !url.search && !url.hash; }
      return ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname);
    } catch { return provider === 'twitch' && /^[A-Za-z0-9_]{4,25}$/u.test(value) || provider === 'kick' && /^[A-Za-z0-9_-]{3,25}$/u.test(value) || provider === 'trovo' && /^[A-Za-z0-9_]{3,50}$/u.test(value); }
  };
  const stopTrovo = () => { trovoSocket?.close(1000, 'collection stopped'); trovoSocket = undefined; window.clearInterval(trovoHeartbeat); };
  const startTrovo = (data: ClientPublication) => new Promise<void>((resolve, reject) => {
    if (!data.chatToken || data.websocketUrl !== 'wss://open-chat.trovo.live/chat') return reject(new Error('Jeton de chat Trovo invalide.'));
    stopTrovo(); trovoComments = []; const seen = new Set<string>(); let characters = 0; let authenticated = false;
    const socket = new WebSocket(data.websocketUrl); trovoSocket = socket;
    const timeout = window.setTimeout(() => { if (!authenticated) { socket.close(); reject(new Error('Le chat Trovo n’a pas répondu à temps.')); } }, 12000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type:'AUTH', nonce:crypto.randomUUID(), data:{ token:data.chatToken } })));
    socket.addEventListener('message', event => {
      try {
        const payload = JSON.parse(String(event.data)) as { type?: string; error?: string; data?: { gap?: number; chats?: Array<{ type?: number; content?: string; nick_name?: string; message_id?: string; sender_id?: number | string; uid?: number | string; send_time?: number | string; user_name?: string }> } };
        if (payload.error) throw new Error(payload.error);
        if (payload.type === 'RESPONSE' && !authenticated) {
          authenticated = true; window.clearTimeout(timeout); trovoHeartbeat = window.setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type:'PING', nonce:crypto.randomUUID() })); }, 30000); resolve(); return;
        }
        if (payload.type !== 'CHAT') return;
        for (const chat of payload.data?.chats || []) {
          const id = String(chat.message_id || ''); const userId = String(chat.sender_id || chat.uid || ''); const text = String(chat.content || '');
          if (chat.type !== 0 || !id || !userId || !text || seen.has(id)) continue;
          if (trovoComments.length >= 10000 || characters + text.length > 2_000_000) { say('Limite de sécurité atteinte : arrêtez la collecte et préparez le tirage.'); continue; }
          seen.add(id); characters += text.length;
          trovoComments.push({ providerCommentId:id, providerUserId:userId, username:chat.user_name, displayName:chat.nick_name || chat.user_name, text, isReply:false, createdAt:chat.send_time ? new Date(Number(chat.send_time) * 1000).toISOString() : undefined });
          const counter = root.querySelector<HTMLElement>('[data-trovo-count]'); if (counter) counter.textContent = `${trovoComments.length} message${trovoComments.length > 1 ? 's' : ''} reçu${trovoComments.length > 1 ? 's' : ''}`;
        }
      } catch (error) { if (!authenticated) { window.clearTimeout(timeout); reject(error); } }
    });
    socket.addEventListener('error', () => { if (!authenticated) { window.clearTimeout(timeout); reject(new Error('Connexion WebSocket Trovo impossible.')); } else say('Le flux Trovo a été interrompu. Préparez le tirage avec les messages déjà reçus.'); });
    socket.addEventListener('close', () => { window.clearInterval(trovoHeartbeat); if (trovoSocket === socket) trovoSocket = undefined; });
  });
  const analyze = async () => {
    if (!ready || busy || !form.reportValidity()) return;
    const url = input.value.trim();
    if (!eligibleUrl(url)) { say(`Utilisez ${provider === 'twitch' ? 'un login ou un lien de chaîne Twitch' : provider === 'kick' ? 'le login ou le lien de votre chaîne Kick connectée' : provider === 'trovo' ? 'un login ou un lien de chaîne Trovo' : provider === 'discord' ? 'le lien complet d’un message Discord de serveur' : `un lien ${provider === 'bluesky' ? 'bsky.app vers une publication' : provider === 'mastodon' ? 'provenant d’une instance Mastodon prise en charge' : provider === 'lemmy' ? 'vers un post d’une instance Lemmy prise en charge' : provider === 'reddit' ? 'vers une publication Reddit publique' : provider === 'vimeo' ? 'vers une vidéo Vimeo publique' : provider === 'soundcloud' ? 'vers une piste SoundCloud publique' : provider === 'mixcloud' ? 'vers une émission Mixcloud publique' : provider === 'github' ? 'vers une issue ou pull request GitHub publique' : provider === 'gitlab' ? 'vers une issue ou merge request GitLab.com publique' : provider === 'bitbucket' ? 'vers une pull request Bitbucket publique' : provider === 'devto' ? 'vers un article DEV Community public' : provider === 'hackernews' ? 'vers une publication Hacker News publique' : provider === 'stackexchange' ? 'vers une question Stack Exchange publique' : provider === 'wordpress' ? 'vers un article public hébergé sur WordPress.com' : provider === 'peertube' ? 'vers une vidéo d’une instance PeerTube prise en charge' : 'YouTube vers une vidéo ou un Short'}`}.`); return; }
    resetDraw();
    const current = ++revision;
    analyzedUrl = ''; clientSourced = false; clientPublication = undefined; importButton.disabled = true; publication.hidden = true;
    preview.dataset.state = 'loading'; say('Chargement de l’aperçu…');
    try {
      let data: ClientPublication;
      try { data = (await request<{ publication: ClientPublication }>(`/v1/${provider}/publication`, { url })).publication; }
      catch (backendError) {
        if (provider !== 'github') throw backendError;
        say('Quota serveur partagé indisponible : collecte directe via l’API officielle…');
        data = await directPreview(url); clientSourced = true; clientPublication = data;
      }
      if (current !== revision || url !== input.value.trim()) return;
      if (provider === 'trovo') { await startTrovo(data); clientSourced = true; clientPublication = data; }
      if (provider === 'discord') {
        const select=root.querySelector<HTMLSelectElement>('[data-discord-reaction]')!; select.replaceChildren();
        for (const reaction of data.reactions || []) { const option=document.createElement('option'); option.value=reaction.id; option.textContent=`${reaction.label} · ${reaction.count} réaction${reaction.count > 1 ? 's' : ''}`; select.append(option); }
        select.disabled=!select.options.length;
      }
      root.querySelector<HTMLElement>('[data-publication-title]')!.textContent = data.title || 'Publication';
      const date = data.publishedAt && !Number.isNaN(Date.parse(data.publishedAt)) ? new Intl.DateTimeFormat('fr-FR').format(new Date(data.publishedAt)) : '';
      root.querySelector<HTMLElement>('[data-publication-meta]')!.textContent = [provider === 'stackexchange' ? parseStackExchangeUrl(url)?.name : '', data.authorName, date].filter(Boolean).join(' · ');
      const image = root.querySelector<HTMLImageElement>('[data-thumbnail]');
      if (image) {
        image.hidden = !data.thumbnailUrl;
        image.onerror = () => { image.hidden = true; };
        if (data.thumbnailUrl) { image.src = data.thumbnailUrl; image.alt = `Miniature : ${data.title || 'vidéo'}`; }
        else image.removeAttribute('src');
      }
      analyzedUrl = url; publication.hidden = false; preview.dataset.state = 'ready'; importButton.disabled = false;
      say(provider === 'kick' || provider === 'trovo' ? 'Collecte démarrée. Gardez cette page ouverte, puis arrêtez-la pour préparer le tirage.' : 'Aperçu prêt. Choisissez vos règles puis lancez l’import.');
    } catch (error) {
      if (current !== revision) return;
      if (provider === 'trovo') stopTrovo();
      preview.dataset.state = 'error'; say(errorText(error));
    }
  };
  const readRules = () => {
    const data = new FormData(form);
    const mixcloudInteraction = provider === 'mixcloud' ? String(data.get('interaction') || '') : '';
    const commentProvider = provider === 'youtube' || provider === 'youtube_live' || provider === 'vimeo' || provider === 'soundcloud' || provider === 'mixcloud' && mixcloudInteraction === 'comments' || provider === 'peertube' || provider === 'kick' || provider === 'trovo' || provider === 'lemmy' || provider === 'reddit' || provider === 'github' || provider === 'gitlab' || provider === 'bitbucket' || provider === 'devto' || provider === 'hackernews' || provider === 'stackexchange' || provider === 'wordpress';
    const replyProvider = provider === 'youtube' || provider === 'vimeo' || provider === 'peertube' || provider === 'lemmy' || provider === 'reddit' || provider === 'bitbucket' || provider === 'devto' || provider === 'hackernews' || provider === 'wordpress';
    const duplicateEntries = commentProvider && data.get('duplicateEntries') === 'on';
    return { winnerCount: Number(data.get('winnerCount')), alternateCount: Number(data.get('alternateCount')),
      uniqueParticipants: !duplicateEntries, duplicateEntries,
      includeReplies: replyProvider && data.get('includeReplies') === 'on',
      excludePublicationAuthor: data.get('excludePublicationAuthor') === 'on',
      requiredKeyword: commentProvider ? String(data.get('requiredKeyword') || '').trim() : undefined,
      excludedUsers: String(data.get('excludedUsers') || '').split(/[\n,]/u).map(v => v.trim().replace(/^@/u, '')).filter(Boolean),
      providerInteractionId: provider === 'discord' ? String(data.get('providerInteractionId') || '') : undefined,
      ...(provider === 'youtube_live' || provider === 'kick' || provider === 'trovo' ? { interaction: 'livechat' as const } : provider === 'mixcloud' || !commentProvider || provider === 'stackexchange' ? { interaction: String(data.get('interaction')) } : {}),
    };
  };
  const poll = async (id: string, current: number) => {
    try {
      const { import: state } = await request<{ import: ImportState }>(`/v1/imports/${id}`);
      if (current !== revision || id !== importId) return;
      progress.textContent = `${state.progress_current} ${provider === 'twitch' ? 'comptes présents analysés' : provider === 'youtube_live' || provider === 'kick' || provider === 'trovo' ? 'messages du chat analysés' : provider === 'discord' ? 'réactions Discord analysées' : provider === 'youtube' || provider === 'vimeo' || provider === 'peertube' || provider === 'lemmy' || provider === 'reddit' || provider === 'bitbucket' || provider === 'devto' || provider === 'hackernews' || provider === 'wordpress' ? 'commentaires et réponses analysés' : provider === 'soundcloud' || provider === 'github' || provider === 'gitlab' ? 'commentaires analysés' : provider === 'mixcloud' ? 'interactions Mixcloud analysées' : provider === 'stackexchange' ? 'contributions analysées' : 'interactions analysées'} · ${state.participant_count} comptes éligibles`;
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
    if (provider === 'trovo') stopTrovo();
    revision++; analyzedUrl = ''; clientSourced = false; clientPublication = undefined; publication.hidden = true; preview.dataset.state = 'idle'; importButton.disabled = true; resetDraw();
    window.clearTimeout(previewTimer);
    if (provider !== 'trovo' && eligibleUrl(input.value.trim())) previewTimer = window.setTimeout(() => { void analyze(); }, 700);
  });
  form.addEventListener('change', event => { if (event.target !== input && !busy) { if (importId) revision++; resetDraw(); say('Règles modifiées : importez à nouveau pour les appliquer.'); } });
  importButton.addEventListener('click', async () => {
    if (busy || !ready || analyzedUrl !== input.value.trim() || !form.reportValidity()) return;
    const rules = readRules(); // Read before disabling form controls.
    if ((provider === 'youtube' || provider === 'youtube_live') && rules.excludedUsers.some(id => !/^UC[\w-]{22}$/u.test(id))) { say('Pour les exclusions YouTube, indiquez des identifiants de chaîne UC… (24 caractères), pas des pseudos ni des URL.'); return; }
    if (provider === 'stackexchange' && rules.excludedUsers.some(id => !/^[1-9]\d{0,11}$/u.test(id))) { say('Pour les exclusions Stack Exchange, indiquez uniquement les identifiants utilisateur numériques.'); return; }
    resetDraw(); const current = ++revision; lock(true); say('Import en cours. Les grands volumes peuvent prendre plusieurs minutes.');
    try {
      const comments = clientSourced ? await directComments(analyzedUrl) : undefined;
      const payload = await request<{ import: { id: string }; rulesSummary: string[]; requestedCount: number }>(clientSourced ? `/v1/${provider}/client-imports` : `/v1/${provider}/imports`,
        clientSourced ? { url: analyzedUrl, rules, publication: clientPublication, comments } : { url: analyzedUrl, rules });
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
    say(ready ? provider === 'kick' ? 'Prêt. Connectez votre chaîne puis démarrez la collecte au début du concours.' : provider === 'trovo' ? 'Prêt. Indiquez une chaîne Trovo puis démarrez la collecte.' : 'Prêt. Collez le lien de votre publication.' : 'Ce connecteur est temporairement indisponible.');
    if (ready && provider !== 'kick' && provider !== 'trovo' && eligibleUrl(input.value.trim())) void analyze();
  }).catch(error => say(errorText(error)));
}

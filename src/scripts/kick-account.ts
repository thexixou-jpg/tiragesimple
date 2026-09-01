for (const root of document.querySelectorAll<HTMLElement>('[data-kick-account]')) {
  const api = (root.dataset.apiUrl || '/_tiragesimple').replace(/\/$/u, '');
  const connect = root.querySelector<HTMLAnchorElement>('[data-kick-connect]')!;
  const connected = root.querySelector<HTMLElement>('[data-kick-connected]')!;
  const identity = root.querySelector<HTMLElement>('[data-kick-identity]')!;
  const disconnect = root.querySelector<HTMLButtonElement>('[data-kick-disconnect]')!;
  const notice = root.querySelector<HTMLElement>('[data-kick-notice]')!;
  const channelInput = document.querySelector<HTMLInputElement>('[data-social-contest][data-provider="kick"] [data-video-url]');
  connect.href = `${api}/v1/kick/oauth/start`;

  const load = async () => {
    try {
      const response = await fetch(`${api}/v1/kick/account`, { credentials: 'include', signal: AbortSignal.timeout(15000) });
      const payload = await response.json() as { connected?: boolean; setupRequired?: boolean; account?: { username?: string; displayName?: string }; error?: string };
      if (payload.setupRequired) { connect.hidden = true; connected.hidden = true; notice.textContent = 'Le connecteur est développé. Une application Kick doit encore être enregistrée et ses secrets ajoutés au Worker.'; return; }
      if (payload.connected && payload.account) {
        connect.hidden = true; connected.hidden = false; const username = payload.account.username || '';
        identity.textContent = payload.account.displayName ? `${payload.account.displayName}${username ? ` (${username})` : ''}` : username || 'Chaîne Kick';
        notice.textContent = 'Autorisation minimale accordée : lecture des informations de votre chaîne et réception des événements du chat.';
        if (channelInput && username) { channelInput.value = `https://kick.com/${username}`; channelInput.readOnly = true; }
        return;
      }
      connect.hidden = false; connected.hidden = true; notice.textContent = 'Connectez la chaîne qui organise le concours. TirageSimple ne reçoit jamais votre mot de passe Kick.';
      if (channelInput) { channelInput.value = ''; channelInput.readOnly = true; }
    } catch { connect.hidden = true; connected.hidden = true; notice.textContent = 'État de la connexion Kick indisponible. Réessayez plus tard.'; }
  };
  disconnect.addEventListener('click', async () => { disconnect.disabled = true; try { await fetch(`${api}/v1/kick/disconnect`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' }); } finally { disconnect.disabled = false; await load(); } });
  const status = new URL(location.href).searchParams.get('kick');
  if (status === 'connected') notice.textContent = 'Connexion Kick confirmée.';
  else if (status === 'error') notice.textContent = 'Connexion Kick annulée ou expirée. Recommencez.';
  if (status) history.replaceState(null, '', location.pathname + location.hash);
  void load();
}

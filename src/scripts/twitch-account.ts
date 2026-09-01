for (const root of document.querySelectorAll<HTMLElement>('[data-twitch-account]')) {
  const api = (root.dataset.apiUrl || '/_tiragesimple').replace(/\/$/u, '');
  const connect = root.querySelector<HTMLAnchorElement>('[data-twitch-connect]')!;
  const connected = root.querySelector<HTMLElement>('[data-twitch-connected]')!;
  const identity = root.querySelector<HTMLElement>('[data-twitch-identity]')!;
  const disconnect = root.querySelector<HTMLButtonElement>('[data-twitch-disconnect]')!;
  const notice = root.querySelector<HTMLElement>('[data-twitch-notice]')!;
  connect.href = `${api}/v1/twitch/oauth/start`;

  const load = async () => {
    try {
      const response = await fetch(`${api}/v1/twitch/account`, { credentials: 'include', signal: AbortSignal.timeout(15000) });
      const payload = await response.json() as { connected?: boolean; setupRequired?: boolean; account?: { username?: string; displayName?: string }; error?: string };
      if (payload.setupRequired) { connect.hidden = true; connected.hidden = true; notice.textContent = 'Le code OAuth est prêt. L’application Twitch doit encore être enregistrée et ses secrets ajoutés au Worker.'; return; }
      if (payload.connected && payload.account) { connect.hidden = true; connected.hidden = false; identity.textContent = payload.account.displayName ? `${payload.account.displayName}${payload.account.username ? ` (@${payload.account.username})` : ''}` : payload.account.username || 'Compte Twitch'; notice.textContent = 'Permission accordée : lecture de la liste des personnes présentes dans les chats que vous diffusez ou modérez.'; return; }
      connect.hidden = false; connected.hidden = true; notice.textContent = 'Connectez le diffuseur ou un modérateur. TirageSimple ne reçoit jamais votre mot de passe Twitch.';
    } catch { connect.hidden = true; connected.hidden = true; notice.textContent = 'État de la connexion Twitch indisponible. Réessayez plus tard.'; }
  };
  disconnect.addEventListener('click', async () => { disconnect.disabled = true; try { await fetch(`${api}/v1/twitch/disconnect`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' }); } finally { disconnect.disabled = false; await load(); } });
  const status = new URL(location.href).searchParams.get('twitch');
  if (status === 'connected') notice.textContent = 'Connexion Twitch confirmée.';
  else if (status === 'error') notice.textContent = 'Connexion Twitch annulée ou expirée. Recommencez.';
  if (status) history.replaceState(null, '', location.pathname + location.hash);
  void load();
}

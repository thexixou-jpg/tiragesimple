for (const root of document.querySelectorAll<HTMLElement>('[data-pixelfed-account]')) {
  const api=(root.dataset.apiUrl||'/_tiragesimple').replace(/\/$/u,'');
  const input=document.querySelector<HTMLInputElement>('[data-social-contest][data-provider="pixelfed"] [data-video-url]');
  const connect=root.querySelector<HTMLAnchorElement>('[data-pixelfed-connect]')!;
  const connected=root.querySelector<HTMLElement>('[data-pixelfed-connected]')!;
  const identity=root.querySelector<HTMLElement>('[data-pixelfed-identity]')!;
  const disconnect=root.querySelector<HTMLButtonElement>('[data-pixelfed-disconnect]')!;
  const notice=root.querySelector<HTMLElement>('[data-pixelfed-notice]')!;
  let accountHost='';
  const inputHost=()=>{try{return new URL(input?.value.trim()||'').hostname.toLowerCase();}catch{return'';}};
  const refreshLink=()=>{const host=inputHost();connect.href=host?`${api}/v1/pixelfed/oauth/start?instance=${encodeURIComponent(host)}`:'#';connect.setAttribute('aria-disabled',host?'false':'true');if(!accountHost&&!host)notice.textContent='Collez d’abord le lien de votre publication pour choisir automatiquement la bonne instance.';else if(accountHost&&host&&accountHost!==host)notice.textContent=`Le compte connecté appartient à ${accountHost}. Connectez ${host} pour cette publication.`;};
  const load=async()=>{try{const response=await fetch(`${api}/v1/pixelfed/account`,{credentials:'include',signal:AbortSignal.timeout(15000)});const payload=await response.json() as {connected?:boolean;setupRequired?:boolean;account?:{host?:string;username?:string;displayName?:string};error?:string};if(payload.setupRequired){connect.hidden=true;connected.hidden=true;notice.textContent='Le connecteur Pixelfed doit encore être configuré.';return;}if(payload.connected&&payload.account){accountHost=payload.account.host||'';connect.hidden=true;connected.hidden=false;identity.textContent=`${payload.account.displayName||payload.account.username||'Compte Pixelfed'} · ${accountHost}`;notice.textContent='Permission accordée : lecture seule des publications et interactions accessibles à ce compte.';}else{accountHost='';connect.hidden=false;connected.hidden=true;notice.textContent='Collez le lien de la publication puis connectez la même instance Pixelfed.';}refreshLink();}catch{connect.hidden=true;connected.hidden=true;notice.textContent='État de la connexion Pixelfed indisponible. Réessayez plus tard.';}};
  input?.addEventListener('input',refreshLink);
  connect.addEventListener('click',event=>{if(!inputHost())event.preventDefault();});
  disconnect.addEventListener('click',async()=>{disconnect.disabled=true;try{await fetch(`${api}/v1/pixelfed/disconnect`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'});}finally{disconnect.disabled=false;await load();}});
  const status=new URL(location.href).searchParams.get('pixelfed');if(status==='connected')notice.textContent='Connexion Pixelfed confirmée.';else if(status==='error')notice.textContent='Connexion Pixelfed annulée ou expirée. Recommencez.';if(status)history.replaceState(null,'',location.pathname+location.hash);
  void load();
}

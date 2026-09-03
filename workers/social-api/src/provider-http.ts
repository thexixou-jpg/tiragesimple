/** Only used with fixed, official API origins; user URLs are never fetched. */
export class ProviderRequestError extends Error {
  constructor(message: string, public retryable: boolean, public retryAfterSeconds = 0) { super(message); }
}

export async function providerJson<T>(url: URL): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' }); }
  catch { throw new ProviderRequestError('La plateforme ne répond pas. Une nouvelle tentative sera effectuée.', true); }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) throw new ProviderRequestError('La plateforme est temporairement limitée ou indisponible.', true);
    throw new ProviderRequestError(`Accès refusé ou contenu indisponible (${response.status}). Vérifiez que le contenu et ses interactions sont publics.`, false);
  }
  return response.json() as Promise<T>;
}

/** Explicit official API sites; shared by the browser and Worker. */
export const stackExchangeSites = [
  { site: 'stackoverflow', host: 'stackoverflow.com', name: 'Stack Overflow', topic: 'Programmation' },
  { site: 'superuser', host: 'superuser.com', name: 'Super User', topic: 'Informatique et matériel' },
  { site: 'serverfault', host: 'serverfault.com', name: 'Server Fault', topic: 'Administration système' },
  { site: 'askubuntu', host: 'askubuntu.com', name: 'Ask Ubuntu', topic: 'Ubuntu et Linux' },
  { site: 'gaming', host: 'gaming.stackexchange.com', name: 'Arqade', topic: 'Jeux vidéo' },
] as const;

export function parseStackExchangeUrl(input: string) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    const community = stackExchangeSites.find(item => item.host === host);
    const match = url.pathname.match(/^\/questions\/([1-9]\d{0,11})(?:\/[^/]*)?\/?$/u);
    if (!community || !match) return null;
    const id = match[1];
    return { ...community, id, canonicalUrl: `https://${community.host}/questions/${id}`,
      // Preserve numeric references in existing Stack Overflow imports and receipts.
      publicationId: community.site === 'stackoverflow' ? id : `${community.site}|${id}` };
  } catch { return null; }
}

export function parseStackExchangeReference(reference: string) {
  const parts = reference.split('|');
  const site = parts.length === 1 ? 'stackoverflow' : parts[0];
  const id = parts.length === 1 ? parts[0] : parts[1];
  const community = stackExchangeSites.find(item => item.site === site);
  if (parts.length > 2 || !community || !/^[1-9]\d{0,11}$/u.test(id)) return null;
  return { ...community, id };
}

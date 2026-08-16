const DEFAULT_MAX_LENGTH = 6_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeConfig(value: unknown, maxLength = DEFAULT_MAX_LENGTH): string {
  const json = JSON.stringify(value);
  const encoded = bytesToBase64(new TextEncoder().encode(json))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
  if (encoded.length > maxLength) throw new RangeError('Cette configuration est trop grande pour être partagée par URL.');
  return encoded;
}

export function decodeConfig<T>(encoded: string): T | null {
  try {
    const padding = '='.repeat((4 - (encoded.length % 4)) % 4);
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/') + padding;
    return JSON.parse(new TextDecoder().decode(base64ToBytes(base64))) as T;
  } catch {
    return null;
  }
}

export function buildShareUrl(config: unknown, url = new URL(window.location.href)): URL {
  url.searchParams.set('config', encodeConfig(config));
  url.hash = '';
  return url;
}

export function readSharedConfig<T>(url = new URL(window.location.href)): T | null {
  const encoded = url.searchParams.get('config');
  return encoded ? decodeConfig<T>(encoded) : null;
}

export async function shareUrl(url: URL, title = document.title): Promise<'shared' | 'copied'> {
  if (navigator.share) {
    await navigator.share({ title, url: url.toString() });
    return 'shared';
  }
  await navigator.clipboard.writeText(url.toString());
  return 'copied';
}

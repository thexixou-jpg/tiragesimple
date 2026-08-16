export const STORAGE_KEYS = {
  wheel: 'tiragesimple:v1:wheel',
  settings: 'tiragesimple:v1:settings',
  history: 'tiragesimple:v1:history',
} as const;

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const raw = getStorage()?.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveLocal<T>(key: string, value: T): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

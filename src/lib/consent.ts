import { loadLocal, saveLocal } from './storage';

export interface ConsentPreferences {
  version: 1;
  analytics: boolean;
  advertising: boolean;
  updatedAt: number;
}

const CONSENT_KEY = 'tiragesimple:v1:consent';

export function readConsent(): ConsentPreferences | null {
  return loadLocal<ConsentPreferences | null>(CONSENT_KEY, null);
}

export function saveConsent(preferences: Pick<ConsentPreferences, 'analytics' | 'advertising'>): boolean {
  return saveLocal(CONSENT_KEY, { version: 1, ...preferences, updatedAt: Date.now() } satisfies ConsentPreferences);
}

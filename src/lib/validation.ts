export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: string;
}

export function validateInteger(value: string, label: string, bounds: { min?: number; max?: number } = {}): ValidationResult<number> {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return { valid: false, error: `${label} doit être un nombre entier.` };
  if (bounds.min != null && parsed < bounds.min) return { valid: false, error: `${label} doit être supérieur ou égal à ${bounds.min}.` };
  if (bounds.max != null && parsed > bounds.max) return { valid: false, error: `${label} doit être inférieur ou égal à ${bounds.max}.` };
  return { valid: true, value: parsed };
}

export function setFieldError(container: HTMLElement, message = ''): void {
  const error = container.querySelector<HTMLElement>('[data-error]');
  if (!error) return;
  error.textContent = message;
  error.hidden = message.length === 0;
}

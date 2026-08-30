export type AnalyticsEvent = 'tool_used' | 'wheel_spun' | 'wheel_preset_selected' | 'result_copied' | 'share_clicked' | 'related_tool_clicked';

export function trackEvent(name: AnalyticsEvent, metadata: Record<string, string | number | boolean> = {}): void {
  window.dispatchEvent(new CustomEvent('tiragesimple:analytics', { detail: { name, metadata } }));
}

/** Global event name used to request opening the settings dialog. */
export const OPEN_SETTINGS_DIALOG_EVENT = 'treck:open-settings-dialog';

/** Dispatch a global event that asks the settings dialog to open. */
export function requestOpenSettingsDialog(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_SETTINGS_DIALOG_EVENT));
}

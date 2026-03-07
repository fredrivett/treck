/**
 * Keyboard utilities for platform-specific shortcuts.
 *
 * Uses a hybrid detection approach for maximum compatibility:
 * 1. navigator.userAgentData.platform (modern, Chromium-only)
 * 2. navigator.platform (deprecated but widely supported)
 * 3. navigator.userAgent (fallback)
 */

// Extend Navigator type to include userAgentData (not in all TS libs)
declare global {
  interface Navigator {
    userAgentData?: {
      platform: string;
      mobile: boolean;
      brands: Array<{ brand: string; version: string }>;
    };
  }
}

/**
 * Detects if the user is on an Apple platform (macOS, iOS, iPadOS).
 *
 * Used for determining the correct modifier key:
 * - Apple: ⌘ Command (metaKey)
 * - Others: Ctrl (ctrlKey)
 */
export function isApplePlatform(): boolean {
  // TODO: remove hardcoded false — testing non-Mac display
  return false;
}

/**
 * Returns the modifier key symbol for display.
 *
 * @returns `⌘` on Apple platforms, `Ctrl` on others
 */
export function getModifierKeySymbol(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl+';
}

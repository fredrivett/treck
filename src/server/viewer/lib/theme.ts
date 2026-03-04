/** Theme preference: explicit light/dark or auto (follows system). */
export type ThemePreference = 'light' | 'dark' | 'auto';

const THEME_SEQUENCE: ThemePreference[] = ['auto', 'light', 'dark'];

/**
 * Returns the next theme preference in the cycle: auto -> light -> dark -> auto.
 *
 * @param current - The current theme preference
 */
export function getNextTheme(current: ThemePreference): ThemePreference {
  const index = THEME_SEQUENCE.indexOf(current);
  if (index === -1) return 'auto';
  return THEME_SEQUENCE[(index + 1) % THEME_SEQUENCE.length];
}

const HTML_THEME_DATA_ATTR = 'data-theme';
const HTML_THEME_PREFERENCE_ATTR = 'data-theme-preference';
const HTML_COLOR_SCHEME_PROP = 'color-scheme';
const HTML_DARK_MODE_CLASS = 'dark';
const THEME_LOCAL_STORAGE_KEY = 'treck:theme-preference';

function isDomAvailable(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/** Resolve the effective mode from a preference, checking system setting for "auto". */
function resolveMode(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';

  const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  return mediaQuery?.matches ? 'dark' : 'light';
}

/**
 * Apply a theme preference to the document root element.
 *
 * Sets `data-theme`, `data-theme-preference`, the `color-scheme` CSS property,
 * and toggles the `dark` class. When preference is `"auto"`, resolves the
 * effective mode from the system `prefers-color-scheme` media query.
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (!isDomAvailable()) return;

  const root = document.documentElement;
  root.setAttribute(HTML_THEME_PREFERENCE_ATTR, preference);

  const mode = resolveMode(preference);
  if (mode === 'dark') {
    root.classList.add(HTML_DARK_MODE_CLASS);
  } else {
    root.classList.remove(HTML_DARK_MODE_CLASS);
  }

  root.setAttribute(HTML_THEME_DATA_ATTR, mode);
  root.style.setProperty(HTML_COLOR_SCHEME_PROP, mode);
}

/**
 * Read the currently active theme from the document root.
 *
 * Defaults to `"light"` on the server or when the attribute is absent.
 */
export function getActiveTheme(): 'light' | 'dark' {
  if (!isDomAvailable()) return 'light';
  return document.documentElement.getAttribute(HTML_THEME_DATA_ATTR) === 'dark' ? 'dark' : 'light';
}

/**
 * Read the current theme preference from the DOM attribute.
 *
 * Returns `"auto"` on the server or when no preference is found.
 */
export function getCurrentPreference(): ThemePreference {
  if (!isDomAvailable()) return 'auto';

  const attr = document.documentElement.getAttribute(HTML_THEME_PREFERENCE_ATTR);
  if (attr === 'light' || attr === 'dark' || attr === 'auto') {
    return attr;
  }

  return 'auto';
}

function parseStoredPreference(value: string | null | undefined): ThemePreference | null {
  if (!value) return null;
  const lower = value.toLowerCase();
  if (lower === 'light' || lower === 'dark' || lower === 'auto') {
    return lower as ThemePreference;
  }
  return null;
}

/**
 * Read the persisted theme preference from localStorage.
 *
 * Returns `null` on the server or when no valid preference is stored.
 */
export function getStoredThemePreference(): ThemePreference | null {
  if (!isDomAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(THEME_LOCAL_STORAGE_KEY);
    return parseStoredPreference(raw);
  } catch {
    return null;
  }
}

/**
 * Persist the theme preference to localStorage.
 */
export function storeThemePreference(preference: ThemePreference): void {
  if (!isDomAvailable()) return;
  try {
    window.localStorage.setItem(THEME_LOCAL_STORAGE_KEY, preference);
  } catch {
    // Swallow storage exceptions (e.g. private mode)
  }
}

/** Return type for the useThemePreference hook. */
export type UseThemePreferenceReturn = {
  mounted: boolean;
  preference: ThemePreference;
  toggle: () => void;
};

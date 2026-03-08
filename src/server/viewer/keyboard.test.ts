import { afterEach, describe, expect, it, vi } from 'vitest';

import { getModifierKeySymbol, isApplePlatform } from './keyboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isApplePlatform', () => {
  it('returns false when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isApplePlatform()).toBe(false);
  });

  it('uses navigator.userAgentData.platform when available', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { platform: 'macOS', mobile: false, brands: [] },
      platform: 'Win32',
      userAgent: 'Windows NT',
    });

    expect(isApplePlatform()).toBe(true);
  });

  it('prefers userAgentData over legacy platform when both exist', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { platform: 'Windows', mobile: false, brands: [] },
      platform: 'MacIntel',
      userAgent: 'Macintosh',
    });

    expect(isApplePlatform()).toBe(false);
  });

  it('falls back to navigator.platform', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0',
    });

    expect(isApplePlatform()).toBe(true);
  });

  it('falls back to navigator.userAgent when userAgentData and platform are missing', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    });

    expect(isApplePlatform()).toBe(true);
  });

  it('returns false for non-apple values', () => {
    vi.stubGlobal('navigator', {
      userAgentData: { platform: 'Linux', mobile: false, brands: [] },
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    });

    expect(isApplePlatform()).toBe(false);
  });
});

describe('getModifierKeySymbol', () => {
  it('returns command symbol on apple platforms', () => {
    vi.stubGlobal('navigator', {
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0',
    });

    expect(getModifierKeySymbol()).toBe('⌘');
  });

  it('returns Ctrl+ on non-apple platforms', () => {
    vi.stubGlobal('navigator', {
      platform: 'Win32',
      userAgent: 'Mozilla/5.0',
    });

    expect(getModifierKeySymbol()).toBe('Ctrl+');
  });
});

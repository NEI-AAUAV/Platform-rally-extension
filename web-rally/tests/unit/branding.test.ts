import { describe, test, expect } from 'vitest';
import {
  resolveBranding,
  hexToRgba,
  ensureContrastByLightening,
  FALLBACK_EVENT_NAME,
  FALLBACK_EVENT_SUBTITLE,
  FALLBACK_BANNER_SRC,
  FALLBACK_FAVICON_HREF,
  FALLBACK_THEME_COLOR,
} from '@/lib/branding';
import type { RallySettingsResponse } from '@/client';

const make = (over: Partial<RallySettingsResponse>): RallySettingsResponse =>
  ({
    event_name: '',
    event_subtitle: '',
    accent_color: '',
    banner_url: '',
    logo_url: '',
    favicon_url: '',
    ...over,
  }) as RallySettingsResponse;

describe('resolveBranding', () => {
  test('returns bundled fallbacks when settings is null', () => {
    const b = resolveBranding(null);

    expect(b.eventName).toBe(FALLBACK_EVENT_NAME);
    expect(b.eventSubtitle).toBe(FALLBACK_EVENT_SUBTITLE);
    expect(b.bannerSrc).toBe(FALLBACK_BANNER_SRC);
    expect(b.faviconHref).toBe(FALLBACK_FAVICON_HREF);
    expect(b.themeColor).toBe(FALLBACK_THEME_COLOR);
    expect(b.accentColor).toBe('');
    expect(b.logoSrc).toBe('');
    expect(b.customFaviconUrl).toBe('');
  });

  test('treats empty/whitespace fields as unset and falls back', () => {
    const b = resolveBranding(make({ event_name: '   ', banner_url: '' }));

    expect(b.eventName).toBe(FALLBACK_EVENT_NAME);
    expect(b.bannerSrc).toBe(FALLBACK_BANNER_SRC);
  });

  test('uses configured values and trims them', () => {
    const b = resolveBranding(
      make({
        event_name: '  Carnaval 2026 ',
        event_subtitle: 'Tascas',
        accent_color: '#c81d25',
        banner_url: 'https://r2.example/banner.jpg',
        logo_url: 'https://r2.example/logo.png',
        favicon_url: 'https://r2.example/fav.svg',
      }),
    );

    expect(b.eventName).toBe('Carnaval 2026');
    expect(b.eventSubtitle).toBe('Tascas');
    expect(b.accentColor).toBe('#c81d25');
    expect(b.bannerSrc).toBe('https://r2.example/banner.jpg');
    expect(b.logoSrc).toBe('https://r2.example/logo.png');
    expect(b.faviconHref).toBe('https://r2.example/fav.svg');
    expect(b.customFaviconUrl).toBe('https://r2.example/fav.svg');
  });

  test('accent color drives theme color when set', () => {
    const b = resolveBranding(make({ accent_color: '#00ff00' }));
    expect(b.themeColor).toBe('#00ff00');
  });
});

describe('hexToRgba', () => {
  test('expands 3-digit hex', () => {
    expect(hexToRgba('#0f8', 0.5)).toBe('rgba(0, 255, 136, 0.5)');
  });

  test('parses 6-digit hex', () => {
    expect(hexToRgba('#dc2626', 0.12)).toBe('rgba(220, 38, 38, 0.12)');
  });

  test('accepts hex without leading hash and trims', () => {
    expect(hexToRgba('  ffffff ', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  test('is case-insensitive', () => {
    expect(hexToRgba('#ABCDEF', 0.3)).toBe('rgba(171, 205, 239, 0.3)');
  });

  test('returns null for non-hex input', () => {
    expect(hexToRgba('red', 0.5)).toBeNull();
    expect(hexToRgba('#12', 0.5)).toBeNull();
    expect(hexToRgba('rgb(0,0,0)', 0.5)).toBeNull();
    expect(hexToRgba('', 0.5)).toBeNull();
  });
});

describe('ensureContrastByLightening', () => {
  test('returns the original hex unchanged when it is not parseable', () => {
    expect(ensureContrastByLightening('not-a-hex', '#000000')).toBe('not-a-hex');
  });

  test('returns the original hex when it already meets the contrast target', () => {
    expect(ensureContrastByLightening('#ffffff', '#000000')).toBe('#ffffff');
  });

  test('lightens a low-contrast color until it meets the default 4.5:1 target', () => {
    // NEI green-ish dark color on a dark background needs lightening.
    const result = ensureContrastByLightening('#1a3d1a', '#0b0b0b');
    expect(result).not.toBe('#1a3d1a');
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('respects a custom minContrast threshold', () => {
    const result = ensureContrastByLightening('#333333', '#000000', 2);
    expect(result).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

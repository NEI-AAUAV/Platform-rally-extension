import { describe, test, expect } from 'vitest';
import {
  resolveBranding,
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

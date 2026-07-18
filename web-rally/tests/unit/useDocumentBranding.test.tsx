import { renderHook } from '@testing-library/react';
import { describe, test, expect, beforeEach } from 'vitest';
import useDocumentBranding from '@/hooks/useDocumentBranding';
import type { Branding } from '@/lib/branding';

const base: Branding = {
  eventName: 'Carnaval 2026',
  eventSubtitle: 'Tascas',
  accentColor: '',
  bannerSrc: '/banner.jpg',
  logoSrc: '',
  faviconHref: '/rally/favicon.ico',
  customFaviconUrl: '',
  themeColor: '#dc2626',
};

const make = (over: Partial<Branding>): Branding => ({ ...base, ...over });

describe('useDocumentBranding', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <link rel="icon" href="/default.ico" />
      <link rel="apple-touch-icon" href="/default-apple.png" />
      <meta name="theme-color" content="#000000" />
      <meta property="og:image" content="/default-og.png" />
    `;
    document.documentElement.removeAttribute('style');
  });

  test('sets document.title to the event name', () => {
    renderHook(() => useDocumentBranding(make({ eventName: 'My Event' })));
    expect(document.title).toBe('My Event');
  });

  test('always points the favicon link at the resolved href', () => {
    renderHook(() => useDocumentBranding(make({ faviconHref: '/rally/favicon.ico' })));
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link?.getAttribute('href')).toBe('/rally/favicon.ico');
  });

  test('updates theme-color meta', () => {
    renderHook(() => useDocumentBranding(make({ themeColor: '#00ff00' })));
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe('#00ff00');
  });

  test('does NOT override apple-touch icon or og:image when no custom favicon', () => {
    renderHook(() => useDocumentBranding(make({ customFaviconUrl: '' })));
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    expect(apple?.getAttribute('href')).toBe('/default-apple.png');
    expect(og?.content).toBe('/default-og.png');
  });

  test('overrides apple-touch icon and og:image when a custom favicon is set', () => {
    renderHook(() =>
      useDocumentBranding(make({ customFaviconUrl: 'https://r2/fav.png', faviconHref: 'https://r2/fav.png' })),
    );
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    expect(apple?.getAttribute('href')).toBe('https://r2/fav.png');
    expect(og?.content).toBe('https://r2/fav.png');
  });

  test('sets accent CSS vars (incl. derived soft/glow) when accent is a hex', () => {
    renderHook(() => useDocumentBranding(make({ accentColor: '#dc2626' })));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--rally-accent')).toBe('#dc2626');
    expect(style.getPropertyValue('--rally-accent-soft')).toBe('rgba(220, 38, 38, 0.15)');
    expect(style.getPropertyValue('--rally-glow')).toBe('rgba(220, 38, 38, 0.12)');
  });

  test('removes accent CSS vars when accent is unset', () => {
    document.documentElement.style.setProperty('--rally-accent', '#123456');
    renderHook(() => useDocumentBranding(make({ accentColor: '' })));
    expect(document.documentElement.style.getPropertyValue('--rally-accent')).toBe('');
  });

  test('does not throw when theme-color meta tag is absent', () => {
    document.head.innerHTML = '';
    expect(() =>
      renderHook(() => useDocumentBranding(make({ themeColor: '#00ff00' }))),
    ).not.toThrow();
  });

  test('does not throw when og:image meta tag is absent but custom favicon is set', () => {
    document.head.innerHTML = `<link rel="apple-touch-icon" href="/default-apple.png" />`;
    expect(() =>
      renderHook(() =>
        useDocumentBranding(make({ customFaviconUrl: 'https://r2/fav.png' })),
      ),
    ).not.toThrow();
    const apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    expect(apple?.getAttribute('href')).toBe('https://r2/fav.png');
  });

  test('skips setting soft/glow vars when accent is a non-hex value', () => {
    renderHook(() => useDocumentBranding(make({ accentColor: 'not-a-hex' })));
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--rally-accent')).toBe('not-a-hex');
    expect(style.getPropertyValue('--rally-accent-soft')).toBe('');
    expect(style.getPropertyValue('--rally-glow')).toBe('');
  });
});

import { describe, test, expect } from 'vitest';
import { isSafeImageUrl, toSafeImageUrl } from '@/lib/url';

describe('url utils', () => {
  describe('isSafeImageUrl', () => {
    test('returns true for safe schemes', () => {
      expect(isSafeImageUrl('http://example.com/image.png')).toBe(true);
      expect(isSafeImageUrl('https://example.com/image.png')).toBe(true);
      expect(isSafeImageUrl('blob:https://example.com/uuid')).toBe(true);
      expect(isSafeImageUrl('data:image/png;base64,abc')).toBe(true);
      expect(isSafeImageUrl('/image.png')).toBe(true);
    });

    test('returns false for unsafe schemes', () => {
      expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeImageUrl('ftp://example.com/image.png')).toBe(false);
      expect(isSafeImageUrl('file:///etc/passwd')).toBe(false);
    });

    test('returns false for empty or falsy inputs', () => {
      expect(isSafeImageUrl('')).toBe(false);
      expect(isSafeImageUrl(null)).toBe(false);
      expect(isSafeImageUrl(undefined)).toBe(false);
    });

    test('returns false for invalid url formats', () => {
      // In JS, new URL('invalid-url', 'invalid-origin') might throw or be parsed differently.
      // But we can check if it returns false on parse error or if it falls back.
      // Let's pass a completely invalid structure.
      // Note that new URL('abc', window.location.origin) resolves to window.location.origin + '/abc', which is safe.
      // To force a throw, we need an invalid absolute URL where origin parameter is ignored but URL has invalid scheme/port/etc.
      expect(isSafeImageUrl('http://[::1')).toBe(false);
    });
  });

  describe('toSafeImageUrl', () => {
    test('returns parsed href for safe schemes', () => {
      expect(toSafeImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
      expect(toSafeImageUrl('/image.png')).toBe(`${window.location.origin}/image.png`);
    });

    test('returns null for unsafe schemes', () => {
      expect(toSafeImageUrl('javascript:alert(1)')).toBeNull();
      expect(toSafeImageUrl('ftp://example.com/image.png')).toBeNull();
    });

    test('returns null for empty or falsy inputs', () => {
      expect(toSafeImageUrl('')).toBeNull();
      expect(toSafeImageUrl(null)).toBeNull();
      expect(toSafeImageUrl(undefined)).toBeNull();
    });

    test('returns null for invalid url formats', () => {
      expect(toSafeImageUrl('http://[::1')).toBeNull();
    });
  });
});

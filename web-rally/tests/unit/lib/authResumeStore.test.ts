/**
 * Test suite for authResumeStore — localStorage-backed, TTL-bounded storage for
 * state that has to survive the OIDC round trip (and an iOS PWA kill).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearResumeValue, getResumeValue, setResumeValue } from '@/lib/authResumeStore';

const KEY = 'rally_test_resume_key';

describe('authResumeStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a stored value', () => {
    setResumeValue(KEY, '/postos/42');
    expect(getResumeValue(KEY)).toBe('/postos/42');
  });

  it('returns null for a key that was never set', () => {
    expect(getResumeValue(KEY)).toBeNull();
  });

  it('persists to localStorage, not sessionStorage, so it survives a PWA kill', () => {
    setResumeValue(KEY, '/admin');
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('returns null and deletes the entry once the TTL has elapsed', () => {
    vi.useFakeTimers();
    setResumeValue(KEY, '/admin', 1000);
    vi.advanceTimersByTime(1001);

    expect(getResumeValue(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('still returns the value just before the TTL elapses', () => {
    vi.useFakeTimers();
    setResumeValue(KEY, '/admin', 1000);
    vi.advanceTimersByTime(500);

    expect(getResumeValue(KEY)).toBe('/admin');
  });

  it('discards a malformed entry instead of throwing', () => {
    localStorage.setItem(KEY, 'not-json');
    expect(getResumeValue(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('discards a well-formed JSON entry that is not a StoredEntry', () => {
    localStorage.setItem(KEY, JSON.stringify({ value: 42 }));
    expect(getResumeValue(KEY)).toBeNull();
  });

  it('clears a stored value', () => {
    setResumeValue(KEY, '/admin');
    clearResumeValue(KEY);
    expect(getResumeValue(KEY)).toBeNull();
  });
});

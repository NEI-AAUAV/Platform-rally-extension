import { describe, it, expect } from 'vitest';
import { getEventTerms, capitalize } from '@/lib/eventTerms';

describe('getEventTerms', () => {
  it('returns rally_tascas terms by default', () => {
    expect(getEventTerms()).toEqual(getEventTerms('rally_tascas'));
  });

  it('returns peddy_paper terms', () => {
    expect(getEventTerms('peddy_paper').checkpoint).toBe('posto');
  });

  it('falls back to rally_tascas for an unknown event type', () => {
    expect(getEventTerms('not-a-real-type')).toEqual(getEventTerms('rally_tascas'));
  });

  it('falls back to rally_tascas for null', () => {
    expect(getEventTerms(null)).toEqual(getEventTerms('rally_tascas'));
  });
});

describe('capitalize', () => {
  it('capitalizes the first letter of a word', () => {
    expect(capitalize('tasca')).toBe('Tasca');
  });

  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });
});

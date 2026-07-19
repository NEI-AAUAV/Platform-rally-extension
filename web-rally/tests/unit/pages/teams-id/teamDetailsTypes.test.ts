import { describe, it, expect } from 'vitest';
import { nthNumber } from '@/pages/teams/[id]/teamDetails.types';

describe('nthNumber', () => {
  it('returns "st" for 1', () => {
    expect(nthNumber(1)).toBe('st');
  });

  it('returns "nd" for 2', () => {
    expect(nthNumber(2)).toBe('nd');
  });

  it('returns "rd" for 3', () => {
    expect(nthNumber(3)).toBe('rd');
  });

  it('returns "th" for 4', () => {
    expect(nthNumber(4)).toBe('th');
  });

  it('returns "th" for numbers between 4 and 20 (11-13 special case)', () => {
    expect(nthNumber(11)).toBe('th');
    expect(nthNumber(12)).toBe('th');
    expect(nthNumber(13)).toBe('th');
    expect(nthNumber(20)).toBe('th');
  });

  it('returns "st" for 21', () => {
    expect(nthNumber(21)).toBe('st');
  });

  it('returns "nd" for 22', () => {
    expect(nthNumber(22)).toBe('nd');
  });

  it('returns "rd" for 23', () => {
    expect(nthNumber(23)).toBe('rd');
  });

  it('returns "th" for 0', () => {
    expect(nthNumber(0)).toBe('th');
  });
});

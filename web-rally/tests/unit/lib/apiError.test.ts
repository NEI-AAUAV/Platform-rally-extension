import { describe, it, expect } from 'vitest';
import { apiErrorMessage } from '@/lib/apiError';
import { ApiError } from '@/services/apiClient';

describe('apiErrorMessage', () => {
  it('returns fallback for non-Error, non-ApiError values', () => {
    expect(apiErrorMessage('just a string', 'fallback')).toBe('fallback');
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(apiErrorMessage(42, 'fallback')).toBe('fallback');
  });

  it('uses default fallback message when none provided', () => {
    expect(apiErrorMessage(null)).toBe('Ocorreu um erro.');
  });

  it('returns message from a plain Error instance', () => {
    expect(apiErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('returns fallback when Error has empty message', () => {
    expect(apiErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  it('returns string detail from ApiError body', () => {
    const error = new ApiError(400, { detail: 'Invalid input' });
    expect(apiErrorMessage(error, 'fallback')).toBe('Invalid input');
  });

  it('returns first msg from 422 validation error array', () => {
    const error = new ApiError(422, {
      detail: [{ loc: ['body', 'name'], msg: 'Field required' }],
    });
    expect(apiErrorMessage(error, 'fallback')).toBe('Field required');
  });

  it('falls back to the Error message (JSON body) when 422 detail array is empty', () => {
    const error = new ApiError(422, { detail: [] });
    expect(apiErrorMessage(error, 'fallback')).toBe(JSON.stringify({ detail: [] }));
  });

  it('falls back to the Error message (JSON body) when 422 detail array items have no msg', () => {
    const error = new ApiError(422, { detail: [{ loc: ['body'] }] });
    // No string/array-with-msg detail and status isn't 409, so it falls through
    // to the underlying Error.message, which is the JSON-stringified body.
    expect(apiErrorMessage(error, 'fallback')).toBe(JSON.stringify({ detail: [{ loc: ['body'] }] }));
  });

  it('returns Portuguese conflict message for 409 status even without a usable detail', () => {
    const error = new ApiError(409, { detail: undefined });
    expect(apiErrorMessage(error, 'fallback')).toBe('Já existe.');
  });

  it('falls back to the Error message (JSON body) when detail is absent and status is not 409', () => {
    const error = new ApiError(500, { detail: undefined });
    expect(apiErrorMessage(error, 'fallback')).toBe(JSON.stringify({ detail: undefined }));
  });

  it('falls back to the generic fallback when ApiError body is undefined (empty Error message)', () => {
    const error = new ApiError(500, undefined);
    expect(apiErrorMessage(error, 'fallback')).toBe('fallback');
  });

  it('falls back to the Error message (JSON body) when detail is neither string nor array', () => {
    const error = new ApiError(400, { detail: { nested: true } });
    expect(apiErrorMessage(error, 'fallback')).toBe(JSON.stringify({ detail: { nested: true } }));
  });
});

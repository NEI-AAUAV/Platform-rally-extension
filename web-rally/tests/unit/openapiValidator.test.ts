import { describe, it, expect } from 'vitest';
import { assertMatchesOpenApiSchema, findResponseSchema } from '../e2e/helpers/openapiValidator';
import { MOCK_TEAM, MOCK_CHECKPOINT, MOCK_ACTIVITY_LIST, MOCK_RALLY_SETTINGS } from '../mocks/data';

describe('assertMatchesOpenApiSchema', () => {
  it('accepts the team list mock as documented by openapi.json', () => {
    expect(() => assertMatchesOpenApiSchema([MOCK_TEAM], '/api/rally/v1/team/', 'get', 200)).not.toThrow();
  });

  it('accepts the checkpoint list mock', () => {
    expect(() =>
      assertMatchesOpenApiSchema([MOCK_CHECKPOINT], '/api/rally/v1/checkpoint/', 'get', 200),
    ).not.toThrow();
  });

  it('accepts the activity list mock', () => {
    expect(() =>
      assertMatchesOpenApiSchema(MOCK_ACTIVITY_LIST, '/api/rally/v1/activities/', 'get', 200),
    ).not.toThrow();
  });

  it('accepts the rally settings mock', () => {
    expect(() =>
      assertMatchesOpenApiSchema(MOCK_RALLY_SETTINGS, '/api/rally/v1/rally/settings/public', 'get', 200),
    ).not.toThrow();
  });

  it('throws when a required property is missing (mock drift)', () => {
    const drifted = { ...MOCK_TEAM } as Record<string, unknown>;
    delete drifted.id;
    expect(() => assertMatchesOpenApiSchema([drifted], '/api/rally/v1/team/', 'get', 200)).toThrow(/required property missing/);
  });

  it('throws when a field type drifts from the schema', () => {
    const drifted = { ...MOCK_TEAM, id: 'not-a-number' };
    expect(() => assertMatchesOpenApiSchema([drifted], '/api/rally/v1/team/', 'get', 200)).toThrow(/expected type/);
  });

  it('throws when the path/method/status has no documented schema', () => {
    expect(() =>
      assertMatchesOpenApiSchema({}, '/api/rally/v1/does-not-exist', 'get', 200),
    ).toThrow(/no GET 200 response schema/);
  });

  it('resolves a templated path to its schema', () => {
    const schema = findResponseSchema('/api/rally/v1/checkpoint/42', 'put', 200);
    expect(schema).toBeDefined();
  });
});

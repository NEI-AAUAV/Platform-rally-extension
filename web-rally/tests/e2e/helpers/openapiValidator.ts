import openapiSchema from '../../../openapi.json';

/**
 * Minimal JSON Schema (OpenAPI 3.1 subset) validator used only to catch mock
 * drift in e2e tests — not a general-purpose validator. Supports the subset
 * FastAPI/Pydantic actually emits: object/array/string/integer/number/boolean,
 * $ref, allOf, anyOf, nullable via `type: [T, "null"]`, and enum.
 */

type JsonSchema = Record<string, unknown>;

interface OpenApiDoc {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }> }>>;
  components: { schemas: Record<string, JsonSchema> };
}

const doc = openapiSchema as unknown as OpenApiDoc;

function resolveRef(schema: JsonSchema): JsonSchema {
  const ref = schema.$ref as string | undefined;
  if (!ref) return schema;
  const name = ref.replace('#/components/schemas/', '');
  const resolved = doc.components.schemas[name];
  if (!resolved) {
    throw new Error(`openapi.json: unknown $ref "${ref}"`);
  }
  return resolved;
}

/**
 * Convert an OpenAPI path template ("/api/rally/v1/team/{id}") into a regex,
 * so a concrete request URL can be matched back to its schema entry.
 */
function pathTemplateToRegex(template: string): RegExp {
  const escaped = template
    .split('/')
    .map((segment) => (segment.startsWith('{') && segment.endsWith('}') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${escaped}/?$`);
}

/** Find the OpenAPI response schema for a given request path/method/status. */
export function findResponseSchema(
  requestPath: string,
  method: string,
  status: number,
): JsonSchema | undefined {
  const lowerMethod = method.toLowerCase();
  for (const [template, operations] of Object.entries(doc.paths)) {
    if (!pathTemplateToRegex(template).test(requestPath)) continue;
    const operation = operations[lowerMethod];
    if (!operation?.responses) continue;
    const response = operation.responses[String(status)] ?? operation.responses.default;
    const schema = response?.content?.['application/json']?.schema;
    if (schema) return schema;
  }
  return undefined;
}

function typeMatches(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

export interface ValidationError {
  path: string;
  message: string;
}

function validateAnyOf(value: unknown, variants: JsonSchema[], path: string, errors: ValidationError[]): void {
  const allFailed = variants.every((variant) => {
    const localErrors: ValidationError[] = [];
    validateValue(value, variant, path, localErrors);
    return localErrors.length > 0;
  });
  if (allFailed) {
    errors.push({ path, message: `value matches none of the anyOf variants` });
  }
}

function validateAllOf(value: unknown, subSchemas: JsonSchema[], path: string, errors: ValidationError[]): void {
  for (const sub of subSchemas) {
    validateValue(value, sub, path, errors);
  }
}

function getExpectedTypes(schema: JsonSchema): string[] {
  if (Array.isArray(schema.type)) return schema.type as string[];
  return schema.type ? [schema.type as string] : [];
}

function validateEnum(value: unknown, schema: JsonSchema, path: string, errors: ValidationError[]): void {
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) {
    errors.push({ path, message: `value "${String(value)}" not in enum [${(schema.enum as unknown[]).join(', ')}]` });
  }
}

function validateObjectProperties(
  value: unknown,
  schema: JsonSchema,
  expectedTypes: string[],
  path: string,
  errors: ValidationError[],
): void {
  if (!expectedTypes.includes('object') && !(schema.properties && typeof value === 'object')) return;

  const obj = value as Record<string, unknown>;
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = (schema.required ?? []) as string[];

  for (const key of required) {
    if (!(key in obj)) {
      errors.push({ path: `${path}.${key}`, message: 'required property missing' });
    }
  }

  for (const [key, propSchema] of Object.entries(properties)) {
    if (key in obj) {
      validateValue(obj[key], propSchema, `${path}.${key}`, errors);
    }
  }
}

function validateArrayItems(
  value: unknown,
  schema: JsonSchema,
  expectedTypes: string[],
  path: string,
  errors: ValidationError[],
): void {
  if (!expectedTypes.includes('array') || !schema.items || !Array.isArray(value)) return;

  value.forEach((item, index) => {
    validateValue(item, schema.items as JsonSchema, `${path}[${index}]`, errors);
  });
}

function validateExpectedType(value: unknown, expectedTypes: string[], path: string, errors: ValidationError[]): boolean {
  if (expectedTypes.length === 0) return true;
  const matches = expectedTypes.some((t) => typeMatches(value, t));
  if (!matches) {
    errors.push({
      path,
      message: `expected type ${expectedTypes.join(' | ')}, got ${value === null ? 'null' : typeof value}`,
    });
  }
  return matches;
}

function validateValue(value: unknown, rawSchema: JsonSchema, path: string, errors: ValidationError[]): void {
  const schema = resolveRef(rawSchema);

  if (schema.anyOf) {
    validateAnyOf(value, schema.anyOf as JsonSchema[], path, errors);
    return;
  }

  if (schema.allOf) {
    validateAllOf(value, schema.allOf as JsonSchema[], path, errors);
    return;
  }

  const expectedTypes = getExpectedTypes(schema);
  if (!validateExpectedType(value, expectedTypes, path, errors)) return;
  if (value === null) return;

  validateEnum(value, schema, path, errors);
  validateObjectProperties(value, schema, expectedTypes, path, errors);
  validateArrayItems(value, schema, expectedTypes, path, errors);
}

/**
 * Validate a mocked response payload against the schema openapi.json declares
 * for that path/method/status. Throws with a readable diff on drift instead
 * of returning a boolean, so a failing mock fails loudly at test setup time.
 */
export function assertMatchesOpenApiSchema(
  payload: unknown,
  requestPath: string,
  method: string,
  status = 200,
): void {
  const schema = findResponseSchema(requestPath, method, status);
  if (!schema) {
    throw new Error(
      `openapi.json has no ${method.toUpperCase()} ${status} response schema for "${requestPath}" — ` +
        `mock route path doesn't match any documented operation (route removed/renamed?).`,
    );
  }

  const errors: ValidationError[] = [];
  validateValue(payload, schema, '$', errors);

  if (errors.length > 0) {
    const details = errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
    throw new Error(
      `Mock payload for ${method.toUpperCase()} ${requestPath} drifted from openapi.json schema:\n${details}`,
    );
  }
}

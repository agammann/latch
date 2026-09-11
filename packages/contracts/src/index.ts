/** Deliberately bounded JSON Schema subset; no coercion, remote refs, defaults or executable validators. */
export type Schema = {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: unknown[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
};
export class LatchError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LatchError';
  }
}
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function checkSchema(s: Schema, path = '$', depth = 0): void {
  if (depth > 16 || !s || typeof s !== 'object' || Array.isArray(s))
    throw new LatchError('SCHEMA', `${path}: invalid schema`);
  const allowed = [
    'type',
    'description',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'maxItems',
  ];
  for (const k of Object.keys(s))
    if (!allowed.includes(k)) throw new LatchError('SCHEMA', `${path}: unsupported keyword ${k}`);
  if (!['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(s.type))
    throw new LatchError('SCHEMA', `${path}: unsupported type`);
  if (s.description !== undefined && typeof s.description !== 'string')
    throw new LatchError('SCHEMA', `${path}: description must be text`);
  for (const k of ['minLength', 'maxLength', 'maxItems', 'minimum', 'maximum'] as const)
    if (
      s[k] !== undefined &&
      (!Number.isFinite(s[k]) ||
        (['minLength', 'maxLength', 'maxItems'].includes(k) &&
          (!Number.isInteger(s[k]) || s[k]! < 0)))
    )
      throw new LatchError('SCHEMA', `${path}: invalid ${k}`);
  if (s.enum && (!Array.isArray(s.enum) || !s.enum.length))
    throw new LatchError('SCHEMA', `${path}: enum must be nonempty`);
  if (s.type === 'object') {
    if (
      !s.properties ||
      typeof s.properties !== 'object' ||
      Array.isArray(s.properties) ||
      s.additionalProperties !== false
    )
      throw new LatchError(
        'SCHEMA',
        `${path}: objects require properties and additionalProperties:false`,
      );
    for (const [k, v] of Object.entries(s.properties)) {
      if (forbidden.has(k)) throw new LatchError('SCHEMA', `${path}: unsafe property`);
      checkSchema(v, `${path}.${k}`, depth + 1);
    }
    if (
      s.required &&
      (!Array.isArray(s.required) ||
        s.required.some((k) => typeof k !== 'string' || !own(s.properties!, k)) ||
        new Set(s.required).size !== s.required.length)
    )
      throw new LatchError('SCHEMA', `${path}: invalid required list`);
  }
  if (s.type === 'array') {
    if (!s.items) throw new LatchError('SCHEMA', `${path}: array requires items`);
    checkSchema(s.items, `${path}[]`, depth + 1);
  }
  for (const k of ['properties', 'required', 'additionalProperties'])
    if (own(s, k) && s.type !== 'object')
      throw new LatchError('SCHEMA', `${path}: ${k} requires object`);
  if (s.items && s.type !== 'array')
    throw new LatchError('SCHEMA', `${path}: items requires array`);
  for (const k of ['minLength', 'maxLength'] as const)
    if (s[k] !== undefined && s.type !== 'string')
      throw new LatchError('SCHEMA', `${path}: ${k} requires string`);
  for (const k of ['minimum', 'maximum'] as const)
    if (s[k] !== undefined && !['number', 'integer'].includes(s.type))
      throw new LatchError('SCHEMA', `${path}: ${k} requires number`);
  if (s.maxItems !== undefined && s.type !== 'array')
    throw new LatchError('SCHEMA', `${path}: maxItems requires array`);
  if (
    (s.minimum ?? -Infinity) > (s.maximum ?? Infinity) ||
    (s.minLength ?? 0) > (s.maxLength ?? Infinity)
  )
    throw new LatchError('SCHEMA', `${path}: inverted bounds`);
  if (s.enum) for (const value of s.enum) validate({ ...s, enum: undefined }, value, path);
}
export function validate(s: Schema, value: unknown, path = '$', depth = 0): void {
  const fail = (why: string): never => {
    throw new LatchError('VALIDATION', `${path}: ${why}`);
  };
  if (depth > 32) fail('maximum nesting exceeded');
  if (s.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      fail('expected object');
    const obj = value as Record<string, unknown>;
    for (const k of s.required ?? []) if (!own(obj, k)) fail(`missing ${k}`);
    for (const k of Object.keys(obj)) {
      if (forbidden.has(k) || !own(s.properties ?? {}, k)) fail(`unexpected property ${k}`);
      validate(s.properties![k], obj[k], `${path}.${k}`, depth + 1);
    }
  } else if (s.type === 'array') {
    if (!Array.isArray(value)) fail('expected array');
    const arr = value as unknown[];
    if (s.maxItems !== undefined && arr.length > s.maxItems) fail('too many items');
    arr.forEach((v, i) => validate(s.items!, v, `${path}[${i}]`, depth + 1));
  } else if (s.type === 'null') {
    if (value !== null) fail('expected null');
  } else if (s.type === 'number' || s.type === 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (s.type === 'integer' && !Number.isInteger(value))
    )
      fail(`expected ${s.type}`);
    if (s.minimum !== undefined && (value as number) < s.minimum) fail('below minimum');
    if (s.maximum !== undefined && (value as number) > s.maximum) fail('above maximum');
  } else if (typeof value !== s.type) fail(`expected ${s.type}`);
  if (typeof value === 'string') {
    if (s.minLength !== undefined && value.length < s.minLength) fail('too short');
    if (s.maxLength !== undefined && value.length > s.maxLength) fail('too long');
  }
  if (s.enum && !s.enum.some((v) => JSON.stringify(v) === JSON.stringify(value)))
    fail('not in enum');
}
export interface Contract {
  name: string;
  description: string;
  inputSchema: Schema;
  resultSchema: Schema;
  scope: { route: string; component: string };
  preconditions: string[];
  sideEffects: 'none' | 'ui';
}
export interface ExecutionContext {
  signal: AbortSignal;
  /** Check immediately before committing asynchronous state. */ assertActive(): void;
}
export type Handler<I = any, O = any> = (input: I, context: ExecutionContext) => O | Promise<O>;
export function checkContract(c: Contract): void {
  if (
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(c.name) ||
    typeof c.description !== 'string' ||
    !c.description.trim()
  )
    throw new LatchError('CONTRACT', 'Tool requires a stable name and description');
  checkSchema(c.inputSchema);
  checkSchema(c.resultSchema);
  if (c.inputSchema.type !== 'object')
    throw new LatchError('CONTRACT', 'Tool inputs must be objects');
  if (
    !c.scope ||
    typeof c.scope.route !== 'string' ||
    !c.scope.route.startsWith('/') ||
    !c.scope.component ||
    !['none', 'ui'].includes(c.sideEffects) ||
    !Array.isArray(c.preconditions) ||
    c.preconditions.some((p) => typeof p !== 'string')
  )
    throw new LatchError('CONTRACT', `${c.name}: invalid scope, preconditions or effects`);
}

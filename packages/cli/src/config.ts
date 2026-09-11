import { checkContract, type Contract, type Schema } from '@latch-local/contracts';
import type { TestCase, TestProject } from '@latch-local/test';
import { assertLocal } from '@latch-local/test';
import { installationSource, json, safe } from './files.js';
export interface Tool extends Contract {
  binding: { kind: 'export' | 'react'; module: string; export?: string; reference?: string };
}
export interface Config extends TestProject {
  version: 1;
  project: string;
  installation: { file: string };
  tools: Tool[];
}
function keys(obj: any, allowed: string[], label: string) {
  if (
    !obj ||
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    Object.keys(obj).some((k) => !allowed.includes(k))
  )
    throw Error(`${label}: invalid object or unsupported field`);
}
const text = (s: any) => typeof s === 'string' && s.length > 0 && s.length <= 2000;
function selector(s: any) {
  keys(s, ['testId', 'label', 'role', 'name'], 'selector');
  if (
    !(
      text(s.testId) ||
      text(s.label) ||
      (['button', 'link', 'heading'].includes(s.role) && text(s.name))
    )
  )
    throw Error('Use a testId, accessible label or named role selector');
}
function actions(arr: any) {
  if (!Array.isArray(arr) || arr.length > 50) throw Error('Invalid actions');
  for (const a of arr) {
    keys(a, ['kind', 'target', 'value'], 'action');
    selector(a.target);
    if (
      !['click', 'fill', 'select'].includes(a.kind) ||
      (a.kind !== 'click' && typeof a.value !== 'string')
    )
      throw Error('Invalid predefined action');
  }
}
function assertions(arr: any) {
  if (!Array.isArray(arr) || arr.length > 100) throw Error('Invalid UI assertions');
  for (const a of arr) {
    keys(a, ['target', 'kind', 'equals'], 'UI assertion');
    selector(a.target);
    if (
      !['text', 'value', 'count', 'visible'].includes(a.kind) ||
      !['string', 'number', 'boolean'].includes(typeof a.equals)
    )
      throw Error('Invalid UI assertion');
  }
}
export function loadConfig(root: string): Config {
  const c = json(root, 'latch.config.json');
  keys(
    c,
    ['version', 'project', 'baseUrl', 'browser', 'installation', 'tools', 'tests'],
    'configuration',
  );
  if (c.version !== 1)
    throw Error(`Unsupported config version ${c.version}; run latch migrate --to 1 for guidance`);
  if (!text(c.project)) throw Error('Project name required');
  const base = assertLocal(c.baseUrl);
  if (base.href !== base.origin + '/') throw Error('baseUrl must be an origin without a path');
  keys(c.browser, ['channel', 'native'], 'browser');
  if (!['chrome', 'chromium'].includes(c.browser.channel) || typeof c.browser.native !== 'boolean')
    throw Error('Invalid browser configuration');
  keys(c.installation, ['file'], 'installation');
  installationSource(root, c.installation.file);
  if (!Array.isArray(c.tools) || !c.tools.length || c.tools.length > 100)
    throw Error('Configure 1–100 explicit tools');
  const names = new Set<string>();
  for (const t of c.tools) {
    keys(
      t,
      [
        'name',
        'description',
        'inputSchema',
        'resultSchema',
        'scope',
        'preconditions',
        'sideEffects',
        'binding',
      ],
      'tool',
    );
    checkContract(t);
    keys(t.scope, ['route', 'component'], 'scope');
    if (names.has(t.name)) throw Error(`Duplicate tool ${t.name}`);
    names.add(t.name);
    keys(t.binding, ['kind', 'module', 'export', 'reference'], 'binding');
    safe(root, t.binding.module);
    if (
      !/\.(tsx?|jsx?)$/.test(t.binding.module) ||
      /secret|credential|\.env/i.test(t.binding.module)
    )
      throw Error('Mapping must refer to a non-secret source file');
    if (!['export', 'react'].includes(t.binding.kind)) throw Error('Unknown binding kind');
    const ref = t.binding.kind === 'export' ? t.binding.export : t.binding.reference;
    if (!/^[A-Za-z_$][\w$]*$/.test(ref ?? ''))
      throw Error(`${t.name}: explicit binding identifier required`);
    if (t.preconditions.length)
      throw Error(
        'v1 generated integrations support route/mount preconditions; custom precondition predicates require the runtime API directly',
      );
  }
  if (!Array.isArray(c.tests) || !c.tests.length || c.tests.length > 200)
    throw Error('At least one configured regression test is required');
  const testNames = new Set();
  for (const t of c.tests) {
    keys(
      t,
      [
        'name',
        'route',
        'fixture',
        'mode',
        'timeoutMs',
        'before',
        'calls',
        'concurrent',
        'ui',
        'after',
        'afterUI',
        'absentTools',
      ],
      'test',
    );
    if (
      !text(t.name) ||
      testNames.has(t.name) ||
      !text(t.route) ||
      !t.route.startsWith('/') ||
      new URL(t.route, base).origin !== base.origin ||
      t.fixture !== 'fresh-page' ||
      !['handler', 'native'].includes(t.mode) ||
      !Number.isInteger(t.timeoutMs) ||
      t.timeoutMs < 500 ||
      t.timeoutMs > 60000
    )
      throw Error('Invalid test name, route, fixture, mode or timeout');
    testNames.add(t.name);
    if (!Array.isArray(t.calls) || !t.calls.length || t.calls.length > 50)
      throw Error('Tests require 1–50 calls');
    for (const call of t.calls) {
      keys(call, ['tool', 'input', 'result', 'expectError'], 'call');
      if (!names.has(call.tool) || !Object.hasOwn(call, 'input'))
        throw Error('Test references unknown tool or missing input');
      if (call.expectError !== undefined && !text(call.expectError))
        throw Error('Invalid expected error');
      if (call.result !== undefined) {
        if (!Array.isArray(call.result)) throw Error('Invalid result assertions');
        for (const a of call.result) {
          keys(a, ['path', 'equals'], 'result assertion');
          if (
            !Array.isArray(a.path) ||
            a.path.some(
              (s: any) =>
                typeof s !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(s),
            ) ||
            !Object.hasOwn(a, 'equals')
          )
            throw Error('Result path must be a safe array of keys');
        }
      }
    }
    if (t.before) actions(t.before);
    if (t.after) actions(t.after);
    if (t.ui) assertions(t.ui);
    if (t.afterUI) assertions(t.afterUI);
    if (
      t.absentTools &&
      (!Array.isArray(t.absentTools) || t.absentTools.some((n: any) => !names.has(n)))
    )
      throw Error('Invalid cleanup tool names');
  }
  return c as Config;
}
export function schemaType(s: Schema): string {
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (s.type === 'object')
    return `{ ${Object.entries(s.properties ?? {})
      .map(
        ([k, v]) => `${JSON.stringify(k)}${s.required?.includes(k) ? '' : '?'}: ${schemaType(v)}`,
      )
      .join('; ')} }`;
  if (s.type === 'array') return `Array<${schemaType(s.items!)}>`;
  if (s.type === 'integer') return 'number';
  return s.type;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const base = path.resolve('work/tests');
fs.mkdirSync(base, { recursive: true });
const fixture = () => {
  const root = fs.mkdtempSync(path.join(base, 'async-race-'));
  fs.cpSync('examples/docs', root, {
    recursive: true,
    filter: s => !s.split(path.sep).some(p => ['node_modules', 'dist', '.latch', 'latch.generated'].includes(p)),
  });
  const main = path.join(root, 'src/main.tsx');
  fs.writeFileSync(main, fs.readFileSync(main, 'utf8')
    .replace(/^import \{ useProjectTools \}.*\n/, '')
    .replace(/useProjectTools\(\{\}\); \/\/ @latch:mount/, '// @latch:mount'));
  fs.writeFileSync(path.join(root, 'base.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx',
    strict: true, noEmit: true, skipLibCheck: true, types: ['vite/client'],
  } }));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ extends: './base.json', include: ['src'] }));
  return root;
};

async function prepareWorker(target, kind) {
  fs.mkdirSync('packages/cli/work', { recursive: true });
  const directory = fs.mkdtempSync(path.resolve('packages/cli/work/async-race-dist-'));
  fs.cpSync('packages/cli/dist', directory, { recursive: true });
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-async-race-'));
  const ready = path.join(control, 'ready');
  const release = path.join(control, 'release');
  const worker = path.join(directory, 'ts7-pipe-worker.js');
  let source = fs.readFileSync(worker, 'utf8');
  const needle = kind === 'missing' ? "observe('file', file, String(value));" : "observe('content', file, digest(bytes));";
  assert.ok(source.includes(needle));
  const pause = `\nif (path.resolve(file) === ${JSON.stringify(path.resolve(target))} && !globalThis.__racePaused) { globalThis.__racePaused = true; fs.appendFileSync(${JSON.stringify(ready)}, 'x'); while (!fs.existsSync(${JSON.stringify(release)})) await new Promise(resolve => setTimeout(resolve, 20)); }\n`;
  source = source.replace(needle, needle + pause);
  fs.writeFileSync(worker, source);
  const module = await import(pathToFileURL(path.join(directory, 'generate.js')).href);
  return { module, ready, release, directory };
}

async function waitForReady(file) {
  const deadline = Date.now() + 20_000;
  while (!fs.existsSync(file) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(fs.existsSync(file), `compiler never read ${file}`);
}

async function changeDuringValidation(root, target, kind, change, action = 'generate') {
  const { module, ready, release } = await prepareWorker(target, kind);
  const pending = module[action](root).then(value => ({ value }), error => ({ error }));
  try {
    await waitForReady(ready);
    await change();
  } finally { fs.writeFileSync(release, 'release'); }
  const result = await pending;
  assert.ok(result.error, 'changed inputs must not validate');
  assert.match(result.error.message, /changed|not assignable|validation/i);
  return module;
}

test('imported source modified during validation cannot be accepted', { timeout: 30_000 }, async () => {
  const root = fixture();
  const file = path.join(root, 'src/imported.ts');
  fs.writeFileSync(file, 'export const checked: number = 1;');
  fs.appendFileSync(path.join(root, 'src/main.tsx'), '\nimport { checked } from "./imported"; void checked;\n');
  await changeDuringValidation(root, file, 'content', () => fs.writeFileSync(file, 'export const checked: number = "bad";'));
  assert.equal(fs.existsSync(path.join(root, 'src/latch.generated/integration.ts')), false);
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('inherited configuration modified during validation cannot be accepted', { timeout: 30_000 }, async () => {
  const root = fixture();
  const file = path.join(root, 'base.json');
  await changeDuringValidation(root, file, 'content', () => fs.writeFileSync(file, JSON.stringify({ compilerOptions: { noCheck: true } })));
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('package exports changed during validation cannot be accepted', { timeout: 30_000 }, async () => {
  const root = fixture();
  const dir = path.join(root, 'node_modules/racepkg');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'package.json');
  fs.writeFileSync(file, JSON.stringify({ name: 'racepkg', version: '1.0.0', exports: { '.': { types: './index.d.ts' } } }));
  fs.writeFileSync(path.join(dir, 'index.d.ts'), 'export const checked: number;');
  fs.appendFileSync(path.join(root, 'src/main.tsx'), '\nimport { checked } from "racepkg"; void checked;\n');
  await changeDuringValidation(root, file, 'content', () => fs.writeFileSync(file, JSON.stringify({ name: 'racepkg', version: '1.0.0', exports: { '.': { types: './missing.d.ts' } } })));
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('a previously missing module appearing during validation is detected', { timeout: 30_000 }, async () => {
  const root = fixture();
  const file = path.join(root, 'src/fallback.ts');
  fs.writeFileSync(path.join(root, 'src/fallback.d.ts'), 'export const checked: number;');
  fs.appendFileSync(path.join(root, 'src/main.tsx'), '\nimport { checked } from "./fallback"; void checked;\n');
  await changeDuringValidation(root, file, 'missing', () => fs.writeFileSync(file, 'export const checked: number = "bad";'));
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('a file disappearing between stat and open fails closed even if restored', { timeout: 30_000 }, async () => {
  const root = fixture();
  const target = path.join(root, 'src/library.ts');
  const original = fs.readFileSync(target);
  fs.mkdirSync('packages/cli/work', { recursive: true });
  const directory = fs.mkdtempSync(path.resolve('packages/cli/work/disappearance-'));
  fs.cpSync('packages/cli/dist', directory, { recursive: true });
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'latch-disappearance-'));
  const ready = path.join(control, 'stat-done');
  const release = path.join(control, 'release-open');
  const missed = path.join(control, 'open-missed');
  const restored = path.join(control, 'restore-done');
  const worker = path.join(directory, 'ts7-pipe-worker.js');
  let source = fs.readFileSync(worker, 'utf8');
  const stat = "observe('file', file, String(isFile));";
  const missing = "observe('file', file, 'false');";
  assert.ok(source.includes(stat) && source.includes(missing));
  const pause = (marker, done) => `if (path.resolve(file) === ${JSON.stringify(target)} && !globalThis[${JSON.stringify(marker)}]) { globalThis[${JSON.stringify(marker)}] = true; fs.writeFileSync(${JSON.stringify(marker)}, 'ready'); while (!fs.existsSync(${JSON.stringify(done)})) await new Promise(resolve => setTimeout(resolve, 10)); }`;
  source = source.replace(stat, stat + '\n' + pause(ready, release));
  source = source.replace(missing, '{ ' + pause(missed, restored) + ' ' + missing + ' }');
  fs.writeFileSync(worker, source);
  const { generate } = await import(pathToFileURL(path.join(directory, 'generate.js')).href);
  const pending = generate(root).then(value => ({ value }), error => ({ error }));
  try {
    await waitForReady(ready);
    fs.unlinkSync(target);
    fs.writeFileSync(release, 'go');
    await waitForReady(missed);
    fs.writeFileSync(target, original);
    fs.writeFileSync(restored, 'go');
    const result = await pending;
    assert.match(result.error?.message ?? '', /changed|validation|compiler exited unexpectedly/i);
    assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/latch.generated/integration.ts')), false);
  } finally {
    if (!fs.existsSync(target)) fs.writeFileSync(target, original);
    if (!fs.existsSync(release)) fs.writeFileSync(release, 'go');
    if (!fs.existsSync(restored)) fs.writeFileSync(restored, 'go');
  }
});

test('a project TypeScript package change during validation is detected', { timeout: 30_000 }, async () => {
  const root = fixture();
  const packageDir = path.join(root, 'node_modules/typescript');
  fs.mkdirSync(packageDir, { recursive: true });
  const manifest = path.join(packageDir, 'package.json');
  fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript', version: '7.0.2' }));
  await changeDuringValidation(root, path.join(root, 'src/library.ts'), 'content', () => {
    fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript', version: '6.0.2' }));
  });
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('a transient project TypeScript package edit is detected', { timeout: 30_000 }, async () => {
  const root = fixture();
  const packageDir = path.join(root, 'node_modules/typescript');
  fs.mkdirSync(packageDir, { recursive: true });
  const manifest = path.join(packageDir, 'package.json');
  const original = JSON.stringify({ name: 'typescript', version: '7.0.2' });
  fs.writeFileSync(manifest, original);
  await changeDuringValidation(root, path.join(root, 'src/library.ts'), 'content', async () => {
    fs.writeFileSync(manifest, JSON.stringify({ name: 'typescript', version: '6.0.2' }));
    await new Promise(resolve => setTimeout(resolve, 25));
    fs.writeFileSync(manifest, original);
  });
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('a nearer TypeScript package appearing during validation is detected', { timeout: 30_000 }, async () => {
  const root = fixture();
  const packageDir = path.join(root, 'node_modules/typescript');
  await changeDuringValidation(root, path.join(root, 'src/library.ts'), 'content', () => {
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'typescript', version: '7.0.2' }));
  });
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('a TypeScript package junction retarget during validation is detected', { timeout: 30_000 }, async () => {
  const root = fixture();
  const v7 = path.join(root, 'typescript-seven');
  const v6 = path.join(root, 'typescript-six');
  fs.mkdirSync(v7); fs.mkdirSync(v6);
  fs.writeFileSync(path.join(v7, 'package.json'), JSON.stringify({ name: 'typescript', version: '7.0.2' }));
  fs.writeFileSync(path.join(v6, 'package.json'), JSON.stringify({ name: 'typescript', version: '6.0.2' }));
  fs.mkdirSync(path.join(root, 'node_modules'));
  const link = path.join(root, 'node_modules/typescript');
  fs.symlinkSync(v7, link, 'junction');
  await changeDuringValidation(root, path.join(root, 'src/library.ts'), 'content', () => {
    fs.unlinkSync(link);
    fs.symlinkSync(v6, link, 'junction');
  });
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('an unowned generated file appearing during validation is not overwritten', { timeout: 30_000 }, async () => {
  const root = fixture();
  const target = path.join(root, 'src/library.ts');
  const generated = path.join(root, 'src/latch.generated/integration.ts');
  await changeDuringValidation(root, target, 'content', () => {
    fs.mkdirSync(path.dirname(generated), { recursive: true });
    fs.writeFileSync(generated, '// user-created file');
  });
  assert.equal(fs.readFileSync(generated, 'utf8'), '// user-created file');
  assert.equal(fs.existsSync(path.join(root, '.latch/manifest.json')), false);
});

test('same-project validations are serialized', { timeout: 30_000 }, async () => {
  const root = fixture();
  const { module, ready, release } = await prepareWorker(path.join(root, 'src/library.ts'), 'content');
  const first = module.generate(root);
  const firstResult = first.then(value => ({ value }), error => ({ error }));
  try {
    await waitForReady(ready);
    const second = module.generate(root);
    const secondResult = second.then(value => ({ value }), error => ({ error }));
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(fs.readFileSync(ready, 'utf8'), 'x', 'second validation must not start while the first is running');
    fs.writeFileSync(release, 'release');
    const [a, b] = await Promise.all([firstResult, secondResult]);
    assert.equal(a.error, undefined);
    assert.equal(b.error, undefined);
    assert.equal(fs.readFileSync(ready, 'utf8'), 'xx');
  } finally { if (!fs.existsSync(release)) fs.writeFileSync(release, 'release'); }
});

test('apply refuses a concurrently edited installation file', { timeout: 30_000 }, async () => {
  const root = fixture();
  const normal = await import('../packages/cli/dist/generate.js');
  await normal.generate(root);
  const main = path.join(root, 'src/main.tsx');
  const before = fs.readFileSync(main, 'utf8');
  await changeDuringValidation(root, path.join(root, 'src/library.ts'), 'content', () => {
    fs.appendFileSync(main, '\n// user edit');
  }, 'apply');
  assert.equal(fs.readFileSync(main, 'utf8'), before + '\n// user edit');
});

test('the existing TypeScript 5 path writes before a queued microtask', { timeout: 30_000 }, async () => {
  const root = fixture();
  const packageDir = path.join(root, 'node_modules/typescript');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'typescript', version: '5.9.3' }));
  const imported = path.join(root, 'src/imported.ts');
  fs.writeFileSync(imported, 'export const checked: number = 1;');
  fs.appendFileSync(path.join(root, 'src/main.tsx'), '\nimport { checked } from "./imported"; void checked;\n');
  const normal = await import('../packages/cli/dist/generate.js');
  queueMicrotask(() => fs.writeFileSync(imported, 'export const checked: number = "bad";'));
  const pending = normal.generate(root);
  assert.ok(fs.existsSync(path.join(root, '.latch/manifest.json')));
  assert.equal(fs.readFileSync(imported, 'utf8'), 'export const checked: number = 1;');
  await pending;
  assert.equal(fs.readFileSync(imported, 'utf8'), 'export const checked: number = "bad";');
});

test('capture observes the checked state before queued edits for TypeScript 5 and 7', { timeout: 30_000 }, async () => {
  for (const version of ['5.9.3', '7.0.2']) {
    const root = fixture();
    const packageDir = path.join(root, 'node_modules/typescript');
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'typescript', version }));
    const normal = await import('../packages/cli/dist/generate.js');
    await normal.generate(root);
    const config = path.join(root, 'latch.config.json');
    const original = JSON.parse(fs.readFileSync(config, 'utf8'));
    const changed = { ...original, project: 'changed-after-validation' };
    fs.mkdirSync('packages/cli/work', { recursive: true });
    const directory = fs.mkdtempSync(path.resolve('packages/cli/work/capture-dist-'));
    fs.cpSync('packages/cli/dist', directory, { recursive: true });
    const file = path.join(directory, 'generate.js');
    let source = fs.readFileSync(file, 'utf8');
    const anchor = 'return { result, value: onValidated?.() };';
    assert.ok(source.includes(anchor));
    source = source.replace(anchor, `queueMicrotask(() => fs.writeFileSync(${JSON.stringify(config)}, ${JSON.stringify(JSON.stringify(changed))}));\n${anchor}`);
    fs.writeFileSync(file, source);
    const { checkAndCapture } = await import(pathToFileURL(file).href);
    const captured = await checkAndCapture(root, () => JSON.parse(fs.readFileSync(config, 'utf8')));
    assert.equal(captured.result.generatedTypes, 'compiled');
    assert.equal(captured.value.project, original.project);
    assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).project, changed.project);
  }
});

test('queued project requests capture the version checked and report validation failures', { timeout: 30_000 }, async () => {
  const root = fixture();
  const initial = await import('../packages/cli/dist/generate.js');
  await initial.generate(root);
  const { ready, release, directory } = await prepareWorker(path.join(root, 'src/library.ts'), 'content');
  const serviceFile = path.join(directory, 'service.js');
  const countFile = path.join(directory, 'get-count');
  let source = fs.readFileSync(serviceFile, 'utf8');
  const anchor = 'const capture = () => {';
  assert.ok(source.includes(anchor));
  source = source.replace(anchor, `globalThis.__latchGetCount = (globalThis.__latchGetCount || 0) + 1; fs.writeFileSync(${JSON.stringify(countFile)}, String(globalThis.__latchGetCount));\n${anchor}`);
  fs.writeFileSync(serviceFile, source);
  const { serve } = await import(pathToFileURL(serviceFile).href);
  const { server, url } = await serve(root, 0);
  try {
    const first = fetch(url + '/api/project').then(response => response.json());
    await waitForReady(ready);
    const configFile = path.join(root, 'latch.config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    config.project = 'new-project';
    fs.writeFileSync(configFile, JSON.stringify(config));
    const second = fetch(url + '/api/project').then(response => response.json());
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (!fs.existsSync(countFile) || fs.readFileSync(countFile, 'utf8') !== '2')) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.readFileSync(countFile, 'utf8'), '2');
    fs.writeFileSync(release, 'release');
    const [a, b] = await Promise.all([first, second]);
    assert.match(a.checked.error, /changed/);
    assert.equal(a.project, 'new-project');
    assert.equal(b.project, 'new-project');
    assert.equal(b.checked.generatedTypes, 'compiled');
  } finally {
    if (!fs.existsSync(release)) fs.writeFileSync(release, 'release');
    await new Promise(resolve => server.close(resolve));
    delete globalThis.__latchGetCount;
  }
});

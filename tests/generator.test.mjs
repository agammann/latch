import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generate, apply, rollback, check } from '../packages/cli/dist/generate.js';
import { inspect } from '../packages/cli/dist/inspect.js';
import { safe } from '../packages/cli/dist/files.js';
const base = path.resolve('work/tests');
fs.mkdirSync(base, { recursive: true });
function fixture() {
  const root = fs.mkdtempSync(path.join(base, 'consumer-'));
  fs.cpSync('examples/docs', root, {
    recursive: true,
    filter: (s) => !s.split(path.sep).some((p) => ['node_modules', 'dist', '.latch'].includes(p)),
  });
  const source = fs
    .readFileSync(path.join(root, 'src/main.tsx'), 'utf8')
    .replace(/^import \{ useProjectTools \}.*\n/, '')
    .replace(/useProjectTools\(\{\}\); \/\/ @latch:mount/, '// @latch:mount');
  fs.writeFileSync(path.join(root, 'src/main.tsx'), source);
  fs.rmSync(path.join(root, 'src/latch.generated'), { recursive: true, force: true });
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['vite/client'],
      },
      include: ['src'],
    }),
  );
  return root;
}
// Workspace package aliases are resolved through root dependencies, installed by pnpm for these isolated fixtures.
test('generation is idempotent; apply and rollback preserve original source', async () => {
  const r = fixture();
  const before = fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8');
  await generate(r);
  const first = fs.readFileSync(path.join(r, 'src/latch.generated/integration.ts'), 'utf8');
  await generate(r);
  assert.equal(fs.readFileSync(path.join(r, 'src/latch.generated/integration.ts'), 'utf8'), first);
  await apply(r);
  assert.equal((await check(r)).installation, 'applied');
  await apply(r);
  await rollback(r);
  assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
});
test('edited generated code prevents generation and rollback', async () => {
  const r = fixture();
  await generate(r);
  fs.appendFileSync(path.join(r, 'src/latch.generated/integration.ts'), '// handwritten');
  await assert.rejects(() => generate(r), /edited/);
  await assert.rejects(() => rollback(r), /changed/);
});
test('a valid 0.1.0 ownership manifest upgrades and keeps rollback protection', async () => {
  const r = fixture();
  const before = fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8');
  await generate(r);
  await apply(r);
  const output = path.join(r, 'src/latch.generated/integration.ts');
  fs.writeFileSync(output, fs.readFileSync(output, 'utf8').replace('Latch 1.0.2.', 'Latch 0.1.0.'));
  const manifestPath = path.join(r, '.latch/manifest.json');
  const old = JSON.parse(fs.readFileSync(manifestPath));
  old.generatorVersion = '0.1.0';
  old.files['src/latch.generated/integration.ts'].after = createHash('sha256').update(fs.readFileSync(output)).digest('hex');
  fs.writeFileSync(manifestPath, JSON.stringify(old));
  await generate(r);
  assert.equal(JSON.parse(fs.readFileSync(manifestPath)).generatorVersion, '1.0.2');
  assert.equal((await check(r)).installation, 'applied');
  await rollback(r);
  assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), before);
});
test('later component edits are preserved during rollback refusal', async () => {
  const r = fixture();
  await generate(r);
  await apply(r);
  fs.appendFileSync(path.join(r, 'src/main.tsx'), '\n// user change');
  await assert.rejects(() => rollback(r), /later edits/);
  assert.match(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), /user change/);
});
test('invalid exported mapping fails without fake success generation', async () => {
  const r = fixture();
  const p = path.join(r, 'latch.config.json');
  const c = JSON.parse(fs.readFileSync(p));
  c.tools[0].binding.export = 'missingHandler';
  fs.writeFileSync(p, JSON.stringify(c));
  await assert.rejects(() => generate(r), /not found/);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
});
test('type-incompatible mapping does not write a broken integration', async () => {
  const r = fixture();
  const p = path.join(r, 'latch.config.json');
  const c = JSON.parse(fs.readFileSync(p));
  c.tools[0].resultSchema.properties.query = { type: 'number' };
  fs.writeFileSync(p, JSON.stringify(c));
  await assert.rejects(() => generate(r), /not assignable/);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
});
test('inspection excludes secrets, huge files, dependencies and traversal', async () => {
  const r = fixture();
  fs.writeFileSync(path.join(r, 'src/secrets.ts'), 'export function stolen(){}');
  fs.writeFileSync(path.join(r, 'src/huge.ts'), ' '.repeat(300000) + 'export function huge(){}');
  assert.throws(() => safe(r, '../outside'));
  assert.throws(() => safe(r, 'C:/outside'));
  const entries = inspect(r);
  assert.ok(entries.some((e) => e.name === 'searchDocs'));
  assert.ok(!entries.some((e) => ['stolen', 'huge'].includes(e.name)));
  assert.ok(entries.every((e) => e.unresolved.length > 0));
});
test('symlink or junction escape is refused', async () => {
  const r = fixture();
  const dest = path.resolve('packages');
  fs.symlinkSync(dest, path.join(r, 'linked'), 'junction');
  assert.throws(() => safe(r, 'linked/runtime/package.json'), /links|junctions/);
  assert.ok(!inspect(r).some((e) => e.file.startsWith('linked/')));
});

test('crafted installation metadata cannot alter local Git configuration', async () => {
  const r = fixture();
  await generate(r);
  fs.mkdirSync(path.join(r, '.git'));
  const target = path.join(r, '.git/config');
  const original = '[core]\n  repositoryformatversion = 0\n';
  fs.writeFileSync(target, original);
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  record.installation = { file: '.git/config', before: 'replacement', after: original };
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  for (const command of [generate, check, apply, rollback]) {
    await assert.rejects(() => command(r), /application TypeScript/);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.ok(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')));
  }
});

test('forged ownership keys and restoration bodies fail before any deletion', async () => {
  const r = fixture();
  await generate(r);
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  const target = 'src/main.tsx';
  const original = fs.readFileSync(path.join(r, target), 'utf8');
  record.files[target] = {
    before: null,
    after: createHash('sha256').update(original).digest('hex'),
  };
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  await assert.rejects(() => rollback(r), /ownership manifest/);
  assert.equal(fs.readFileSync(path.join(r, target), 'utf8'), original);
  delete record.files[target];
  record.files['src/latch.generated/integration.ts'].before = 'replacement';
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  await assert.rejects(() => rollback(r), /ownership entry/);
  assert.ok(fs.existsSync(path.join(r, 'src/latch.generated/env.d.ts')));
});

test('unreviewed installation source is rejected by check, apply and rollback', async () => {
  const r = fixture();
  await generate(r);
  const original = fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8');
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  record.installation.after += '\nconsole.log("unreviewed");';
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  for (const command of [check, apply, rollback]) {
    await assert.rejects(() => command(r), /installation transition/);
    assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), original);
  }
});

test('a syntactically valid stored hook must match the configured installation plan', async () => {
  const r = fixture();
  await generate(r);
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  record.installation.after = record.installation.after.replace(
    'useProjectTools({});',
    'useProjectTools({"extra": searchDocs});',
  );
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  await assert.rejects(() => check(r), /plan changed/);
  await assert.rejects(() => apply(r), /plan changed/);
  assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), record.installation.before);
});

test('noCheck is rejected before an incompatible integration can be written', async () => {
  for (const inherited of [false, true]) {
    const r = fixture();
    const configPath = path.join(r, 'latch.config.json');
    const config = JSON.parse(fs.readFileSync(configPath));
    config.tools[0].resultSchema.properties.query = { type: 'number' };
    fs.writeFileSync(configPath, JSON.stringify(config));
    const tsconfigPath = path.join(r, 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath));
    if (inherited) {
      fs.writeFileSync(path.join(r, 'tsconfig.base.json'), JSON.stringify({ compilerOptions: { noCheck: true } }));
      tsconfig.extends = './tsconfig.base.json';
    } else tsconfig.compilerOptions.noCheck = true;
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig));
    const mainPath = path.join(r, 'src/main.tsx');
    const before = fs.readFileSync(mainPath, 'utf8');
    await assert.rejects(() => generate(r), /noCheck/);
    assert.equal(fs.readFileSync(mainPath, 'utf8'), before);
    assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
    assert.equal(fs.existsSync(path.join(r, '.latch/manifest.json')), false);
  }
});

test('noCheck blocks check and apply without modifying an existing integration', async () => {
  const r = fixture();
  await generate(r);
  const mainPath = path.join(r, 'src/main.tsx');
  const integrationPath = path.join(r, 'src/latch.generated/integration.ts');
  const manifestPath = path.join(r, '.latch/manifest.json');
  const before = [mainPath, integrationPath, manifestPath].map((p) => fs.readFileSync(p, 'utf8'));
  const tsconfigPath = path.join(r, 'tsconfig.json');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath));
  tsconfig.compilerOptions.noCheck = true;
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig));
  for (const operation of [check, apply]) await assert.rejects(() => operation(r), /noCheck/);
  assert.deepEqual([mainPath, integrationPath, manifestPath].map((p) => fs.readFileSync(p, 'utf8')), before);
});

test('noCheck false still rejects an incompatible handler', async () => {
  const r = fixture();
  const configPath = path.join(r, 'latch.config.json');
  const config = JSON.parse(fs.readFileSync(configPath));
  const validResult = config.tools[0].resultSchema.properties.query;
  config.tools[0].resultSchema.properties.query = { type: 'number' };
  fs.writeFileSync(configPath, JSON.stringify(config));
  const tsconfigPath = path.join(r, 'tsconfig.json');
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath));
  tsconfig.compilerOptions.noCheck = false;
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig));
  await assert.rejects(() => generate(r), /not assignable/);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
  config.tools[0].resultSchema.properties.query = validResult;
  fs.writeFileSync(configPath, JSON.stringify(config));
  await assert.doesNotReject(() => generate(r));
  assert.equal((await check(r)).generatedTypes, 'compiled');
});

test('reports the bundled compiler and warns about a different project compiler without loading it', async () => {
  const r = fixture();
  const packageDir = path.join(r, 'workspace-typescript');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'typescript', version: '6.0.2', main: 'index.js' }));
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'throw new Error("project compiler must not be loaded");');
  fs.mkdirSync(path.join(r, 'node_modules'), { recursive: true });
  fs.symlinkSync(packageDir, path.join(r, 'node_modules/typescript'), 'junction');
  const warnings = [];
  const previous = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const generated = await generate(r);
    const checked = await check(r);
    assert.equal(generated.typescriptCompiler, '5.9.3');
    assert.equal(checked.typescriptCompiler, '5.9.3');
    assert.equal(generated.compilerWarning, warnings[0]);
    assert.equal(checked.compilerWarning, warnings[1]);
  } finally { console.warn = previous; }
  assert.equal(warnings.length, 2);
  for (const warning of warnings) assert.match(warning, /TypeScript 5\.9\.3.*TypeScript 6\.0\.2/);
});

test('validates a TypeScript 7 project with real native TypeScript 7 diagnostics', async () => {
  const r = fixture();
  const packageDir = path.join(r, 'node_modules/typescript');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'typescript', version: '7.0.2', main: 'index.js' }));
  fs.writeFileSync(path.join(packageDir, 'index.js'), 'throw new Error("project compiler must not be loaded");');
  const source = path.join(r, 'src/ts7-unicode.ts');
  fs.writeFileSync(source, 'type Head<S extends string> = S extends `${infer H}${infer T}` ? H : never; export const x: Head<"\\u{1F600}abc"> = "\\uD83D";');
  await assert.rejects(() => generate(r), /not assignable/);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
  fs.writeFileSync(source, 'export const x = "valid";');
  const generated = await generate(r);
  const checked = await check(r);
  assert.equal(generated.typescriptCompiler, '7.0.2');
  assert.equal(checked.typescriptCompiler, '7.0.2');
  assert.equal(generated.compilerWarning, undefined);
  assert.equal(checked.compilerWarning, undefined);
});

test('finds the matching compiler in an ancestor workspace', async () => {
  const r = fixture();
  const warnings = [];
  const previous = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const generated = await generate(r);
    assert.equal(generated.typescriptCompiler, '7.0.2');
    assert.equal(generated.compilerWarning, undefined);
  }
  finally { console.warn = previous; }
  assert.deepEqual(warnings, []);
});

test('warns when project compiler metadata cannot be identified', async () => {
  const r = fixture();
  const packageDir = path.join(r, 'node_modules/typescript');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: 'typescript' }));
  const warnings = [];
  const previous = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const generated = await generate(r);
    assert.equal(generated.typescriptCompiler, '5.9.3');
    assert.equal(generated.compilerWarning, warnings[0]);
  }
  finally { console.warn = previous; }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /TypeScript 5\.9\.3.*could not be determined/);
});

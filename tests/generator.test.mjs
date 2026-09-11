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
test('generation is idempotent; apply and rollback preserve original source', () => {
  const r = fixture();
  const before = fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8');
  generate(r);
  const first = fs.readFileSync(path.join(r, 'src/latch.generated/integration.ts'), 'utf8');
  generate(r);
  assert.equal(fs.readFileSync(path.join(r, 'src/latch.generated/integration.ts'), 'utf8'), first);
  apply(r);
  assert.equal(check(r).installation, 'applied');
  apply(r);
  rollback(r);
  assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
});
test('edited generated code prevents generation and rollback', () => {
  const r = fixture();
  generate(r);
  fs.appendFileSync(path.join(r, 'src/latch.generated/integration.ts'), '// handwritten');
  assert.throws(() => generate(r), /edited/);
  assert.throws(() => rollback(r), /changed/);
});
test('later component edits are preserved during rollback refusal', () => {
  const r = fixture();
  generate(r);
  apply(r);
  fs.appendFileSync(path.join(r, 'src/main.tsx'), '\n// user change');
  assert.throws(() => rollback(r), /later edits/);
  assert.match(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), /user change/);
});
test('invalid exported mapping fails without fake success generation', () => {
  const r = fixture();
  const p = path.join(r, 'latch.config.json');
  const c = JSON.parse(fs.readFileSync(p));
  c.tools[0].binding.export = 'missingHandler';
  fs.writeFileSync(p, JSON.stringify(c));
  assert.throws(() => generate(r), /not found/);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
});
test('type-incompatible mapping does not write a broken integration', () => {
  const r = fixture();
  const p = path.join(r, 'latch.config.json');
  const c = JSON.parse(fs.readFileSync(p));
  c.tools[0].resultSchema.properties.query = { type: 'number' };
  fs.writeFileSync(p, JSON.stringify(c));
  assert.throws(() => generate(r), /not assignable/);
  assert.equal(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')), false);
});
test('inspection excludes secrets, huge files, dependencies and traversal', () => {
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
test('symlink or junction escape is refused', () => {
  const r = fixture();
  const dest = path.resolve('packages');
  fs.symlinkSync(dest, path.join(r, 'linked'), 'junction');
  assert.throws(() => safe(r, 'linked/runtime/package.json'), /links|junctions/);
  assert.ok(!inspect(r).some((e) => e.file.startsWith('linked/')));
});

test('crafted installation metadata cannot alter local Git configuration', () => {
  const r = fixture();
  generate(r);
  fs.mkdirSync(path.join(r, '.git'));
  const target = path.join(r, '.git/config');
  const original = '[core]\n  repositoryformatversion = 0\n';
  fs.writeFileSync(target, original);
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  record.installation = { file: '.git/config', before: 'replacement', after: original };
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  for (const command of [generate, check, apply, rollback]) {
    assert.throws(() => command(r), /application TypeScript/);
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.ok(fs.existsSync(path.join(r, 'src/latch.generated/integration.ts')));
  }
});

test('forged ownership keys and restoration bodies fail before any deletion', () => {
  const r = fixture();
  generate(r);
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  const target = 'src/main.tsx';
  const original = fs.readFileSync(path.join(r, target), 'utf8');
  record.files[target] = {
    before: null,
    after: createHash('sha256').update(original).digest('hex'),
  };
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  assert.throws(() => rollback(r), /ownership manifest/);
  assert.equal(fs.readFileSync(path.join(r, target), 'utf8'), original);
  delete record.files[target];
  record.files['src/latch.generated/integration.ts'].before = 'replacement';
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  assert.throws(() => rollback(r), /ownership entry/);
  assert.ok(fs.existsSync(path.join(r, 'src/latch.generated/env.d.ts')));
});

test('unreviewed installation source is rejected by check, apply and rollback', () => {
  const r = fixture();
  generate(r);
  const original = fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8');
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  record.installation.after += '\nconsole.log("unreviewed");';
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  for (const command of [check, apply, rollback]) {
    assert.throws(() => command(r), /installation transition/);
    assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), original);
  }
});

test('a syntactically valid stored hook must match the configured installation plan', () => {
  const r = fixture();
  generate(r);
  const ledgerPath = path.join(r, '.latch/manifest.json');
  const record = JSON.parse(fs.readFileSync(ledgerPath));
  record.installation.after = record.installation.after.replace(
    'useProjectTools({});',
    'useProjectTools({"extra": searchDocs});',
  );
  fs.writeFileSync(ledgerPath, JSON.stringify(record));
  assert.throws(() => check(r), /plan changed/);
  assert.throws(() => apply(r), /plan changed/);
  assert.equal(fs.readFileSync(path.join(r, 'src/main.tsx'), 'utf8'), record.installation.before);
});

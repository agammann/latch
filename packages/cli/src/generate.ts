import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { bindingCompiler, compilerSnapshot, projectVersion } from './compiler.js';
import { compileNative7 } from './ts7.js';
import { verifyObservations } from './fs-observations.js';
import { loadConfig, schemaType, type Config } from './config.js';
import { hash, installationSource, json, read, safe, write } from './files.js';
import { VERSION } from './version.js';
const dir = 'src/latch.generated';
const marker = '// @latch:mount';
const pending = new Map<string, { tail: Promise<void>; count: number }>();

// Serialize mutations and validations within this process. The snapshots below
// also detect edits made by other processes while validation awaits.
async function withProjectLock<T>(root: string, action: () => Promise<T> | T): Promise<T> {
  const resolved = fs.realpathSync(root);
  const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const previous = pending.get(key);
  if ((previous?.count ?? 0) >= 4) throw Error('Project validation is busy; try again');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous ? previous.tail.then(() => gate) : gate;
  const entry = { tail, count: (previous?.count ?? 0) + 1 };
  pending.set(key, entry);
  if (previous) await previous.tail;
  try { return await action(); }
  finally {
    release();
    const current = pending.get(key);
    if (current === entry) pending.delete(key);
    else if (current) current.count--;
  }
}

// These are all files this operation will read as control data or overwrite.
// In particular, a new file appearing during validation must not be replaced.
function inputSnapshot(root: string, c: Config) {
  const files = new Set([
    'latch.config.json', 'tsconfig.json', c.installation.file,
    ...c.tools.map(tool => tool.binding.module),
    `${dir}/integration.ts`, `${dir}/env.d.ts`,
    '.latch/manifest.json', '.latch/installation.diff', '.latch/tests.json', '.latch/INSTALL.md',
  ]);
  return JSON.stringify([compilerSnapshot(root), ...[...files].sort().map(file => {
    const full = safe(root, file);
    if (!fs.existsSync(full)) return [file, null];
    const stat = fs.statSync(full, { bigint: true });
    return [file, stat.dev.toString(), stat.ino.toString(), stat.size.toString(),
      stat.mtimeNs.toString(), stat.ctimeNs.toString(), hash(read(root, file))];
  })]);
}
type Entry = { before: string | null; after: string };
interface Ledger {
  version: 1;
  generatorVersion: string;
  files: Record<string, Entry>;
  installation?: { file: string; before: string; after: string };
}
export function ledger(root: string): Ledger {
  if (!fs.existsSync(safe(root, '.latch/manifest.json')))
    return { version: 1, generatorVersion: VERSION, files: {} };
  const value = json(root, '.latch/manifest.json');
  const object = (v: any, allowed: string[]) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).every((key) => allowed.includes(key));
  const owned = [`${dir}/integration.ts`, `${dir}/env.d.ts`];
  if (
    !object(value, ['version', 'generatorVersion', 'files', 'installation']) ||
    value.version !== 1 ||
    typeof value.generatorVersion !== 'string' ||
    !/^(?:0\.1\.0|1\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$/.test(value.generatorVersion) ||
    !object(value.files, owned) ||
    Object.keys(value.files).length !== owned.length
  )
    throw Error('Invalid ownership manifest; preserve it and reconcile the integration manually');
  for (const entry of Object.values(value.files) as any[])
    if (
      !object(entry, ['before', 'after']) ||
      entry.before !== null ||
      typeof entry.after !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.after)
    )
      throw Error('Invalid generated ownership entry');
  const p = value.installation;
  if (
    !object(p, ['file', 'before', 'after']) ||
    typeof p.before !== 'string' ||
    typeof p.after !== 'string'
  )
    throw Error('Invalid installation manifest');
  installationSource(root, p.file);
  // A stored transition may only add our exact import and simple callback bindings.
  // It must not authorize arbitrary restoration text or code hidden outside the reviewed diff.
  const at = p.before.indexOf(marker);
  if (at < 0 || p.before.indexOf(marker, at + marker.length) !== -1)
    throw Error('Invalid installation transition');
  const prefix =
    `import { useProjectTools } from ${JSON.stringify(specifier(path.posix.dirname(p.file), `${dir}/integration.ts`))};\n` +
    p.before.slice(0, at);
  const suffix = p.before.slice(at);
  if (!p.after.startsWith(prefix) || !p.after.endsWith(suffix))
    throw Error('Invalid installation transition');
  const inserted = p.after.slice(prefix.length, p.after.length - suffix.length);
  const parsed = ts.createSourceFile('installation.ts', inserted, ts.ScriptTarget.Latest, true);
  const statement = parsed.statements[0];
  const call = statement && ts.isExpressionStatement(statement) ? statement.expression : undefined;
  if (
    parsed.statements.length !== 1 ||
    !call ||
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== 'useProjectTools' ||
    call.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(call.arguments[0])
  )
    throw Error('Invalid installation transition');
  const refs: string[] = [];
  for (const property of call.arguments[0].properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.name) ||
      !ts.isIdentifier(property.initializer)
    )
      throw Error('Invalid installation binding');
    refs.push(`${JSON.stringify(property.name.text)}: ${property.initializer.text}`);
  }
  if (inserted !== `useProjectTools({${refs.join(', ')}}); `)
    throw Error('Invalid installation transition');
  return value;
}
function specifier(from: string, to: string) {
  let relative = path.posix.relative(from, to).replace(/\.(tsx?|jsx?)$/, '');
  return relative.startsWith('.') ? relative : './' + relative;
}
export function render(root: string, c: Config) {
  let imports = `// Generated by Latch ${VERSION}. Edit latch.config.json and application handlers, then regenerate.\nimport { useLatch, type ScopeObserver } from '@latch-local/react';\nimport type { Handler, Contract } from '@latch-local/contracts';\n`;
  const bindings: string[] = [];
  const types: string[] = [];
  const mount: string[] = [];
  c.tools.forEach((t, i) => {
    const { binding, ...contract } = t;
    types.push(
      `export type Input${i} = ${schemaType(t.inputSchema)};\nexport type Result${i} = ${schemaType(t.resultSchema)};`,
    );
    if (binding.kind === 'export')
      imports += `import { ${binding.export} as handler${i} } from ${JSON.stringify(specifier(dir, binding.module))};\n`;
    bindings.push(
      `{contract: contracts[${i}], handler: ${binding.kind === 'export' ? `handler${i}` : `handlers[${JSON.stringify(t.name)}]`}}`,
    );
    if (binding.kind === 'react') mount.push(`${JSON.stringify(t.name)}: ${binding.reference}`);
  });
  const reactTypes = c.tools
    .flatMap((t, i) =>
      t.binding.kind === 'react'
        ? [`${JSON.stringify(t.name)}: Handler<Input${i}, Result${i}>`]
        : [],
    )
    .join(';\n');
  const source =
    imports +
    types.join('\n') +
    `\nexport interface ReactHandlers {${reactTypes}}\nexport const contracts: Contract[] = ${JSON.stringify(
      c.tools.map(({ binding, ...t }) => t),
      null,
      2,
    )};\n` +
    `let devObserver: ScopeObserver | undefined;\nif (import.meta.env.DEV) {\n  const { attachBridge } = await import('@latch-local/test/bridge');\n  devObserver = scope => location.origin === ${JSON.stringify(new URL(c.baseUrl).origin)} ? attachBridge(scope, ${JSON.stringify([new URL(c.baseUrl).origin])}) : undefined;\n}\n` +
    `export function useProjectTools(handlers: ReactHandlers) {\n  useLatch([${bindings.join(',\n')}], { scopeKey: ${JSON.stringify(c.tools.map((t) => t.scope.route + ':' + t.scope.component).join('|'))}, onScope: devObserver });\n}\n`;
  const declarations = c.tools
    .map((t, i) =>
      t.binding.kind === 'export'
        ? `const verify${i}: Handler<Input${i}, Result${i}> = handler${i};\nvoid verify${i};`
        : '',
    )
    .join('\n');
  return {
    [`${dir}/integration.ts`]: source + declarations,
    [`${dir}/env.d.ts`]: '/// <reference types="vite/client" />\n',
    ...{},
  };
}
function installPlan(root: string, c: Config, old: Ledger) {
  const file = c.installation.file;
  const actual = read(root, file);
  if (old.installation) {
    if (old.installation.file !== file) throw Error('Rollback before changing installation target');
    if (actual !== old.installation.before && actual !== old.installation.after)
      throw Error(
        'Installation file changed; rollback would overwrite edits. Reconcile it manually first.',
      );
  }
  const before = old.installation?.before ?? actual;
  const count = before.split(marker).length - 1;
  if (count !== 1)
    throw Error(
      `${file}: add exactly one ${marker} inside the owning React component after the existing handlers`,
    );
  const refs = c.tools
    .filter((t) => t.binding.kind === 'react')
    .map((t) => `${JSON.stringify(t.name)}: ${t.binding.reference}`)
    .join(', ');
  const importPath = specifier(path.posix.dirname(file), `${dir}/integration.ts`);
  const after =
    `import { useProjectTools } from ${JSON.stringify(importPath)};\n` +
    before.replace(marker, `useProjectTools({${refs}}); ${marker}`);
  return { file, before, after };
}
export function compile(root: string, overlay: Record<string, string> = {}) {
  const project = projectVersion(root);
  const compilerVersion = project === '7.0.2' ? '7.0.2' : ts.version;
  const compilerWarning = !project
    ? `Latch validates with TypeScript ${compilerVersion}; the application's TypeScript version could not be determined. Run the application's own type check as well.`
    : project !== compilerVersion
      ? `Latch validates with TypeScript ${compilerVersion}, but the application resolves TypeScript ${project}. Run the application's own type check as well.`
      : undefined;
  if (compilerWarning) console.warn(compilerWarning);
  if (project === '7.0.2') {
    return compileNative7(root, overlay).then(observations => ({ compilerVersion, compilerWarning, observations }));
  }
  const projectFile = safe(root, 'tsconfig.json');
  if (!fs.existsSync(projectFile))
    throw Error('tsconfig.json required for generated type validation');
  const parsedFile = ts.readConfigFile(projectFile, ts.sys.readFile);
  if (parsedFile.error) throw Error('Cannot read tsconfig.json');
  const config = ts.parseJsonConfigFileContent(
    parsedFile.config,
    ts.sys,
    root,
    { noEmit: true },
    projectFile,
  );
  if (config.errors.length)
    throw Error(ts.flattenDiagnosticMessageText(config.errors[0].messageText, '\n'));
  if (config.options.noCheck)
    throw Error('tsconfig.json: noCheck disables semantic validation; remove it or set it to false');
  const host = ts.createCompilerHost(config.options);
  const originals = {
    read: host.readFile,
    exists: host.fileExists,
    directory: host.directoryExists,
  };
  const virtual = new Map(
    Object.entries(overlay).map(([p, v]) => [path.normalize(safe(root, p)), v]),
  );
  host.readFile = (p) => virtual.get(path.normalize(p)) ?? originals.read(p);
  host.fileExists = (p) => virtual.has(path.normalize(p)) || originals.exists(p);
  host.directoryExists = (p) =>
    [...virtual.keys()].some((file) => file.startsWith(path.normalize(p) + path.sep)) ||
    !!originals.directory?.(p);
  const program = ts.createProgram(
    [...new Set([...config.fileNames, ...virtual.keys()].filter((f) => /\.(tsx?|d\.ts)$/.test(f)))],
    config.options,
    host,
  );
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length)
    throw Error(
      errors
        .slice(0, 12)
        .map((d) => {
          const loc =
            d.file && d.start !== undefined
              ? `${path.relative(root, d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}: `
              : '';
          return loc + ts.flattenDiagnosticMessageText(d.messageText, '\n');
        })
        .join('\n'),
    );
  return { compilerVersion, compilerWarning, observations: undefined };
}
export function checkBindings(root: string, c: Config) {
  const ts = bindingCompiler(projectVersion(root));
  for (const tool of c.tools) {
    const src = ts.createSourceFile(
      tool.binding.module,
      read(root, tool.binding.module),
      ts.ScriptTarget.Latest,
      true,
    );
    if (tool.binding.kind === 'export') {
      const found = src.statements.some(
        (s) =>
          ts.canHaveModifiers(s) &&
          ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
          ((ts.isFunctionDeclaration(s) && s.name?.text === tool.binding.export) ||
            (ts.isVariableStatement(s) &&
              s.declarationList.declarations.some(
                (d) =>
                  ts.isIdentifier(d.name) &&
                  d.name.text === tool.binding.export &&
                  d.initializer &&
                  (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)),
              ))),
      );
      if (!found)
        throw Error(
          `${tool.name}: exported function ${tool.binding.export} not found in ${tool.binding.module}`,
        );
    } else {
      let found = false;
      const visit = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n.text === tool.binding.reference) found = true;
        ts.forEachChild(n, visit);
      };
      visit(src);
      if (!found)
        throw Error(`${tool.name}: React handler reference not found; pass a real callback`);
      if (tool.binding.module !== c.installation.file)
        throw Error('React mappings must refer to the installation component source');
    }
  }
}
async function generateUnlocked(root: string) {
  const c = loadConfig(root);
  checkBindings(root, c);
  const previous = ledger(root);
  const files = render(root, c);
  const installation = installPlan(root, c, previous);
  if (
    previous.installation &&
    read(root, installation.file) === previous.installation.after &&
    previous.installation.after !== installation.after
  )
    throw Error('Rollback before changing installed React bindings');
  // Preflight every owned file before any mutation.
  for (const [file, entry] of Object.entries(previous.files)) {
    if (!fs.existsSync(safe(root, file)) || hash(read(root, file)) !== entry.after)
      throw Error(`${file}: generated file edited or removed; reconcile before generating`);
  }
  for (const file of Object.keys(files)) {
    if (fs.existsSync(safe(root, file)) && !previous.files[file])
      throw Error(`${file}: unowned file exists; move it or choose another project`);
  }
  const beforeValidation = inputSnapshot(root, c);
  // Compile a virtual installation first, so incompatible mappings cannot replace working wrappers.
  const operation = compile(root, { ...files, [installation.file]: installation.after });
  const { compilerVersion, compilerWarning, observations } = operation instanceof Promise ? await operation : operation;
  if (compilerVersion === '7.0.2') verifyObservations(observations);
  if (inputSnapshot(root, c) !== beforeValidation)
    throw Error('Project changed during validation; no generated files were written');
  for (const [file, content] of Object.entries(files)) write(root, file, content);
  const next: Ledger = { version: 1, generatorVersion: VERSION, files: {}, installation };
  for (const [file, content] of Object.entries(files))
    next.files[file] = { before: previous.files[file]?.before ?? null, after: hash(content) };
  // Persist ownership only for a type-checked integration.
  write(root, '.latch/manifest.json', JSON.stringify(next, null, 2) + '\n');
  const beforeLines = installation.before.trimEnd().split('\n'),
    afterLines = installation.after.trimEnd().split('\n');
  write(
    root,
    '.latch/installation.diff',
    `--- a/${installation.file}\n+++ b/${installation.file}\n@@ -1,${beforeLines.length} +1,${afterLines.length} @@\n` +
      beforeLines.map((l) => '-' + l).join('\n') +
      '\n' +
      afterLines.map((l) => '+' + l).join('\n') +
      '\n',
  );
  write(root, '.latch/tests.json', JSON.stringify(c.tests, null, 2) + '\n');
  write(
    root,
    '.latch/INSTALL.md',
    'Review src/latch.generated/integration.ts and installation.diff. Run latch check, then latch apply. DEV builds load a local Handler test bridge; production builds remove it. Run latch rollback before removing packages.\n',
  );
  return {
    files: Object.keys(files),
    installation: installation.file,
    status: 'Generated and type-checked; run latch apply',
    typescriptCompiler: compilerVersion,
    ...(compilerWarning ? { compilerWarning } : {}),
  };
}
export function generate(root: string) { return withProjectLock(root, () => generateUnlocked(root)); }

async function checkUnlocked<T = undefined>(root: string, onValidated?: () => T) {
  const c = loadConfig(root);
  checkBindings(root, c);
  const l = ledger(root);
  const expected = render(root, c);
  for (const [file, content] of Object.entries(expected)) {
    if (
      !fs.existsSync(safe(root, file)) ||
      read(root, file) !== content ||
      l.files[file]?.after !== hash(content)
    )
      throw Error(`${file}: missing, stale or edited; run latch generate`);
  }
  const p = installPlan(root, c, l);
  if (!l.installation || l.installation.after !== p.after)
    throw Error('Installation plan changed; run latch generate');
  const beforeValidation = inputSnapshot(root, c);
  const operation = compile(root, { [p.file]: p.after });
  const { compilerVersion, compilerWarning, observations } = operation instanceof Promise ? await operation : operation;
  if (compilerVersion === '7.0.2') verifyObservations(observations);
  if (inputSnapshot(root, c) !== beforeValidation)
    throw Error('Project changed during validation; run latch check again');
  const result = {
    contract: 'validated',
    bindings: 'validated',
    generatedTypes: 'compiled',
    typescriptCompiler: compilerVersion,
    ...(compilerWarning ? { compilerWarning } : {}),
    installation: read(root, p.file) === p.after ? 'applied' : 'pending',
    nativeRegistration: 'not run',
    nativeInvocation: 'not run',
  };
  return { result, value: onValidated?.() };
}
export function check(root: string) { return withProjectLock(root, async () => (await checkUnlocked(root)).result); }
// Capture related state in the same turn as the final validation recheck so
// service callers cannot pair validated results with a later project version.
export function checkAndCapture<T>(root: string, capture: () => T) {
  return withProjectLock(root, () => checkUnlocked(root, capture));
}

async function applyUnlocked(root: string) {
  const beforeCheck = inputSnapshot(root, loadConfig(root));
  const { value } = await checkUnlocked(root, () => {
    if (inputSnapshot(root, loadConfig(root)) !== beforeCheck)
      throw Error('Project changed during validation; installation was not applied');
    const l = ledger(root);
    if (!l.installation) throw Error('Run latch generate first');
    const p = installPlan(root, loadConfig(root), l);
    if (p.after !== l.installation.after)
      throw Error('Installation plan changed; run latch generate');
    const actual = read(root, p.file);
    if (actual === p.after) return 'Already applied';
    if (actual !== p.before) throw Error('Installation conflict: file changed');
    write(root, p.file, p.after);
    return `Applied ${p.file}`;
  });
  return value;
}
export function apply(root: string) { return withProjectLock(root, () => applyUnlocked(root)); }

function rollbackUnlocked(root: string) {
  const l = ledger(root);
  for (const [file, e] of Object.entries(l.files))
    if (!fs.existsSync(safe(root, file)) || hash(read(root, file)) !== e.after)
      throw Error(`${file}: rollback refused because generated content changed`);
  if (l.installation) {
    const p = l.installation;
    const actual = read(root, p.file);
    if (actual !== p.before && actual !== p.after)
      throw Error(`${p.file}: rollback refused because later edits exist`);
  }
  if (l.installation) write(root, l.installation.file, l.installation.before);
  for (const [file, e] of Object.entries(l.files)) {
    if (e.before === null) fs.unlinkSync(safe(root, file));
    else write(root, file, e.before);
  }
  for (const file of ['manifest.json', 'installation.diff', 'tests.json', 'INSTALL.md'])
    if (fs.existsSync(safe(root, `.latch/${file}`))) fs.unlinkSync(safe(root, `.latch/${file}`));
  return 'Rolled back owned integration and installation changes; configuration and reports retained';
}
export function rollback(root: string) { return withProjectLock(root, () => rollbackUnlocked(root)); }

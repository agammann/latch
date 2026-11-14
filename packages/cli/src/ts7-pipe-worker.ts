import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import ts5 from 'typescript';
import { API, DiagnosticCategory, type Diagnostic } from 'typescript7/unstable/async';
import { safe } from './files.js';
import { digest, sample, type Observation, type ObservationKind } from './fs-observations.js';

type Input = { root: string; overlay: Record<string, string> };
type RpcConnection = {
  onRequest(name: string, callback: (value: string) => Promise<unknown>): void;
  listen(): void;
};
type Client = { connectViaSpawn: () => Promise<void>; connection: RpcConnection; connected: boolean };
const input = await new Promise<Input>((resolve, reject) => {
  process.once('message', value => resolve(value as Input));
  process.once('disconnect', () => reject(Error('Supervisor disconnected')));
});
const root = fs.realpathSync(input.root);
const projectFile = safe(root, 'tsconfig.json');
const canonical = (p: string) => {
  const absolute = path.normalize(path.resolve(p));
  return ts5.sys.useCaseSensitiveFileNames ? absolute : absolute.toLowerCase();
};
const virtualFiles = new Map<string, { path: string; content: string }>();
const virtualDirectories = new Map<string, { files: Set<string>; directories: Set<string> }>();
let denied: string | undefined;
let observationFailure: string | undefined;
const observations = new Map<string, Observation>();
let observationBytes = 0;
let observedContentBytes = 0;
let readPermits = 4;
const readWaiters: Array<() => void> = [];
async function limitedRead(file: string) {
  if (readPermits) readPermits--;
  else await new Promise<void>(resolve => readWaiters.push(resolve));
  try { return await readBounded(file); }
  finally {
    const next = readWaiters.shift();
    if (next) next(); else readPermits++;
  }
}
function observe(kind: ObservationKind, file: string, value: string) {
  const absolute = path.resolve(file);
  const key = `${kind}:${canonical(absolute)}`;
  const previous = observations.get(key);
  if (previous) {
    if (previous.value !== value) observationFailure ??= 'Project dependencies changed during validation; run Latch again';
    return;
  }
  observationBytes += Buffer.byteLength(absolute) + Buffer.byteLength(value);
  if (observations.size >= 100_000 || observationBytes > 32 * 1024 * 1024) {
    observationFailure ??= 'TypeScript filesystem observation limit exceeded';
    return;
  }
  observations.set(key, { kind, path: absolute, value });
}
function missing(e: unknown, file: string) {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (e instanceof Error && /changed during validation|(?:validation|observation) limit/.test(e.message))
    observationFailure ??= e.message;
  else if (code !== 'ENOENT' && code !== 'ENOTDIR') denied ??= `${file}: ${code ?? 'unreadable'}`;
}
function addVirtual(file: string, content: string) {
  const full = path.normalize(path.resolve(file));
  virtualFiles.set(canonical(full), { path: full, content });
  let child = full;
  while (canonical(child) !== canonical(root)) {
    const parent = path.dirname(child);
    if (parent === child) throw Error('Virtual path escapes project root');
    const key = canonical(parent);
    const entry = virtualDirectories.get(key) ?? { files: new Set<string>(), directories: new Set<string>() };
    (canonical(child) === canonical(full) ? entry.files : entry.directories).add(path.basename(child));
    virtualDirectories.set(key, entry);
    child = parent;
  }
}
for (const [file, content] of Object.entries(input.overlay)) {
  if (typeof content !== 'string') throw Error('Invalid virtual source');
  addVirtual(safe(root, file), content);
}
function checkDenied() {
  if (observationFailure) throw Error(observationFailure);
  if (denied) throw Error(`TypeScript validation could not read ${denied}`);
}
async function stat(file: string) {
  try { return await fs.promises.stat(file); } catch (e) { missing(e, file); return undefined; }
}
async function readBounded(file: string): Promise<Buffer> {
  const descriptor = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
  try {
    const before = await descriptor.stat({ bigint: true });
    if (!before.isFile() || before.size > 32n * 1024n * 1024n)
      throw Error('TypeScript source is not a regular file or exceeds the validation limit');
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await descriptor.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > 32 * 1024 * 1024) throw Error('TypeScript source exceeds the validation limit');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await descriptor.stat({ bigint: true });
    const current = await fs.promises.stat(file, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
        current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size ||
        current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs)
      throw Error('Project dependency changed during validation; run Latch again');
    return Buffer.concat(chunks, size);
  } finally { await descriptor.close(); }
}
// Concrete results for every callback prevent fallback to the native host FS.
const vfs = {
  async readFile(file: string): Promise<string | null> {
    const item = virtualFiles.get(canonical(file));
    if (item) return item.content;
    const info = await stat(file);
    const isFile = !!info?.isFile();
    observe('file', file, String(isFile));
    if (!isFile) return null;
    if ((info?.size ?? 0) > 32 * 1024 * 1024) {
      observationFailure ??= 'TypeScript source exceeds the validation limit';
      return null;
    }
    try {
      const bytes = await limitedRead(file);
      if (bytes.length > 32 * 1024 * 1024) throw Error('TypeScript source exceeds the validation limit');
      const contentKey = `content:${canonical(path.resolve(file))}`;
      if (!observations.has(contentKey)) observedContentBytes += bytes.length;
      if (observedContentBytes > 512 * 1024 * 1024) throw Error('TypeScript input revalidation limit exceeded');
      observe('content', file, digest(bytes));
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        const data = Buffer.from(bytes.subarray(2));
        if (data.length % 2) throw Error('Malformed UTF-16 source');
        return data.swap16().toString('utf16le');
      }
      return bytes.toString('utf8').replace(/^\uFEFF/, '');
    } catch (e) {
      if (['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException)?.code ?? ''))
        observe('file', file, 'false');
      missing(e, file);
      return null;
    }
  },
  async fileExists(file: string) {
    if (virtualFiles.has(canonical(file))) return true;
    const value = !!(await stat(file))?.isFile();
    observe('file', file, String(value));
    return value;
  },
  async directoryExists(dir: string) {
    if (virtualDirectories.has(canonical(dir))) return true;
    const value = !!(await stat(dir))?.isDirectory();
    observe('directory', dir, String(value));
    return value;
  },
  async getAccessibleEntries(dir: string) {
    const files = new Map<string, string>(), directories = new Map<string, string>();
    const add = (set: Map<string, string>, name: string) => {
      const key = ts5.sys.useCaseSensitiveFileNames ? name : name.toLowerCase();
      if (!set.has(key)) set.set(key, name);
    };
    let listing: string;
    try { listing = await sample('entries', dir); }
    catch (e) {
      missing(e, dir);
      listing = JSON.stringify({ exists: false, files: [], directories: [] });
    }
    observe('entries', dir, listing);
    const real = JSON.parse(listing) as { files: string[]; directories: string[] };
    for (const name of real.files) add(files, name);
    for (const name of real.directories) add(directories, name);
    const virtual = virtualDirectories.get(canonical(dir));
    for (const name of virtual?.files ?? []) add(files, name);
    for (const name of virtual?.directories ?? []) add(directories, name);
    return { files: [...files.values()], directories: [...directories.values()] };
  },
  async realpath(file: string) {
    if (virtualFiles.has(canonical(file)) || virtualDirectories.has(canonical(file))) return path.resolve(file);
    const value = await sample('realpath', file);
    observe('realpath', file, value);
    return value.slice(2);
  },
};
function errors(diagnostics: readonly Diagnostic[]) { return diagnostics.filter(d => d.category === DiagnosticCategory.Error); }
async function format(d: Diagnostic) {
  let location = '';
  if (d.fileName) {
    const source = await vfs.readFile(d.fileName);
    const line = typeof source === 'string' && d.pos >= 0 ? source.slice(0, d.pos).split('\n').length : 1;
    location = `${path.relative(root, d.fileName)}:${line}: `;
  }
  return location + d.text;
}
async function failDiagnostics(values: readonly Diagnostic[]) {
  const found = errors(values);
  if (found.length) throw Error((await Promise.all(found.slice(0, 12).map(format))).join('\n'));
}
async function run() {
  const require = createRequire(import.meta.url);
  const packageFile = require.resolve('typescript7/package.json');
  const info = JSON.parse(fs.readFileSync(packageFile, 'utf8')) as { version?: string };
  if (info.version !== '7.0.2') throw Error('Unsupported TypeScript 7 API version');
  const rpc = require(path.join(path.dirname(packageFile), 'vendor/vscode-jsonrpc/lib/node/main.js')) as {
    createMessageConnection: (reader: unknown, writer: unknown) => RpcConnection;
    StreamMessageReader: new (stream: NodeJS.ReadableStream) => unknown;
    StreamMessageWriter: new (stream: NodeJS.WritableStream) => unknown;
  };
  const api = new API({ cwd: root });
  const client = (api as unknown as { client: Client }).client;
  if (!client || typeof client.connectViaSpawn !== 'function') throw Error('Unsupported TypeScript 7 client');
  // Exact-version private adapter: the supervisor owns the compiler and bridges
  // its stdio. 7.0.2's default adapter does not await asynchronous readFile.
  client.connectViaSpawn = async function () {
    this.connection = rpc.createMessageConnection(new rpc.StreamMessageReader(process.stdin), new rpc.StreamMessageWriter(process.stdout));
    for (const name of Object.keys(vfs) as Array<keyof typeof vfs>) {
      this.connection.onRequest(name, async (file: string) => {
        const value = await vfs[name](file);
        return name === 'readFile' ? { content: value } : value;
      });
    }
    this.connection.listen();
    this.connected = true;
  };
  const initial = await api.updateSnapshot({ openProjects: [projectFile] });
  checkDenied();
  const actual = initial.getProject(projectFile);
  if (!actual) throw Error('Cannot open tsconfig.json for TypeScript validation');
  await failDiagnostics(await actual.program.getConfigFileParsingDiagnostics());
  // Do not hide actual-project emit-layout diagnostics by forcing noEmit in
  // the virtual overlay configuration.
  await failDiagnostics(await actual.program.getProgramDiagnostics());
  checkDenied();
  const parsed = await api.parseConfigFile(projectFile);
  checkDenied();
  if (parsed.options.noCheck) throw Error('tsconfig.json: noCheck disables semantic validation; remove it or set it to false');
  const roots = new Map<string, string>();
  for (const file of [...parsed.fileNames, ...[...virtualFiles.values()].map(v => v.path)]) {
    const key = canonical(file);
    if (!roots.has(key)) roots.set(key, path.normalize(file));
  }
  let generatedConfig = '';
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(root, `tsconfig.latch-${randomBytes(16).toString('hex')}.json`);
    if (virtualFiles.has(canonical(candidate))) continue;
    try { fs.lstatSync(candidate); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') { generatedConfig = candidate; break; }
      throw e;
    }
  }
  if (!generatedConfig) throw Error('Cannot allocate virtual TypeScript configuration');
  const rawConfig = ts5.readConfigFile(projectFile, ts5.sys.readFile);
  if (rawConfig.error) throw Error('Cannot read TypeScript project configuration');
  addVirtual(generatedConfig, JSON.stringify({
    extends: './tsconfig.json', files: [...roots.values()], include: [],
    ...(rawConfig.config.references === undefined ? {} : { references: rawConfig.config.references }),
    compilerOptions: { noEmit: true, disableSourceOfProjectReferenceRedirect: true },
  }));
  const snapshot = await api.updateSnapshot({ openProjects: [generatedConfig] });
  checkDenied();
  const project = snapshot.getProject(generatedConfig);
  if (!project) throw Error('Cannot open virtual TypeScript configuration');
  const program = project.program;
  const diagnostics = [
    ...await program.getConfigFileParsingDiagnostics(),
    ...await program.getProgramDiagnostics(),
    ...await program.getSyntacticDiagnostics(),
    ...await program.getGlobalDiagnostics(),
    ...await program.getSemanticDiagnostics(),
  ];
  const options = await program.getCompilerOptions();
  if (options.declaration || options.composite) diagnostics.push(...await program.getDeclarationDiagnostics());
  checkDenied();
  const unique = new Map<string, Diagnostic>();
  for (const d of errors(diagnostics)) unique.set(`${d.fileName}:${d.pos}:${d.code}:${d.text}`, d);
  await failDiagnostics([...unique.values()]);
  checkDenied();
}
try { await run(); process.send?.({ ok: true, observations: [...observations.values()] }); }
catch (e) { process.send?.({ ok: false, error: e instanceof Error ? e.message : 'TypeScript validation failed' }); }
await new Promise(() => {});

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import ts5 from 'typescript';
import { API, DiagnosticCategory, type Diagnostic } from 'typescript7/unstable/async';
import { safe } from './files.js';

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
const denied: string[] = [];
function missing(e: unknown, file: string) {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code !== 'ENOENT' && code !== 'ENOTDIR') denied.push(`${file}: ${code ?? 'unreadable'}`);
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
  if (denied.length) throw Error(`TypeScript validation could not read ${denied[0]}`);
}
async function stat(file: string) {
  try { return await fs.promises.stat(file); } catch (e) { missing(e, file); return undefined; }
}
// Concrete results for every callback prevent fallback to the native host FS.
const vfs = {
  async readFile(file: string): Promise<string | null> {
    const item = virtualFiles.get(canonical(file));
    if (item) return item.content;
    if (!(await stat(file))?.isFile()) return null;
    try {
      const bytes = await fs.promises.readFile(file);
      if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
      if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        const data = Buffer.from(bytes.subarray(2));
        if (data.length % 2) throw Error('Malformed UTF-16 source');
        return data.swap16().toString('utf16le');
      }
      return bytes.toString('utf8').replace(/^\uFEFF/, '');
    } catch (e) { missing(e, file); return null; }
  },
  async fileExists(file: string) { return virtualFiles.has(canonical(file)) || !!(await stat(file))?.isFile(); },
  async directoryExists(dir: string) { return virtualDirectories.has(canonical(dir)) || !!(await stat(dir))?.isDirectory(); },
  async getAccessibleEntries(dir: string) {
    const files = new Map<string, string>(), directories = new Map<string, string>();
    const add = (set: Map<string, string>, name: string) => {
      const key = ts5.sys.useCaseSensitiveFileNames ? name : name.toLowerCase();
      if (!set.has(key)) set.set(key, name);
    };
    try {
      for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
        if (entry.isFile()) add(files, entry.name);
        else if (entry.isDirectory()) add(directories, entry.name);
        else if (entry.isSymbolicLink()) {
          const info = await stat(path.join(dir, entry.name));
          if (info?.isFile()) add(files, entry.name);
          else if (info?.isDirectory()) add(directories, entry.name);
        }
      }
    } catch (e) { missing(e, dir); }
    const virtual = virtualDirectories.get(canonical(dir));
    for (const name of virtual?.files ?? []) add(files, name);
    for (const name of virtual?.directories ?? []) add(directories, name);
    return { files: [...files.values()], directories: [...directories.values()] };
  },
  async realpath(file: string) {
    if (virtualFiles.has(canonical(file)) || virtualDirectories.has(canonical(file))) return path.resolve(file);
    try { return await fs.promises.realpath(file); } catch (e) { missing(e, file); return path.resolve(file); }
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
try { await run(); process.send?.({ ok: true }); }
catch (e) { process.send?.({ ok: false, error: e instanceof Error ? e.message : 'TypeScript validation failed' }); }
await new Promise(() => {});

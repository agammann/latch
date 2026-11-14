import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts5 from 'typescript';
import ts6 from 'typescript6';

const absent = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException)?.code ?? '');

// Record the search path, links and candidate package metadata rather than
// relying only on Node's cached require.resolve result. A package can appear,
// disappear, be replaced, or have its junction retargeted during validation.
export function compilerSnapshot(root: string): string {
  const requireFromProject = createRequire(path.join(root, 'package.json'));
  const search = requireFromProject.resolve.paths('typescript/package.json') ?? [];
  let selected: string | undefined;
  try { selected = requireFromProject.resolve('typescript/package.json'); } catch { /* Unknown compiler is reported separately. */ }
  const entries: unknown[] = [];
  for (const base of search) {
    const candidate = path.join(base, 'typescript');
    let link: fs.BigIntStats;
    try { link = fs.lstatSync(candidate, { bigint: true }); }
    catch (error) { if (absent(error)) { entries.push([candidate, null]); continue; } throw error; }
    let real: string | undefined;
    try { real = fs.realpathSync(candidate); }
    catch (error) { if (!absent(error)) throw error; }
    let target: string | undefined;
    if (link.isSymbolicLink()) target = fs.readlinkSync(candidate);
    const metadata = path.join(candidate, 'package.json');
    let descriptor: number | undefined;
    let manifest: unknown = null;
    try {
      descriptor = fs.openSync(metadata, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
      const before = fs.fstatSync(descriptor, { bigint: true });
      if (!before.isFile() || before.size > 1024n * 1024n)
        throw Error('TypeScript package metadata exceeds the validation limit or is not a regular file');
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(64 * 1024);
      let size = 0;
      while (true) {
        const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (!count) break;
        size += count;
        if (size > 1024 * 1024) throw Error('TypeScript package metadata exceeds the validation limit');
        hash.update(buffer.subarray(0, count));
      }
      const after = fs.fstatSync(descriptor, { bigint: true });
      const current = fs.statSync(metadata, { bigint: true });
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
          current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size ||
          current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs)
        throw Error('TypeScript package metadata changed during validation');
      manifest = [before.dev.toString(), before.ino.toString(), before.size.toString(),
        before.mtimeNs.toString(), before.ctimeNs.toString(), hash.digest('hex')];
    } catch (error) { if (!absent(error)) throw error; }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
    entries.push([candidate, link.isSymbolicLink(), link.dev.toString(), link.ino.toString(),
      link.mtimeNs.toString(), link.ctimeNs.toString(), target, real, manifest]);
    if (selected && real && path.normalize(path.dirname(selected)) === path.normalize(real)) break;
  }
  return JSON.stringify({ selected, entries });
}

// Inspect project package metadata without importing or executing its compiler.
export function projectVersion(root: string): string | undefined {
  try {
    const packageFile = createRequire(path.join(root, 'package.json')).resolve('typescript/package.json');
    const manifest: unknown = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    if (manifest && typeof manifest === 'object' && 'name' in manifest && 'version' in manifest &&
        manifest.name === 'typescript' && typeof manifest.version === 'string' && manifest.version.length <= 80 &&
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) return manifest.version;
  } catch { /* Custom build commands may use a compiler the package resolver cannot identify. */ }
  return undefined;
}

// 7.0 has no stable AST API. Bindings use the pinned 6.0 parser; actual
// project and generated source diagnostics use the native 7.0.2 compiler.
export function bindingCompiler(version: string | undefined): typeof ts5 {
  return version === '7.0.2' ? (ts6 as unknown as typeof ts5) : ts5;
}

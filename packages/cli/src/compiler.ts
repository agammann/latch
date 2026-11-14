import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts5 from 'typescript';
import ts6 from 'typescript6';

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

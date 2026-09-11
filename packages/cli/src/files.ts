import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function safe(root: string, relative: string) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.split('/').some((p) => p === '..' || p === '' || p.includes(':'))
  )
    throw Error('Paths must be project-relative with forward slashes');
  const base = fs.realpathSync(root);
  const full = path.resolve(base, relative);
  const rel = path.relative(base, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Path escapes selected project');
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      if (fs.lstatSync(current).isSymbolicLink())
        throw Error('Symbolic links and junctions are not allowed');
      const resolved = fs.realpathSync(current);
      if (path.relative(base, resolved).startsWith('..'))
        throw Error('Resolved path escapes selected project');
    }
  }
  return full;
}
export function read(root: string, file: string) {
  const p = safe(root, file);
  if (fs.statSync(p).size > 1024 * 1024) throw Error(`${file}: exceeds 1 MiB limit`);
  return fs.readFileSync(p, 'utf8');
}
export function installationSource(root: string, file: unknown): string {
  if (
    typeof file !== 'string' ||
    !/\.(tsx|ts)$/.test(file) ||
    file
      .split('/')
      .some(
        (part) =>
          part.startsWith('.') ||
          /[~]|[. ]$/.test(part) ||
          ['node_modules', 'dist', 'build', 'work', 'artifacts', 'latch.generated'].includes(
            part.toLowerCase(),
          ),
      )
  )
    throw Error(
      'Installation must target application TypeScript, outside hidden or managed directories',
    );
  safe(root, file);
  return file;
}
export function write(root: string, file: string, content: string) {
  const p = safe(root, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const temp = p + '.latch-tmp';
  if (fs.existsSync(temp)) throw Error(`${file}: temporary file conflict`);
  try {
    fs.writeFileSync(temp, content, { flag: 'wx' });
    fs.renameSync(temp, p);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export function json(root: string, file: string) {
  return JSON.parse(read(root, file));
}
const ignored = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.latch',
  '.next',
  '.cache',
  'work',
  'artifacts',
  'latch.generated',
]);
export function sources(root: string) {
  const out: string[] = [];
  let count = 0;
  function visit(dir: string) {
    for (const entry of fs
      .readdirSync(dir ? safe(root, dir) : root, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (++count > 20000) throw Error('Inspection limit exceeded (20,000 entries)');
      if (
        entry.isSymbolicLink() ||
        entry.name.startsWith('.') ||
        ignored.has(entry.name) ||
        /secret|credential|token|password|\.pem$|\.key$/i.test(entry.name)
      )
        continue;
      const file = dir ? `${dir}/${entry.name}` : entry.name;
      const full = safe(root, file);
      if (entry.isDirectory()) visit(file);
      else if (/\.(tsx?|jsx?)$/.test(file) && fs.statSync(full).size <= 256 * 1024) out.push(file);
    }
  }
  visit('');
  return out;
}

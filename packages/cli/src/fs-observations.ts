import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type ObservationKind = 'file' | 'directory' | 'entries' | 'realpath' | 'content';
export type Observation = { kind: ObservationKind; path: string; value: string };
const notFound = (e: unknown) => ['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException)?.code ?? '');
export const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

// Produce only metadata or a content hash, never source text. ENOENT and
// ENOTDIR are valid observations; all other failures abort validation.
export async function sample(kind: ObservationKind, file: string): Promise<string> {
  if (kind === 'file' || kind === 'directory') {
    try {
      const info = await fs.promises.stat(file);
      return String(kind === 'file' ? info.isFile() : info.isDirectory());
    } catch (e) { if (notFound(e)) return 'false'; throw e; }
  }
  if (kind === 'realpath') {
    try { return '1:' + await fs.promises.realpath(file); }
    catch (e) { if (notFound(e)) return '0:' + path.resolve(file); throw e; }
  }
  if (kind === 'content') {
    try { return digest(await fs.promises.readFile(file)); }
    catch (e) { if (notFound(e)) return 'missing'; throw e; }
  }
  try {
    const files: string[] = [], directories: string[] = [];
    const directory = await fs.promises.opendir(file);
    let count = 0, bytes = 0;
    try {
      while (true) {
        const entry = await directory.read();
        if (!entry) break;
        count++; bytes += Buffer.byteLength(entry.name);
        if (count > 20_000 || bytes > 1024 * 1024) throw Error('TypeScript directory observation limit exceeded');
        if (entry.isFile()) files.push(entry.name);
        else if (entry.isDirectory()) directories.push(entry.name);
        else if (entry.isSymbolicLink()) {
          try {
            const info = await fs.promises.stat(path.join(file, entry.name));
            if (info.isFile()) files.push(entry.name);
            else if (info.isDirectory()) directories.push(entry.name);
          } catch (e) { if (!notFound(e)) throw e; }
        }
      }
    } finally { await directory.close(); }
    return JSON.stringify({ exists: true, files: files.sort(), directories: directories.sort() });
  } catch (e) {
    if (notFound(e)) return JSON.stringify({ exists: false, files: [], directories: [] });
    throw e;
  }
}

function sampleSync(kind: ObservationKind, file: string): { value: string; bytes: number } {
  if (kind === 'file' || kind === 'directory') {
    try {
      const info = fs.statSync(file);
      return { value: String(kind === 'file' ? info.isFile() : info.isDirectory()), bytes: 0 };
    } catch (e) { if (notFound(e)) return { value: 'false', bytes: 0 }; throw e; }
  }
  if (kind === 'realpath') {
    try { return { value: '1:' + fs.realpathSync(file), bytes: 0 }; }
    catch (e) { if (notFound(e)) return { value: '0:' + path.resolve(file), bytes: 0 }; throw e; }
  }
  if (kind === 'content') {
    let descriptor: number;
    try { descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0)); }
    catch (e) { if (notFound(e)) return { value: 'missing', bytes: 0 }; throw e; }
    try {
      const before = fs.fstatSync(descriptor, { bigint: true });
      if (!before.isFile() || before.size > 32n * 1024n * 1024n)
        throw Error('TypeScript source is not a regular file or exceeds the validation limit');
      const digestState = createHash('sha256');
      const buffer = Buffer.alloc(64 * 1024);
      let size = 0;
      while (true) {
        const count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (!count) break;
        size += count;
        if (size > 32 * 1024 * 1024) throw Error('TypeScript source exceeds the validation limit');
        digestState.update(buffer.subarray(0, count));
      }
      const after = fs.fstatSync(descriptor, { bigint: true });
      const current = fs.statSync(file, { bigint: true });
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
          current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size ||
          current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs)
        throw Error('Project dependency changed during validation; run Latch again');
      return { value: digestState.digest('hex'), bytes: size };
    } finally { fs.closeSync(descriptor); }
  }
  try {
    const files: string[] = [], directories: string[] = [];
    const directory = fs.opendirSync(file);
    let count = 0, bytes = 0;
    try {
      while (true) {
        const entry = directory.readSync();
        if (!entry) break;
        count++; bytes += Buffer.byteLength(entry.name);
        if (count > 20_000 || bytes > 1024 * 1024) throw Error('TypeScript directory observation limit exceeded');
        if (entry.isFile()) files.push(entry.name);
        else if (entry.isDirectory()) directories.push(entry.name);
        else if (entry.isSymbolicLink()) {
          try {
            const info = fs.statSync(path.join(file, entry.name));
            if (info.isFile()) files.push(entry.name);
            else if (info.isDirectory()) directories.push(entry.name);
          } catch (e) { if (!notFound(e)) throw e; }
        }
      }
    } finally { directory.closeSync(); }
    return { value: JSON.stringify({ exists: true, files: files.sort(), directories: directories.sort() }), bytes: 0 };
  } catch (e) {
    if (notFound(e)) return { value: JSON.stringify({ exists: false, files: [], directories: [] }), bytes: 0 };
    throw e;
  }
}

// This pass is intentionally synchronous so its caller can write immediately
// afterward without yielding to other operations in the same process.
export function verifyObservations(observations: unknown): void {
  if (!Array.isArray(observations) || observations.length > 100_000)
    throw Error('Invalid TypeScript filesystem observations');
  let size = 0, totalBytes = 0;
  const deadline = process.hrtime.bigint() + 30n * 1_000_000_000n;
  for (const value of observations) {
    if (!value || typeof value !== 'object' ||
        !['file', 'directory', 'entries', 'realpath', 'content'].includes(value.kind) ||
        typeof value.path !== 'string' || !path.isAbsolute(value.path) || typeof value.value !== 'string')
      throw Error('Invalid TypeScript filesystem observation');
    size += Buffer.byteLength(value.path) + Buffer.byteLength(value.value);
    if (size > 32 * 1024 * 1024) throw Error('TypeScript filesystem observation limit exceeded');
  }
  for (const observation of observations as Observation[]) {
    if (process.hrtime.bigint() > deadline) throw Error('TypeScript input revalidation timed out');
    const actual = sampleSync(observation.kind, observation.path);
    totalBytes += actual.bytes;
    if (totalBytes > 512 * 1024 * 1024) throw Error('TypeScript input revalidation limit exceeded');
    if (actual.value !== observation.value)
      throw Error('Project dependencies changed during validation; run Latch again');
  }
}

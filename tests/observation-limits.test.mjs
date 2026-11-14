import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sample, verifyObservations } from '../packages/cli/dist/fs-observations.js';
import { compileNative7 } from '../packages/cli/dist/ts7.js';

test('too many observation records and oversized metadata fail closed before reads', () => {
  const file = path.resolve('synthetic.ts');
  const record = { kind: 'file', path: file, value: 'false' };
  assert.throws(() => verifyObservations(Array(100_001).fill(record)), /observations/);
  assert.throws(() => verifyObservations([{ ...record, value: 'x'.repeat(32 * 1024 * 1024) }]), /limit/);
});

test('directory observation is bounded before collecting all entries', async () => {
  const original = fs.promises.opendir;
  let reads = 0, closed = false;
  fs.promises.opendir = async () => ({
    read: async () => {
      reads++;
      return { name: `file-${reads}`, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
    },
    close: async () => { closed = true; },
  });
  try {
    await assert.rejects(() => sample('entries', path.resolve('synthetic-directory')), /directory observation limit/);
    assert.equal(reads, 20_001);
    assert.equal(closed, true);
  } finally { fs.promises.opendir = original; }
});

test('final directory recheck also stops at its entry limit', () => {
  const original = fs.opendirSync;
  let reads = 0, closed = false;
  fs.opendirSync = () => ({
    readSync: () => {
      reads++;
      return { name: `file-${reads}`, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
    },
    closeSync: () => { closed = true; },
  });
  try {
    assert.throws(() => verifyObservations([{ kind: 'entries', path: path.resolve('synthetic-directory'), value: '' }]), /directory observation limit/);
    assert.equal(reads, 20_001);
    assert.equal(closed, true);
  } finally { fs.opendirSync = original; }
});

test('a source over the 32 MiB limit fails closed without a generated file', { timeout: 30_000 }, async () => {
  const base = path.resolve('work/tests');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'large-source-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { types: [], noEmit: true }, include: ['src'] }));
  const descriptor = fs.openSync(path.join(root, 'src/big.ts'), 'wx');
  try { fs.ftruncateSync(descriptor, 33 * 1024 * 1024); } finally { fs.closeSync(descriptor); }
  await assert.rejects(() => compileNative7(root, { 'src/generated.ts': 'export const value = 1;' }), /validation limit/);
  assert.equal(fs.existsSync(path.join(root, 'src/generated.ts')), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function markdownFiles(directory, recursive = false) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
    if (recursive && entry.isDirectory()) files.push(...(await markdownFiles(path, true)));
  }
  return files;
}

test('published documentation is valid UTF-8 without corrupted punctuation', async () => {
  const files = [
    ...(await markdownFiles(root)),
    ...(await markdownFiles(join(root, 'docs'), true)),
  ];
  for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
    if (entry.isDirectory())
      files.push(...(await markdownFiles(join(root, 'packages', entry.name))));
  }
  assert.ok(files.length > 0);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  // UTF-8 punctuation incorrectly decoded as Windows-1252/Latin-1.
  const mojibake = /\u00c2\u00b7|\u00e2\u20ac[\u00a6\u201c\u201d]|\ufffd/u;
  for (const file of files) {
    const text = decoder.decode(await readFile(file));
    assert.doesNotMatch(text, mojibake, file);
  }
});

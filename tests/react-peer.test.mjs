import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

test('workspace renderers share the React instance used by Latch hooks', () => {
  const bindings = createRequire(new URL('../packages/react/package.json', import.meta.url))('react');
  for (const manifest of [
    '../package.json',
    '../packages/console/package.json',
    '../examples/catalog/package.json',
    '../examples/docs/package.json',
  ]) {
    const react = createRequire(new URL(manifest, import.meta.url))('react');
    assert.equal(react, bindings, manifest + ' must use the same React instance as Latch');
  }
});

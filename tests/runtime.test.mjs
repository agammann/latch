import test from 'node:test';
import assert from 'node:assert/strict';
import { createScope } from '../packages/runtime/dist/index.js';
import { checkSchema, validate } from '../packages/contracts/dist/index.js';
const schema = {
  type: 'object',
  properties: { q: { type: 'string' } },
  required: ['q'],
  additionalProperties: false,
};
const contract = {
  name: 'search',
  description: 'Find entries',
  inputSchema: schema,
  resultSchema: schema,
  scope: { route: '/', component: 'Search' },
  preconditions: [],
  sideEffects: 'ui',
};
const unsupported = {
  available: false,
  register() {
    throw Error('must not register');
  },
};
const binding = (handler) => ({ contract, handler });
test('invalid input is rejected before handler and result mismatch is detected', async () => {
  let calls = 0;
  const s = createScope(
    [
      binding(() => {
        calls++;
        return { q: 12 };
      }),
    ],
    { adapter: unsupported },
  );
  await assert.rejects(s.invoke('search', { q: 1 }), { code: 'VALIDATION' });
  assert.equal(calls, 0);
  await assert.rejects(s.invoke('search', { q: 'ok' }), { code: 'RESULT_CONTRACT' });
  assert.equal(calls, 1);
  s.dispose();
});
test('unknown keyword, unsafe properties and nonfinite input fail closed', () => {
  assert.throws(() => checkSchema({ ...schema, $ref: 'https://remote' }));
  assert.throws(() =>
    checkSchema(
      JSON.parse(
        '{"type":"object","properties":{"__proto__":{"type":"string"}},"additionalProperties":false}',
      ),
    ),
  );
  assert.throws(() => validate({ type: 'number' }, NaN));
  assert.throws(() => validate(schema, { q: 'ok', admin: true }));
});
test('FIFO results are stable and rejected call does not poison queue', async () => {
  const order = [];
  const s = createScope(
    [
      binding(async ({ q }) => {
        await new Promise((r) => setTimeout(r, q === 'first' ? 30 : 1));
        order.push(q);
        if (q === 'fail') throw Error('secret source');
        return { q };
      }),
    ],
    { adapter: unsupported },
  );
  const a = s.invoke('search', { q: 'first' }),
    bad = s.invoke('search', { q: 'fail' }),
    b = s.invoke('search', { q: 'last' });
  await a;
  await assert.rejects(bad, (e) => e.code === 'HANDLER' && !e.message.includes('secret'));
  await b;
  assert.deepEqual(order, ['first', 'fail', 'last']);
  s.dispose();
});
test('queued input is immutable and closures update without reregistering', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const s = createScope(
    [
      binding(async (x) => {
        await gate;
        return x;
      }),
    ],
    { adapter: unsupported },
  );
  const input = { q: 'original' };
  const pending = s.invoke('search', input);
  input.q = 'changed';
  release();
  assert.deepEqual(await pending, { q: 'original' });
  s.update([binding((x) => ({ q: x.q + ' new' }))]);
  assert.deepEqual(await s.invoke('search', { q: 'callback' }), { q: 'callback new' });
  s.dispose();
});
test('navigation prevents cooperative late commits and cancels queued calls', async () => {
  let release;
  let changed = false;
  let route = '/';
  const gate = new Promise((r) => (release = r));
  const s = createScope(
    [
      binding(async (x, c) => {
        await gate;
        c.assertActive();
        changed = true;
        return x;
      }),
    ],
    { adapter: unsupported, route: () => route },
  );
  const pending = s.invoke('search', { q: 'first' });
  const queued = s.invoke('search', { q: 'second' });
  await Promise.resolve();
  route = '/away';
  s.dispose();
  release();
  await assert.rejects(pending, { code: 'CANCELLED' });
  await assert.rejects(queued, { code: 'CANCELLED' });
  assert.equal(changed, false);
});
test('cancellation after a commit is not described as rollback', async () => {
  let release,
    changed = false;
  const gate = new Promise((r) => (release = r));
  const s = createScope(
    [
      binding(async (x) => {
        changed = true;
        await gate;
        return x;
      }),
    ],
    { adapter: unsupported },
  );
  const p = s.invoke('search', { q: 'x' });
  await Promise.resolve();
  s.dispose();
  release();
  await assert.rejects(p, (e) => e.code === 'CANCELLED' && e.message.includes('not rolled back'));
  assert.equal(changed, true);
});
test('partial registration failure aborts all owned registrations', async () => {
  const signals = [];
  const adapter = {
    available: true,
    async register(t, s) {
      signals.push(s);
      if (t.name === 'second') throw Error('duplicate');
    },
  };
  const s = createScope(
    [binding((x) => x), { contract: { ...contract, name: 'second' }, handler: (x) => x }],
    { adapter },
  );
  assert.equal((await s.ready).registration, 'failed');
  assert.ok(signals.every((s) => s.aborted));
  await assert.rejects(s.invoke('search', { q: 'x' }), { code: 'CANCELLED' });
  s.dispose();
});
test('unresolved handlers and preconditions never register', () => {
  let count = 0;
  const adapter = {
    available: true,
    async register() {
      count++;
    },
  };
  assert.throws(() => createScope([{ contract, handler: undefined }], { adapter }));
  assert.throws(() =>
    createScope([{ contract: { ...contract, preconditions: ['signedIn'] }, handler: (x) => x }], {
      adapter,
    }),
  );
  assert.equal(count, 0);
});
test('preconditions are evaluated at execution time', async () => {
  let allowed = false;
  const s = createScope(
    [
      {
        contract: { ...contract, preconditions: ['allowed'] },
        handler: (x) => x,
        preconditions: { allowed: () => allowed },
      },
    ],
    { adapter: unsupported },
  );
  await assert.rejects(s.invoke('search', { q: 'x' }), { code: 'PRECONDITION' });
  allowed = true;
  assert.deepEqual(await s.invoke('search', { q: 'x' }), { q: 'x' });
  s.dispose();
});
test('unsupported browser is a status, not a fake native API', async () => {
  const s = createScope([binding((x) => x)], { adapter: unsupported });
  assert.equal((await s.ready).registration, 'unsupported');
  assert.deepEqual(await s.invoke('search', { q: 'x' }), { q: 'x' });
  s.dispose();
});

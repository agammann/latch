import fs from 'node:fs';
const str = (extra = {}) => ({ type: 'string', ...extra });
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const arr = (items) => ({ type: 'array', items, maxItems: 100 });
const item = obj({ id: str(), name: str(), category: str(), price: { type: 'number' } });
const state = obj({
  query: str(),
  category: str(),
  sort: str(),
  items: arr(item),
  selectedId: str(),
});
const docsState = obj({
  query: str(),
  matches: arr(obj({ id: str(), title: str(), body: str() })),
  openedId: str(),
});
const t = (name, binding, inputSchema, resultSchema, description) => ({
  name,
  description,
  inputSchema,
  resultSchema,
  binding,
  scope: { route: '/', component: name.startsWith('catalog') ? 'Catalog' : 'App' },
  preconditions: [],
  sideEffects: name.endsWith('.read') ? 'none' : 'ui',
});
const binding = (reference) => ({ kind: 'react', module: 'src/main.tsx', reference });
const exported = (name) => ({ kind: 'export', module: 'src/library.ts', export: name });
const call = (tool, input, result = [], expectError) => ({
  tool,
  input,
  result,
  ...(expectError ? { expectError } : {}),
});
const eq = (path, equals) => ({ path: path.split('.'), equals });
const count = (n, label = 'results') => ({
  target: { testId: 'count' },
  kind: 'text',
  equals: `${n} ${label}`,
});
const test = (name, calls, extra = {}) => ({
  name,
  route: '/',
  fixture: 'fresh-page',
  mode: 'handler',
  timeoutMs: 15000,
  calls,
  ...extra,
});
const catalog = {
  version: 1,
  project: 'Catalog fixture',
  baseUrl: 'http://127.0.0.1:5173',
  browser: { channel: 'chrome', native: true },
  installation: { file: 'src/main.tsx' },
  tools: [
    t(
      'catalog.search',
      binding('search'),
      obj(
        {
          query: str({ maxLength: 120 }),
          category: str({ enum: ['all', 'workspace', 'outdoors'] }),
          sort: str({ enum: ['name', 'price-asc', 'price-desc'] }),
        },
        [],
      ),
      state,
      'Search visible catalog items. Omitted fields preserve current values; empty query, all category and name sort reset them. Await completion before reading state.',
    ),
    t(
      'catalog.read',
      binding('read'),
      obj({}),
      state,
      'Read the currently visible catalog results and selected item without changing state.',
    ),
    t(
      'catalog.details',
      binding('details'),
      obj({ id: str({ minLength: 1, maxLength: 100 }) }),
      state,
      'Open details for a currently visible item; unknown or hidden IDs fail without changes.',
    ),
  ],
  tests: [
    test(
      'search updates results and input',
      [call('catalog.search', { query: 'lamp' }, [eq('items.0.id', 'lamp'), eq('query', 'lamp')])],
      { ui: [count(1), { target: { label: 'Search catalog' }, kind: 'value', equals: 'lamp' }] },
    ),
    test(
      'human search is visible to handler',
      [call('catalog.read', {}, [eq('query', 'pack'), eq('items.0.id', 'pack')])],
      {
        before: [{ kind: 'fill', target: { label: 'Search catalog' }, value: 'pack' }],
        ui: [count(1)],
      },
    ),
    test(
      'omission preserves filters and explicit reset clears',
      [
        call('catalog.search', { category: 'outdoors' }),
        call('catalog.search', { sort: 'price-desc' }, [
          eq('category', 'outdoors'),
          eq('items.0.id', 'pack'),
        ]),
        call('catalog.search', { query: '', category: 'all', sort: 'name' }, [
          eq('items.length', 4),
        ]),
      ],
      { ui: [count(4)] },
    ),
    test(
      'empty results',
      [call('catalog.search', { query: 'no-such-object' }, [eq('items.length', 0)])],
      { ui: [count(0)] },
    ),
    test(
      'invalid input does not change UI',
      [
        call('catalog.search', { query: 42 }, [], 'VALIDATION'),
        call('catalog.read', {}, [eq('query', ''), eq('items.length', 4)]),
      ],
      { ui: [count(4)] },
    ),
    test('unknown fields rejected', [call('catalog.search', { admin: true }, [], 'VALIDATION')], {
      ui: [count(4)],
    }),
    test(
      'invalid detail ID does not select',
      [
        call('catalog.details', { id: 'missing' }, [], 'HANDLER'),
        call('catalog.read', {}, [eq('selectedId', '')]),
      ],
      { ui: [{ target: { testId: 'selected' }, kind: 'count', equals: 0 }] },
    ),
    test(
      'details uses visible results',
      [call('catalog.details', { id: 'lamp' }, [eq('selectedId', 'lamp')])],
      { ui: [{ target: { testId: 'selected' }, kind: 'text', equals: 'Selected: lamp' }] },
    ),
    test(
      'FIFO overlapping searches',
      [
        call('catalog.search', { query: 'lamp' }, [eq('query', 'lamp')]),
        call('catalog.search', { query: 'pack' }, [eq('query', 'pack')]),
      ],
      {
        concurrent: true,
        ui: [count(1), { target: { label: 'Search catalog' }, kind: 'value', equals: 'pack' }],
      },
    ),
    test('agent then human reset', [call('catalog.search', { query: 'lamp' })], {
      ui: [count(1)],
      after: [{ kind: 'click', target: { role: 'button', name: 'Reset' } }],
      afterUI: [count(4), { target: { label: 'Search catalog' }, kind: 'value', equals: '' }],
    }),
    test(
      'native search and cleanup',
      [call('catalog.search', { query: 'lamp' }, [eq('items.0.id', 'lamp')])],
      {
        mode: 'native',
        ui: [count(1)],
        after: [{ kind: 'click', target: { role: 'link', name: 'Leave catalog' } }],
        afterUI: [
          {
            target: { role: 'heading', name: 'Outside catalog scope' },
            kind: 'visible',
            equals: true,
          },
        ],
        absentTools: ['catalog.search', 'catalog.read', 'catalog.details'],
      },
    ),
  ],
};
const docs = {
  version: 1,
  project: 'Documentation fixture',
  baseUrl: 'http://127.0.0.1:5174',
  browser: { channel: 'chrome', native: true },
  installation: { file: 'src/main.tsx' },
  tools: [
    t(
      'docs.search',
      exported('searchDocs'),
      obj({ text: str({ maxLength: 120 }) }, []),
      docsState,
      'Search fixture documentation by text. Omitted text preserves the query; empty text resets.',
    ),
    t(
      'docs.read',
      exported('readDocs'),
      obj({}),
      docsState,
      'Read visible documentation matches and opened document.',
    ),
    t(
      'docs.open',
      exported('openDoc'),
      obj({ id: str({ minLength: 1, maxLength: 100 }) }),
      docsState,
      'Open a currently visible document. Invalid IDs reject without a state change.',
    ),
  ],
  tests: [
    test(
      'exported search updates shared UI',
      [call('docs.search', { text: 'regression' }, [eq('matches.0.id', 'tests')])],
      {
        ui: [
          count(1, 'documents'),
          { target: { label: 'Search documentation' }, kind: 'value', equals: 'regression' },
        ],
      },
    ),
    test(
      'human query is returned by exported reader',
      [call('docs.read', {}, [eq('query', 'React'), eq('matches.0.id', 'state')])],
      {
        before: [{ kind: 'fill', target: { label: 'Search documentation' }, value: 'React' }],
        ui: [count(1, 'documents')],
      },
    ),
    test('invalid docs input', [call('docs.search', { text: false }, [], 'VALIDATION')], {
      ui: [count(3, 'documents')],
    }),
    test(
      'open documentation detail',
      [call('docs.open', { id: 'state' }, [eq('openedId', 'state')])],
      { ui: [{ target: { testId: 'selected' }, kind: 'text', equals: 'Opened: state' }] },
    ),
    test(
      'invalid document leaves state unchanged',
      [
        call('docs.open', { id: 'missing' }, [], 'HANDLER'),
        call('docs.read', {}, [eq('openedId', '')]),
      ],
      { ui: [count(3, 'documents')] },
    ),
    test(
      'docs empty and reset',
      [
        call('docs.search', { text: 'unfindable' }, [eq('matches.length', 0)]),
        call('docs.search', { text: '' }, [eq('matches.length', 3)]),
      ],
      { ui: [count(3, 'documents')] },
    ),
    test(
      'native exported search',
      [call('docs.search', { text: 'regression' }, [eq('matches.0.id', 'tests')])],
      { mode: 'native', ui: [count(1, 'documents')] },
    ),
  ],
};
for (const [name, config] of Object.entries({ catalog, docs }))
  fs.writeFileSync(`examples/${name}/latch.config.json`, JSON.stringify(config, null, 2) + '\n');
fs.copyFileSync('examples/catalog/src/style.css', 'examples/docs/src/style.css');

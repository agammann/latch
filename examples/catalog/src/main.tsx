import { useProjectTools } from "./latch.generated/integration";
import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createCatalog, type SearchInput } from './store';
import './style.css';
const store = createCatalog();
function Catalog() {
  const state = useSyncExternalStore(store.subscribe, store.read, store.read);
  const [error, setError] = useState('');
  const search = store.search,
    read = store.readVisible,
    details = store.details;
  useProjectTools({"catalog.search": search, "catalog.read": read, "catalog.details": details}); // @latch:mount
  const act = (input: SearchInput) =>
    void store.search(input).catch(() => setError('Search failed'));
  return (
    <main>
      <header>
        <a href="/">Latch examples</a>
        <a href="/away">Leave catalog</a>
      </header>
      <h1>Everyday objects</h1>
      <p>Catalog fixture · Original synthetic data for integration testing.</p>
      <form onSubmit={(e) => e.preventDefault()} className="controls">
        <label>
          Search
          <input
            aria-label="Search catalog"
            value={state.query}
            onChange={(e) => act({ query: e.target.value })}
            maxLength={120}
          />
        </label>
        <label>
          Category
          <select
            aria-label="Category"
            value={state.category}
            onChange={(e) => act({ category: e.target.value as SearchInput['category'] })}
          >
            <option value="all">All categories</option>
            <option value="workspace">Workspace</option>
            <option value="outdoors">Outdoors</option>
          </select>
        </label>
        <label>
          Sort
          <select
            aria-label="Sort"
            value={state.sort}
            onChange={(e) => act({ sort: e.target.value as SearchInput['sort'] })}
          >
            <option value="name">Name</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        <button type="button" onClick={() => act({ query: '', category: 'all', sort: 'name' })}>
          Reset
        </button>
      </form>
      <p role="status" data-testid="count">
        {state.items.length} results
      </p>
      <p role="alert">{error}</p>
      <ul className="results">
        {state.items.map((i) => (
          <li key={i.id} data-testid="item">
            <div>
              <strong>{i.name}</strong>
              <small>{i.category}</small>
            </div>
            <span>${i.price}</span>
            <button
              onClick={() =>
                void store.details({ id: i.id }).catch(() => setError('Details unavailable'))
              }
            >
              Open {i.name}
            </button>
          </li>
        ))}
      </ul>
      {state.selectedId && (
        <section aria-label="Item details">
          <h2>{itemsName(state.selectedId)}</h2>
          <p data-testid="selected">Selected: {state.selectedId}</p>
        </section>
      )}
    </main>
  );
}
function itemsName(id: string) {
  return store.read().items.find((i) => i.id === id)?.name;
}
function App() {
  const [route, setRoute] = useState(location.pathname);
  React.useEffect(() => {
    const listener = () => setRoute(location.pathname);
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a');
      if (a?.getAttribute('href') === '/away') {
        e.preventDefault();
        history.pushState({}, '', a.href);
        listener();
      }
    };
    window.addEventListener('popstate', listener);
    document.addEventListener('click', click);
    return () => {
      window.removeEventListener('popstate', listener);
      document.removeEventListener('click', click);
    };
  }, []);
  return route === '/' ? (
    <Catalog />
  ) : (
    <main>
      <h1>Outside catalog scope</h1>
      <a href="/">Return to catalog</a>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

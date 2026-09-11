import { useProjectTools } from "./latch.generated/integration";
import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { readDocs, searchDocs, subscribe, openDoc } from './library';
import './style.css';
function App() {
  const state = useSyncExternalStore(subscribe, readDocs, readDocs);
  useProjectTools({}); // @latch:mount
  return (
    <main>
      <header>
        <span>Latch examples</span>
        <span>Documentation fixture</span>
      </header>
      <h1>A small field guide</h1>
      <p>
        Original synthetic documentation. Exported functions share one store with this interface.
      </p>
      <label>
        Search documentation
        <input
          aria-label="Search documentation"
          value={state.query}
          onChange={(e) => void searchDocs({ text: e.target.value })}
        />
      </label>
      <p data-testid="count" role="status">
        {state.matches.length} documents
      </p>
      <ul className="results">
        {state.matches.map((d) => (
          <li key={d.id} data-testid="item">
            <div>
              <strong>{d.title}</strong>
              <small>{d.body}</small>
            </div>
            <button onClick={() => void openDoc({ id: d.id })}>Read {d.title}</button>
          </li>
        ))}
      </ul>
      {state.openedId && (
        <section aria-label="Document details">
          <h2>{state.matches.find((d) => d.id === state.openedId)?.title}</h2>
          <p data-testid="selected">Opened: {state.openedId}</p>
        </section>
      )}
      <button onClick={() => void searchDocs({ text: '' })}>Reset search</button>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

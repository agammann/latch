import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
const sections = [
  'Overview',
  'Contracts',
  'Source evidence',
  'Generated changes',
  'Regression reports',
];
function App() {
  const [page, setPage] = useState('Overview');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  async function refresh() {
    try {
      const r = await fetch('/api/project');
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setData(d);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Latch-Token': data.token },
        body: '{}',
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await refresh();
      setPage('Regression reports');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const report = data?.report;
  const cases = report?.cases ?? [];
  const status = (key: string) => {
    if (!report) return 'Not run';
    if (cases.some((c: any) => c.status !== 'passed')) return 'See failed / blocked tests';
    if (data.reportStale) return 'Stale · rerun tests';
    const relevant = cases.filter((c: any) => c[key] !== 'not run');
    return relevant.length
      ? relevant.every((c: any) => c.status === 'passed')
        ? 'Verified in recorded run'
        : 'See failed tests'
      : cases.some((c: any) => c.status === 'blocked')
        ? 'Blocked / not run'
        : 'Not run';
  };
  const tool = data?.config.tools.find((t: any) => t.name === selected) ?? data?.config.tools[0];
  return (
    <div className="shell">
      <aside>
        <div className="brand">Latch</div>
        <p>
          Connect your site.
          <br />
          Verify every action.
        </p>
        <nav aria-label="Console">
          {sections.map((s) => (
            <button
              key={s}
              aria-current={page === s ? 'page' : undefined}
              onClick={() => setPage(s)}
            >
              {s}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <h1>{page === 'Overview' ? 'Project overview' : page}</h1>
          <div className="actions">
            <button onClick={() => void refresh()} disabled={busy}>
              Refresh
            </button>
            <button className="primary" onClick={() => void run()} disabled={busy || !data}>
              {busy ? 'Running tests…' : 'Run regression tests'}
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!data ? (
          <p role="status">Loading local project…</p>
        ) : (
          <>
            <div className="project-label">Project</div>
            <h2 className="project-name">{data.project}</h2>
            {page === 'Overview' && (
              <>
                <section>
                  <h2>Verification status</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Check</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        [
                          'Contract validated',
                          data.checked.error
                            ? 'Failed · see Contracts'
                            : data.checked.contract === 'validated'
                              ? 'Validated'
                              : 'Not run',
                        ],
                        ['Handler tested', status('handler')],
                        ['UI behavior verified', status('ui')],
                        ['Native registration', status('nativeRegistration')],
                        ['Native invocation', status('nativeInvocation')],
                      ].map(([a, b]) => (
                        <tr key={a}>
                          <td>{a}</td>
                          <td>{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <div className="columns">
                  <section>
                    <h2>Tool contracts</h2>
                    <table>
                      <thead>
                        <tr>
                          <th>Tool</th>
                          <th>Binding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.config.tools.map((t: any) => (
                          <tr key={t.name}>
                            <td>
                              <button
                                className="text"
                                onClick={() => {
                                  setSelected(t.name);
                                  setPage('Contracts');
                                }}
                              >
                                {t.name}
                              </button>
                            </td>
                            <td>{t.binding.kind}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section>
                    <h2>Compatibility</h2>
                    <dl>
                      <dt>Document API target</dt>
                      <dd>{data.compatibility.target}</dd>
                      <dt>Configuration</dt>
                      <dd>{data.compatibility.configuration}</dd>
                      <dt>Recorded browser</dt>
                      <dd>{report?.browser ?? 'Not run'}</dd>
                    </dl>
                  </section>
                </div>
              </>
            )}
            {page === 'Contracts' && (
              <>
                <p>
                  Explicit mappings connect these contracts to application code. Inputs are
                  validated without coercion.
                </p>
                {data.checked.error && <pre className="error">{data.checked.error}</pre>}
                <label>
                  Tool
                  <select
                    aria-label="Tool"
                    value={tool?.name ?? ''}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {data.config.tools.map((t: any) => (
                      <option key={t.name}>{t.name}</option>
                    ))}
                  </select>
                </label>
                {tool && (
                  <section className="detail">
                    <h2>{tool.name}</h2>
                    <p>{tool.description}</p>
                    <dl>
                      <dt>Mapping</dt>
                      <dd>
                        {tool.binding.module} → {tool.binding.reference ?? tool.binding.export}
                      </dd>
                      <dt>Scope</dt>
                      <dd>
                        {tool.scope.route} · {tool.scope.component}
                      </dd>
                      <dt>Side effects</dt>
                      <dd>{tool.sideEffects}</dd>
                    </dl>
                    <h3>Input schema</h3>
                    <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                    <h3>Result contract</h3>
                    <pre>{JSON.stringify(tool.resultSchema, null, 2)}</pre>
                    <h3>Configured inputs</h3>
                    <pre>
                      {JSON.stringify(
                        data.config.tests.flatMap((t: any) =>
                          t.calls.filter((c: any) => c.tool === tool.name),
                        ),
                        null,
                        2,
                      )}
                    </pre>
                  </section>
                )}
              </>
            )}
            {page === 'Source evidence' && (
              <>
                <p>
                  Suggestions only. Source is parsed locally and never imported or executed by
                  inspection.
                </p>
                {data.evidence.map((e: any, i: number) => (
                  <section className="detail" key={i}>
                    <h2>{e.name}</h2>
                    <p>
                      {e.file}:{e.line} · {e.kind}
                    </p>
                    <code>{e.evidence}</code>
                    <p>Inputs: {e.inputs.join(', ') || 'None recognized'}</p>
                    <p>{e.unresolved.join('. ')}</p>
                    <p>{e.adapterRequirements.join('. ')}</p>
                  </section>
                ))}
              </>
            )}
            {page === 'Generated changes' && (
              <>
                <p>
                  Review the proposed installation. Apply with <code>latch apply</code>; undo owned
                  changes with <code>latch rollback</code>.
                </p>
                <pre>{data.changes}</pre>
              </>
            )}
            {page === 'Regression reports' && (
              <>
                {!report ? (
                  <p>No regression report yet. Start the website, then run regression tests.</p>
                ) : (
                  <>
                    <p>
                      {report.startedAt} · {report.passed} passed · {report.failed} failed ·{' '}
                      {report.blocked} blocked
                    </p>
                    {data.reportStale && (
                      <p role="alert">Configuration changed since this report. Rerun tests.</p>
                    )}
                    {cases.map((c: any) => (
                      <details key={c.name}>
                        <summary>
                          {c.status.toUpperCase()} · {c.name} ·{' '}
                          {c.mode === 'handler' ? 'Handler test' : 'Native invocation'}
                        </summary>
                        {c.error && <p className="error">{c.error}</p>}
                        <pre>{JSON.stringify(c, null, 2)}</pre>
                      </details>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      <footer>
        Local only <span>/</span> Telemetry off
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);

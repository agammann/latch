import type { ExecutionContext } from '@latch-local/contracts';
export const articles = [
  {
    id: 'start',
    title: 'Getting started',
    body: 'Install the local packages and initialize a contract.',
  },
  {
    id: 'state',
    title: 'Shared state',
    body: 'Connect React callbacks to existing application state.',
  },
  {
    id: 'tests',
    title: 'Regression tests',
    body: 'Verify handlers and visible state after a change.',
  },
];
export interface DocState {
  query: string;
  matches: typeof articles;
  openedId: string;
}
let state: DocState = { query: '', matches: articles, openedId: '' };
const listeners = new Set<() => void>();
function commit(next: DocState) {
  state = next;
  listeners.forEach((l) => l());
  return state;
}
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export function readDocs() {
  return state;
}
export async function searchDocs(
  { text }: { text?: string },
  context?: ExecutionContext,
): Promise<DocState> {
  context?.assertActive();
  const query = text ?? state.query;
  return commit({
    query,
    matches: articles.filter((d) =>
      (d.title + ' ' + d.body).toLowerCase().includes(query.toLowerCase()),
    ),
    openedId: '',
  });
}
export async function openDoc(
  { id }: { id: string },
  context?: ExecutionContext,
): Promise<DocState> {
  context?.assertActive();
  if (!state.matches.some((d) => d.id === id)) throw Error('Document is not in visible matches');
  return commit({ ...state, openedId: id });
}

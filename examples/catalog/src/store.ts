import type { ExecutionContext } from '@latch-local/contracts';
export const items = [
  { id: 'lamp', name: 'Arc desk lamp', category: 'workspace', price: 48 },
  { id: 'notebook', name: 'Field notebook', category: 'workspace', price: 14 },
  { id: 'bottle', name: 'Trail bottle', category: 'outdoors', price: 26 },
  { id: 'pack', name: 'Day pack', category: 'outdoors', price: 72 },
];
export interface SearchInput {
  query?: string;
  category?: 'all' | 'workspace' | 'outdoors';
  sort?: 'name' | 'price-asc' | 'price-desc';
}
export interface CatalogState {
  query: string;
  category: string;
  sort: string;
  items: typeof items;
  selectedId: string;
}
/** Original fixture data. One coordinator is shared by human controls and Latch. */
export function createCatalog() {
  let state: CatalogState = {
    query: '',
    category: 'all',
    sort: 'name',
    items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    selectedId: '',
  };
  const listeners = new Set<() => void>();
  let queue = Promise.resolve();
  const commit = (next: CatalogState) => {
    state = next;
    listeners.forEach((l) => l());
  };
  function search(input: SearchInput, context?: ExecutionContext): Promise<CatalogState> {
    const task = queue.then(async () => {
      const next = { ...state, ...input }; // omitted values preserve current filters; empty query and 'all' reset explicitly
      await new Promise((r) => setTimeout(r, 20));
      context?.assertActive();
      const visible = items
        .filter(
          (i) =>
            i.name.toLowerCase().includes(next.query.toLowerCase()) &&
            (next.category === 'all' || i.category === next.category),
        )
        .sort((a, b) =>
          next.sort === 'price-asc'
            ? a.price - b.price
            : next.sort === 'price-desc'
              ? b.price - a.price
              : a.name.localeCompare(b.name),
        );
      commit({ ...next, items: visible, selectedId: '' });
      return state;
    });
    queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  return {
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    read: () => state,
    readVisible: async () => {
      await queue;
      return state;
    },
    search,
    async details({ id }: { id: string }, context?: ExecutionContext) {
      await queue;
      context?.assertActive();
      if (!state.items.some((i) => i.id === id)) throw Error('ID is not a visible result');
      commit({ ...state, selectedId: id });
      return state;
    },
  };
}

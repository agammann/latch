/** Chrome 153 document API adapter, verified 2026-09-08. No legacy API fallback. */
export interface NativeTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
}
export interface NativeContext {
  registerTool(tool: NativeTool, options: { signal: AbortSignal }): Promise<void>;
  getTools(): Promise<Array<{ name: string }>>;
  executeTool(
    tool: object,
    input: string,
    options?: { signal: AbortSignal },
  ): Promise<string | null>;
}
export interface BrowserAdapter {
  available: boolean;
  register(tool: NativeTool, signal: AbortSignal): Promise<void>;
}
export function documentAdapter(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): BrowserAdapter {
  const context = (doc as (Document & { modelContext?: NativeContext }) | undefined)?.modelContext;
  const available =
    !!context &&
    typeof context.registerTool === 'function' &&
    typeof context.getTools === 'function' &&
    typeof context.executeTool === 'function';
  return {
    available,
    async register(tool, signal) {
      if (!available) throw Error('WebMCP document API unavailable');
      await context!.registerTool(tool, { signal });
    },
  };
}

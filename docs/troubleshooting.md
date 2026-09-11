# Troubleshooting

| Symptom                                 | Action                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty config fails check                | Add a real binding, contract and regression case. Init deliberately creates no fake tool.                                                             |
| Export not found                        | Use a named exported function declaration or arrow/function expression, or create a handwritten adapter. Component-local callbacks use React binding. |
| Installation marker missing             | Add exactly one `// @latch:mount` at the top level of the owning component after its callbacks.                                                       |
| Generated TypeScript fails              | Read the compiler location; align handler arguments and awaited result with the schema. Existing consumer TypeScript errors also fail validation.     |
| Generated file edited                   | Preserve the edits in handwritten application code, restore the last generated version, then regenerate. Latch will not overwrite it automatically.   |
| Rollback refused                        | The component or generated files changed after generation. Review and manually reconcile; never force overwrite.                                      |
| Handler bridge timeout                  | Use a development Vite build on the exact configured local origin and start the correct route. Production builds intentionally omit the bridge.       |
| `RESULT_CONTRACT`                       | Your real handler returned a different shape. Correct the mapping/implementation or deliberately version the contract with new tests.                 |
| UI differs from returned result         | Ensure human and agent operations share a store and await pending state commits. `setState()` alone is not an asynchronous completion contract.       |
| Native check blocked                    | Use the verified Chrome build with the WebMCP flag. Check the dated compatibility document. A blocked native case produces a nonzero exit.            |
| Duplicate native tool                   | Mount one owner per tool name. Separate route lifetimes and inspect registration status. Partial registrations are aborted on failure.                |
| Browser missing                         | Select installed Chrome, or install Playwright Chromium. The default example native target is Chrome.                                                 |
| Console 403                             | Open the exact `http://127.0.0.1:4545` URL. Remote Host/Origin values and cross-site requests are rejected.                                           |
| Console report marked stale             | Regenerate/check if needed, run the website and rerun tests. Source/config changed since the report.                                                  |
| Registry lookup for local Latch package | Configure pnpm overrides to all six local tarballs before installing. No registry publication is assumed.                                             |

No command accepts shell scripts or arbitrary JavaScript in configuration. Source inspection walks only the selected root, skips symlinks/junctions, secret-named files, dot directories, dependencies and build output, and limits each inspected file to 256 KiB and the walk to 20,000 entries. Explicit mappings are still required even when inspection finds a plausible function. Source names and form labels do not establish side-effect safety.

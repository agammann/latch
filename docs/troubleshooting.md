# Troubleshooting

[Documentation index](README.md) · [Installation](installation.md)

## Studio and first setup

| Symptom                                               | Action                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Download integration is disabled                      | Resolve the contract or sample validation message. Every tool must be valid. Save draft still preserves unfinished work.                                                                 |
| Draft disappeared after closing the tab               | Studio keeps current work only in the tab. Reopen a previously saved draft with Open config. There is no automatic recovery for an unsaved draft.                                        |
| Imported tests changed                                | Studio exports one Handler case per tool and does not retain advanced test steps or native settings. Keep the original configuration and use the CLI for those tests.                    |
| `latch.config.json already exists`                    | Use the existing or downloaded configuration. Init is only for creating a new file and intentionally refuses to overwrite it.                                                            |
| `pnpm` is not recognized                              | Install pnpm and reopen the terminal. Confirm `node --version` and `pnpm --version` before the setup steps.                                                                              |
| `latch` is not recognized                             | Run `pnpm exec latch` from the application where the CLI package is installed. A global installation is not required.                                                                    |
| `ERR_PNPM_IGNORED_BUILDS` during package installation | The prebuilt Latch packages need no install scripts. Use the documented `pnpm add --ignore-scripts` commands. Configure build scripts needed by your existing application separately.    |
| `playwright` is not recognized in a consumer app      | Add `playwright@1.58.2` as a direct development dependency before using `pnpm exec playwright install chromium`, as described in Installation.                                           |
| Port already in use                                   | Stop the process you started on that port, or deliberately update the application origin and configuration together. The supplied scripts use strict ports and will not silently switch. |

## Integration and tests

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

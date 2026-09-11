# Latch

**Connect your site. Verify every action.**

Latch connects selected React application functions to native WebMCP and checks that those integrations still work after the application changes. It generates typed wrappers around your actual callbacks or exported functions, validates inputs and results, manages mounted tool lifetimes, and runs handler, visible UI, and native regression tests.

Version **0.1.0** is a local developer release. No account, hosted service, telemetry or model API key is needed. Package names under `@latch-local` are local distribution identifiers; registry availability is not claimed. No packages have been published to a registry.

## Start with the examples

Use Node 22 or later and pnpm 10.17.1 or later. The recorded verification used Node 24.19.0, pnpm 11.19.0 and Windows. Commands are the same in PowerShell, macOS and Linux terminals; the latter two platforms have not been executed in this release environment.

```sh
git clone https://github.com/agammann/latch.git
cd latch
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
node packages/cli/dist/main.js generate --root examples/catalog
node packages/cli/dist/main.js apply --root examples/catalog
pnpm --dir examples/catalog dev
```

In another terminal:

```sh
node packages/cli/dist/main.js test --root examples/catalog
node packages/cli/dist/main.js dev --root examples/catalog
```

Open the console at **http://127.0.0.1:4545**. The catalog uses port 5173. The documentation fixture uses port 5174; generate/apply it with `--root examples/docs` and start it with `pnpm --dir examples/docs dev`.

Both examples use original synthetic data. Their generated files and ownership manifests are included for review. Fresh clones can rerun `latch generate` safely; edited files cause a conflict.

## Install into your own React/Vite project

Build and package this checkout:

```sh
pnpm build
pnpm pack:local
```

Install the four browser packages as application dependencies and the CLI/test packages as development dependencies. Use absolute paths to the six files produced in `artifacts/`:

First add the local tarball overrides shown in the [installation instructions](docs/installation.md) to your project's `pnpm-workspace.yaml`. These unpublished package identifiers need the overrides before the following install commands can resolve their transitive dependencies.

```sh
pnpm add /path/to/latch/artifacts/latch-local-contracts-0.1.0.tgz /path/to/latch/artifacts/latch-local-browser-0.1.0.tgz /path/to/latch/artifacts/latch-local-runtime-0.1.0.tgz /path/to/latch/artifacts/latch-local-react-0.1.0.tgz
pnpm add -D /path/to/latch/artifacts/latch-local-test-0.1.0.tgz /path/to/latch/artifacts/latch-local-cli-0.1.0.tgz
pnpm exec latch init
```

Local artifact dependencies need **pnpm overrides** pointing each `@latch-local/*` package to its absolute tarball path so that transitive packages resolve locally. See the complete [installation instructions](docs/installation.md) and the clean-consumer verification script, which creates these overrides automatically. Do not substitute unverified registry package names.

Configure your real search handler and test cases in `latch.config.json`, add `// @latch:mount` inside the owning component, then:

```sh
pnpm exec latch inspect
pnpm exec latch generate
pnpm exec latch check
pnpm exec latch apply
# Run your normal Vite development server in another terminal.
pnpm exec latch test
pnpm exec latch dev
```

The [integration guide](docs/integration.md) includes a complete contract and both binding patterns. Empty or unresolved mappings fail checks. Generated code does not fabricate handlers.

## Verification levels

| Evidence                     | Meaning                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Contract validated           | Configuration and bounded schema definitions pass validation.                             |
| Handler tested               | A development harness invokes the same validated wrapper used by production registration. |
| UI behavior verified         | Structured browser assertions verify visible state following calls and human controls.    |
| Native registration verified | The configured tool is discovered through the browser's documented API.                   |
| Native invocation verified   | The browser itself invokes the registered tool and its result assertions pass.            |

An absent browser API or unavailable required native check is **blocked**, never passed. The verified native target is Chrome **153.0.8010.37**, with the `WebMCPTesting` flag enabled. The unflagged browser had no native API. Read the [dated compatibility record](docs/compatibility-2026-09-08.md) before claiming support for another browser or revision.

## Project layout

| Package     | Responsibility                                                                           |
| ----------- | ---------------------------------------------------------------------------------------- |
| `contracts` | Dependency-free bounded schemas, contracts and validation                                |
| `browser`   | Isolated Chrome document API adapter                                                     |
| `runtime`   | Validated execution, scope queue, lifecycle and status                                   |
| `react`     | Commit-phase callback updates and mount cleanup                                          |
| `test`      | Playwright runner and a separate opt-in DEV bridge entry point                           |
| `cli`       | Configuration, AST inspection, generation, apply/rollback, diagnostics and local service |
| `console`   | React/Vite console compiled into CLI distribution                                        |

Production apps depend only on the first four packages. Test runner, local filesystem access, source inspection and console code are not part of the production browser runtime.

## Development and release checks

```sh
pnpm build
pnpm test
# Stop existing example servers before the full verification command.
pnpm verify
node scripts/consumer.mjs /absolute/path/outside/latch-checkout
```

`pnpm verify` builds and checks both examples, executes unit and browser regressions, demonstrates an intentional result-contract break, and packs the release. The external consumer script installs artifacts into a new folder, invokes the installed CLI, builds both generated examples, and tests them. It refuses to reuse an existing consumer folder.

Reports are in [reports](reports). The [release notes](RELEASE_NOTES.md) distinguish measured results and remaining limitations. The [CI example](docs/ci.md) uses a deterministic handler lane and a separately required native lane.

See also: [runtime semantics](docs/runtime.md), [upgrades/removal](docs/maintenance.md), [troubleshooting](docs/troubleshooting.md), [changelog](CHANGELOG.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## License decision

No open-source license has been selected. Package metadata uses `UNLICENSED` to prevent an accidental permission grant. Public repository visibility does not establish reuse rights. Ownership and licensing remain decisions for the repository owner.

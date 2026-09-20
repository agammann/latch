# Working on Latch

[Repository home](README.md) · [Documentation index](docs/README.md)

This guide covers development of the CLI, runtime, local console, and examples in this repository. To use Latch in your own application, start with [Installation](docs/installation.md).

## Repository map

| Location              | Purpose                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| `packages/contracts`  | Bounded schemas, contract types, and validation.                                        |
| `packages/browser`    | Adapter for the measured native Chrome API.                                             |
| `packages/runtime`    | Validated execution, scope queues, cancellation, and status.                            |
| `packages/react`      | Hook integration and lifecycle handling.                                                |
| `packages/test`       | Playwright tests and the development bridge.                                            |
| `packages/cli`        | Configuration, source inspection, generation, installation, rollback, and local server. |
| `packages/console`    | React/Vite UI bundled into the CLI.                                                     |
| `examples/catalog`    | Shared state and React callback bindings.                                               |
| `examples/docs`       | Exported function bindings.                                                             |
| `tests` and `scripts` | Automated checks, packaging, and verification workflows.                                |
| `docs`                | User and maintainer directions.                                                         |
| `reports`             | Recorded release evidence, including screenshots.                                       |

The public [Latch Studio](https://latch-studio.alx21.chatgpt.site) website is maintained in a separate Sites checkout. Editing `packages/console` changes the local developer console, not that hosted website.

## Setup and ordinary verification

Use Node 22+ and the repository's pinned pnpm 10.17.1. From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
pnpm exec playwright install chromium
node scripts/ci-handler.mjs
```

On Linux, install browser system dependencies with `pnpm exec playwright install --with-deps chromium` when needed. Keep ports 5173 and 5174 free before running the Handler script. It manages and stops its own example servers. See [CI lanes](docs/ci.md) for the scope of these checks.

For documentation changes, check the commands against the actual CLI, check relative paths and public links, and run Prettier on the Markdown files you changed. Do not describe historical native results as verification of a changed revision.

## Native release verification

The unchanged examples include native tests and require the browser described in the [dated compatibility record](docs/compatibility-2026-09-08.md). With that target available and ports 5173 and 5174 free:

```sh
pnpm verify
```

This builds and generates both examples, runs unit and browser tests, demonstrates an intentional handler regression, and packages and audits the release. It refreshes several files under `reports/`. Preserve existing release evidence separately before running it when you need to retain that snapshot. A blocked native case must remain visible and must not be relabeled as passed.

## Package and verify a fresh consumer

```sh
pnpm build
pnpm pack:local
pnpm exec node scripts/consumer.mjs ../latch-consumer-check
```

Choose a destination that does not exist and is outside the repository. Keep ports 5273 and 5274 free. The consumer script installs the six local tarballs into a new project, generates and applies both examples, builds production bundles, checks development bridge exclusion, and runs the configured browser tests. It uses the unchanged native example settings and therefore needs the native browser target. It writes `reports/clean-consumer.json` and leaves the consumer directory for inspection.

Package artifacts live in ignored `artifacts/`. Transient staging lives in ignored `work/`. The tracked example manifests are intentional: they correspond to the generated example integrations and preserve rollback provenance. Do not delete them as build clutter. Do not commit credentials, environment files, dependency directories, or temporary test output.

## Review expectations

Keep changes focused and describe the observed problem, resulting behavior, and checks performed. Changes to the generator or ownership rules need regression coverage for preservation of handwritten source. Changes to browser behavior need evidence for the specific browser and API revision claimed. Update the relevant user guide when commands or configuration change.

Package names remain unpublished local identifiers. Registry publication, license selection, and public compatibility claims require separate owner decisions. The repository is currently `UNLICENSED`; this guide does not grant reuse or contribution licensing rights.

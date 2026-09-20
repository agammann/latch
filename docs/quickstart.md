# Try the examples

[Documentation index](README.md)

This path runs complete example applications and tests their handlers in ordinary Chromium. It does not require native WebMCP support.

## 1. Prepare the checkout

Install Git, Node 22 or later, and pnpm 10.17.1 or later. The repository pins pnpm 10.17.1. Check that `node --version` and `pnpm --version` work before continuing.

Run these commands in a terminal:

```sh
git clone https://github.com/agammann/latch.git
cd latch
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm exec playwright install chromium
```

On Linux, use `pnpm exec playwright install --with-deps chromium` if browser system dependencies are missing. Installing system dependencies may require administrator access.

A successful build produces the six packages under `packages/*/dist` and bundles the local console into the CLI. The example source and its generated integrations are already tracked in the checkout.

## 2. Run the ordinary browser checks

From the repository root, with ports **5173** and **5174** free:

```sh
node scripts/ci-handler.mjs
```

The script starts both development servers, runs the configured Handler cases and their UI assertions, writes `reports/ci-catalog.json` and `reports/ci-docs.json`, and stops its servers. For the 0.1.0 examples, expect **10 catalog cases and 6 documentation cases to pass**, with no failed or blocked cases. Native cases are explicitly recorded as not run in this lane. The checked-in configurations are unchanged.

## 3. Explore the catalog and local console

In terminal A, from the repository root:

```sh
pnpm --dir examples/catalog dev
```

Open **http://127.0.0.1:5173**. Search, filter, sort, and open an item. The data is synthetic and provided for testing.

In terminal B, also from the repository root:

```sh
node packages/cli/dist/main.js dev --root examples/catalog
```

Open **http://127.0.0.1:4545** to inspect the contracts and reports. Keep both terminals running. Press Ctrl+C in each terminal when finished. The console's test action runs the unchanged example configuration, including its native case; use step 2 for the ordinary Chromium lane.

To explore the documentation example instead, run `pnpm --dir examples/docs dev` and open **http://127.0.0.1:5174**. Use `--root examples/docs` when starting its console. Only one console can use port 4545 at a time.

## 4. Run native tests when your browser is ready

The shipped example configurations include required native cases. Read the [dated compatibility record](compatibility-2026-09-08.md) first. With the catalog server still running and the target Chrome installation available:

```sh
node packages/cli/dist/main.js test --root examples/catalog
```

The runner requests the testing flag when `browser.native` is true. A missing native API is reported as blocked and gives a nonzero exit status. That result is not a failure of the ordinary Handler lane and must not be presented as native success.

## Next step

Use [Latch Studio](studio.md) to describe your own tool, then follow [Installation](installation.md). If a command fails, start with [Troubleshooting](troubleshooting.md).

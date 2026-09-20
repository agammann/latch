# CI and verification lanes

[Documentation index](README.md) · [Development guide](../CONTRIBUTING.md)

The [GitHub workflow](../.github/workflows/ci.yml) builds the packages, runs unit tests, and exercises both examples in an ordinary Chromium Handler lane. The [recorded Linux release run](https://github.com/agammann/latch/actions/runs/34552048479) passed; consult the repository's Actions page for newer revisions.

## Ordinary Chromium lane

From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm test
pnpm exec playwright install chromium
node scripts/ci-handler.mjs
```

On Linux, use `pnpm exec playwright install --with-deps chromium` when system dependencies are required. Keep ports 5173 and 5174 free. The script starts both apps, derives a Handler test configuration in memory, and leaves the checked-in native configurations unchanged. It labels native cases as not run, writes `reports/ci-catalog.json` and `reports/ci-docs.json`, and stops its servers.

The workflow uploads the report directory even when a check fails. This lane does not establish native interoperability or run the separate consumer production bundle audit.

## Native release lane

Use the target Chrome installation described in the [compatibility record](compatibility-2026-09-08.md), keep the unchanged example configurations, and run `pnpm verify`. Retain reports that record the actual browser version. If Chrome or its API is unavailable, the native case must remain blocked with a nonzero exit. A passing Handler lane does not substitute for this evidence.

Full verification also runs the intentional regression demonstration. That script requires the documentation development server on port 5174 when run separately as `pnpm regression:demo`. It detects a wrong handler result shape, verifies the corrected mapping, and restores the original source and configuration in `finally`.

The separate [fresh consumer check](../CONTRIBUTING.md#package-and-verify-a-fresh-consumer) verifies installation and production development bridge exclusion. Reports from an older source revision remain historical evidence.

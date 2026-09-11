# CI lanes

The workflow under `.github/workflows/ci.yml` builds, runs unit tests, audits production bundles and tests both examples in a deterministic Chromium handler lane. It is provided as executable CI configuration; local reports do not claim that GitHub Actions has already run it.

Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm build`, `pnpm test` and `node scripts/ci-handler.mjs`. Install the pinned Playwright Chromium first with `pnpm exec playwright install --with-deps chromium` on Linux. The script explicitly derives a handler-only test project for this lane and labels native checks not run.

Native release verification remains a separate required local/managed-runner lane: install the target Chrome version, use the unchanged example configs, run `pnpm verify`, and retain the JSON reports containing its exact version. If Chrome or its API is unavailable, native cases must be blocked and exit nonzero. Do not reinterpret the handler lane as native interoperability evidence.

The intentional regression demo requires the docs development server at port 5174. `pnpm regression:demo` saves a passing baseline, changes the real handler to return an invalid result shape, verifies `RESULT_CONTRACT` failure, restores the implementation in `finally`, and verifies the corrected behavior. The full verify command orchestrates that demonstration.

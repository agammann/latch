# Local installation and package artifacts

The six artifacts are produced with `pnpm build` then `pnpm pack:local`. Packaging creates ordinary npm-compatible tarballs with a `package/` root, entry points, exported declarations, bundled console (CLI only), package README and third-party notices. Dependencies between Latch packages are rewritten from workspace references to exact `0.1.0` versions. Artifacts are local deliverables; registry names are not reserved or published.

## Install all local dependencies

Because the local names have not been published, add overrides to the consumer's `pnpm-workspace.yaml` **before** installing. Preserve existing workspace settings. This file can also be used by a single-project consumer. Replace `/absolute/latch/artifacts` with your location. On Windows use forward slashes, for example `file:C:/Projects/latch/artifacts/...`. pnpm 11 no longer reads `pnpm.overrides` from package.json; the clean-consumer test caught that difference. The [pnpm settings reference](https://pnpm.io/settings) documents the YAML configuration location.

```yaml
overrides:
  '@latch-local/contracts': file:/absolute/latch/artifacts/latch-local-contracts-0.1.0.tgz
  '@latch-local/browser': file:/absolute/latch/artifacts/latch-local-browser-0.1.0.tgz
  '@latch-local/runtime': file:/absolute/latch/artifacts/latch-local-runtime-0.1.0.tgz
  '@latch-local/react': file:/absolute/latch/artifacts/latch-local-react-0.1.0.tgz
  '@latch-local/test': file:/absolute/latch/artifacts/latch-local-test-0.1.0.tgz
  '@latch-local/cli': file:/absolute/latch/artifacts/latch-local-cli-0.1.0.tgz
```

Then use the two `pnpm add` commands in the README with the same absolute paths. Place contracts/browser/runtime/react in dependencies and test/cli in devDependencies. Your React/Vite project must already have React, React DOM, TypeScript, their type declarations, and Vite. Latch does not overwrite your package manifest or application build setup. Test tooling needs Playwright (included transitively); either select installed Chrome or install Chromium with `pnpm exec playwright install chromium`.

`node scripts/consumer.mjs <new-folder-outside-checkout>` is an executable reference for constructing overrides, installing these artifacts and validating generated integrations without workspace package links. It intentionally creates a new consumer rather than changing an existing project. The report records tarball hashes and the installed CLI/browser results.

## Supported and tested versions

Node 22+ required. TypeScript-aware generation ships with TypeScript 5.9.3. Generated examples were compiled with TypeScript 5.9.3; older compiler compatibility is not claimed. React peer range is 18.2 through 19.x; the actual recorded React version is 19.2.4. Vite 7.3.1 is tested. Vite's ES module and top-level-await support is required for the development integration. Other bundlers and frameworks are deferred.

Windows, Node 24.19.0 and pnpm 11.19.0 were exercised locally, including artifact installation and native browser checks. The [GitHub Linux CI run](https://github.com/agammann/latch/actions/runs/34552048479) passed dependency installation, build, all 23 unit/integration tests and the handler browser lane using Node 22 and pnpm 10.17.1. macOS remains unverified. Linux CI does not establish native WebMCP support or a Linux tarball consumer run. `--ignore-scripts` works for this pinned dependency set because the platform esbuild package includes its executable. It also avoids interactive build-script approval differences between pnpm versions.

## Native configuration

Set `browser.channel` to `chrome` and `browser.native` to `true` for the verified flagged Chrome lane. A test with `mode: "native"` is required to produce native invocation evidence. When testing ordinary handler behavior without a native browser, use `browser.native: false` and handler-mode cases; native-mode cases remain blocked if the API is absent. Never remove required native cases merely to turn a native release check green.

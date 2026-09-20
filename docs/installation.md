# Install Latch in your React/Vite project

[Documentation index](README.md) · [Binding and contract reference](integration.md)

Use this guide after downloading an integration from Studio, or when configuring Latch directly in your application. Run the commands below from **your application's root**, unless a step explicitly says to use the Latch repository.

## Before you begin

You need Node 22+, pnpm 10.17.1+, and an existing React/TypeScript/Vite project that already builds. Keep React, React DOM, TypeScript, their type declarations, and Vite in that project's dependencies. Latch does not create an application or replace your build configuration.

The generator compiles against your `tsconfig.json`. The tested setup uses TypeScript 5.9.3, React 19.2.4, and Vite 7.3.1. Generated code uses `import.meta.env` and top level await; use Vite client types and an ES2022 or newer build target if your application's configuration requires those settings explicitly. Other frameworks and bundlers are not covered by this release.

## 1. Obtain the six packages

Choose one source:

1. **From Studio:** open [Latch Studio](https://latch-studio.alx21.chatgpt.site), select **Project setup**, then **Download runtime packages**. Extract the ZIP. It contains six `.tgz` files and `SHA256SUMS`.
2. **From this repository:** follow the checkout and dependency steps in the [example quickstart](quickstart.md), then run `pnpm build` and `pnpm pack:local` from the Latch repository root. The tarballs are written to `artifacts/`.

In your application, create `vendor/latch/` and copy all six tarballs into it. Keep the `.tgz` files intact; pnpm installs them directly. The following steps assume this directory structure:

```text
your-app/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  src/
  vendor/latch/
    latch-local-contracts-0.1.0.tgz
    latch-local-browser-0.1.0.tgz
    latch-local-runtime-0.1.0.tgz
    latch-local-react-0.1.0.tgz
    latch-local-test-0.1.0.tgz
    latch-local-cli-0.1.0.tgz
```

For a pnpm workspace, put the overrides in the workspace root's `pnpm-workspace.yaml` and resolve their paths relative to that root. Run package installation commands in the application package. The example above assumes a single application root.

## 2. Configure overrides before installation

Add these entries to your application's `pnpm-workspace.yaml`. If the file exists, merge the entries into its existing `overrides` mapping and preserve other settings. Otherwise create it with this content:

```yaml
overrides:
  '@latch-local/contracts': file:./vendor/latch/latch-local-contracts-0.1.0.tgz
  '@latch-local/browser': file:./vendor/latch/latch-local-browser-0.1.0.tgz
  '@latch-local/runtime': file:./vendor/latch/latch-local-runtime-0.1.0.tgz
  '@latch-local/react': file:./vendor/latch/latch-local-react-0.1.0.tgz
  '@latch-local/test': file:./vendor/latch/latch-local-test-0.1.0.tgz
  '@latch-local/cli': file:./vendor/latch/latch-local-cli-0.1.0.tgz
```

All six overrides are required because the packages depend on one another and are not published to a registry. Do not put these overrides only in `package.json`; pnpm 11 uses the workspace YAML settings. See the [pnpm settings reference](https://pnpm.io/settings).

Now install the browser dependencies and developer tools:

```sh
pnpm add --ignore-scripts ./vendor/latch/latch-local-contracts-0.1.0.tgz ./vendor/latch/latch-local-browser-0.1.0.tgz ./vendor/latch/latch-local-runtime-0.1.0.tgz ./vendor/latch/latch-local-react-0.1.0.tgz
pnpm add -D --ignore-scripts ./vendor/latch/latch-local-test-0.1.0.tgz ./vendor/latch/latch-local-cli-0.1.0.tgz
pnpm exec latch --version
```

The version command should print `0.1.0`. The Latch tarballs are prebuilt and need no installation scripts. These commands skip dependency lifecycle scripts for this installation; keep your existing application's build dependencies configured separately. This also avoids pnpm 11 stopping on an unapproved dependency build script. Retain the tarballs at their configured paths for future installs. Registry lookups for `@latch-local/*` usually mean an override is missing or points at the wrong directory.

## 3. Add your configuration and mount marker

**If you used Studio:** extract the integration ZIP, copy `latch.config.json` to your application root, and keep its `preview/` directory outside application source. Follow `INSTALL.md` for your specific mapping. Do not run `latch init` over the downloaded configuration.

**If you are starting manually:** run `pnpm exec latch init`, then fill in the configuration using the [integration guide](integration.md). Init creates empty tools and tests intentionally; that scaffold cannot pass validation until you add a real binding, contract, and regression case.

For either path, add exactly one `// @latch:mount` marker inside the owning React component, after any callbacks it needs and before conditional returns. The component's file must match `installation.file`. For React bindings, the callback must be in scope there. Use your actual handler name and source path, and replace sample expectations with results your application really returns.

## 4. Generate, review, and apply

From your application root:

```sh
pnpm exec latch inspect
pnpm exec latch generate
pnpm exec latch check
```

`inspect` only suggests source candidates; it does not change bindings. Successful generation reports that the integration was generated and type checked. Review `src/latch.generated/integration.ts` and `.latch/installation.diff`. Then apply the reviewed change:

```sh
pnpm exec latch apply
```

The installer adds the import and hook at your marker. Keep `.latch/manifest.json`: it records the source transition needed for safe updates and rollback. See [ownership and removal](maintenance.md) before editing generated files or changing callback bindings.

## 5. Start your app and run tests

Start your usual Vite development server in a separate terminal. Its origin must exactly match `baseUrl` in `latch.config.json`, including the hostname and port. For the default origin, an existing `dev` script that invokes Vite can be run as:

```sh
pnpm run dev --host 127.0.0.1 --port 5173 --strictPort
```

Test against the development server; the production build intentionally excludes the test bridge.

Choose a browser setup:

| Setup                                           | Configuration                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Installed Google Chrome, ordinary Handler tests | `"browser": { "channel": "chrome", "native": false }`                                                |
| Playwright Chromium, ordinary Handler tests     | Install Chromium as shown below, then set `"browser": { "channel": "chromium", "native": false }`    |
| Native WebMCP verification                      | Follow the separate [compatibility record](compatibility-2026-09-08.md) and configure a native test. |

For Chromium in a consumer application, add the CLI directly so `pnpm exec playwright` is available:

```sh
pnpm add -D --ignore-scripts playwright@1.58.2
pnpm exec playwright install chromium
```

Use `--with-deps chromium` on Linux when system dependencies are required. Then run:

```sh
pnpm exec latch test
```

Expect every configured case to pass with zero failures or blocked cases. Results are written to `.latch/report.json` and `.latch/report.txt`. A sample matching its schema in Studio does not guarantee this test will pass; the actual handler and expected result must agree.

Optionally run `pnpm exec latch dev` and open **http://127.0.0.1:4545** for the local console. Keep the application server running separately. Stop both processes with Ctrl+C when finished.

## Supported and measured versions

React's declared peer range is 18.2 through 19.x; the recorded release used React 19.2.4. Generation uses TypeScript 5.9.3. Windows verification used Node 24.19.0 and pnpm 11.19.0, including package installation and native browser tests. The [recorded Linux CI run](https://github.com/agammann/latch/actions/runs/34552048479) used Node 22 and pnpm 10.17.1. macOS remains unverified. Ordinary Linux Chromium tests do not establish native WebMCP compatibility.

For package internals and fresh consumer verification, see the [development guide](../CONTRIBUTING.md). For setup failures, see [Troubleshooting](troubleshooting.md).

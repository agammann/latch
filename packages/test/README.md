# @latch-local/test 0.1.0

Part of Latch: Connect your site. Verify every action.

Local distribution package. Requires Node 22+ for developer tooling; React bindings support React 18.2–19.x (19.2.4 tested). See https://github.com/agammann/latch for setup, bounded schema contracts, integration examples, native compatibility, lifecycle semantics, testing and removal instructions.

Install from the six locally built tarballs with pnpm overrides, as described in the repository's docs/installation.md. Registry name availability is not claimed. No open-source license has been selected; UNLICENSED prevents an accidental license grant.

Developer-only package. Keep it in devDependencies.

The ./bridge export is an opt-in development module. Load only within import.meta.env.DEV and restrict it to explicitly configured loopback origins. The default export contains the Node Playwright runner.

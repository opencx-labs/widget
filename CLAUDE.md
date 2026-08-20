# OpenCX Widget Monorepo

## Versioning policy

All publishable widget packages MUST always share the exact same version and be published together:

- `@opencx/widget-core` (packages/core)
- `@opencx/widget-react-headless` (packages/react-headless)
- `@opencx/widget-react` (packages/react)
- `@opencx/widget` (packages/embed)

Never bump or publish a subset of them — even if only one package changed, all four get the same new version. The only exceptions are the private tooling packages `@opencx/tsconfig` and `@opencx/eslint-config`, which keep their own independent versions.

This is enforced via the `fixed` group in `.changeset/config.json` — do not remove it. When creating a changeset, include all four packages (the fixed group syncs them regardless).

## Publishing

Always commit the version bump (package.json + CHANGELOG.md changes) after publishing. A past publish from an uncommitted version bump caused the registry and the repo to disagree, which led to a version mismatch between packages.

- `pnpm cs` — create a changeset
- `pnpm csv` — apply changesets (bumps versions)
- `pnpm csp` — full check (clean, build, type-check, test) then publish

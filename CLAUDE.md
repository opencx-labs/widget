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

### When the npm account has 2FA on writes

`csp` ends in `changeset publish`, which publishes all four packages **in
parallel**. If the publishing account has two-factor set to "authorization and
writes", each of those four authenticates separately and npm rate-limits the
one-time-password endpoint: `E429 ... rate limited otp`, nothing published.
That is what happened cutting `5.0.0-beta.0`.

Run the gate and the publish as two steps instead:

```bash
pnpm x                                              # the same gate csp runs
pnpm publish -r --tag beta --no-git-checks          # sequential, one package at a time
```

`pnpm publish -r` covers exactly the four publishable packages (the tooling
ones are `private`), converts their `workspace:*` deps to the real version,
and publishes them one at a time, so each one-time password is used once.

Two things that cost real time when they were guessed at:

- **Pass the tag.** An untagged publish goes to `latest` even for a
  `-beta.N` version, which would move every CDN embed onto the new major.
- **Do not pass `--otp`.** `pnpm publish -r` ignores it and prompts anyway,
  and a code generated before the command expires during packing. Wait for
  `Enter OTP:`, then read a fresh code.

Re-running is safe: already-published versions are skipped, so a partial
publish finishes by running the same command again.

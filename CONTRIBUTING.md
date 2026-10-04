# Contributing to EmVB

Thanks for helping. [AGENTS.md](AGENTS.md) is the full guide to commands, tests and code style. This page covers the essentials.

## Set up

You need [Bun](https://bun.sh) 1.4.2 or later and Node 24. End-to-end tests use Chromium at `/usr/bin/chromium`, or the binary in `EMVB_CHROMIUM`.

```bash
bun install
bun run demo:node    # http://127.0.0.1:4411
```

## Before you open a pull request

```bash
bun run check                                   # lint, format, types, dead code, unit and Astro tests
bun run e2e e2e/<area>.e2e.ts --project=node    # the e2e specs for what you touched
```

- **Tests prove themselves.** Every new or changed test needs a seeded bug in `scripts/seeded-bugs.json` that makes it fail. Run it with `bun run seeded-bugs --only <id>`.
- Never weaken, skip or delete a failing test. Fix the code, or explain why the test is wrong.
- `packages/emvb/src/core` stays free of React, Astro, EmDash, Cloudflare and `node:*` imports. Oxlint and Fallow check this.
- Every string in a layout is untrusted. Output goes through the core serializer and the CSS sanitizers.

## Commits

Keep commits small, one change each, in the form `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs: …` or `chore: …`.

## Security

Please report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.

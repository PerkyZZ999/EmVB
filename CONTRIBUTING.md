# Contributing to EmVB

Thanks for helping. This page covers setup, the checks to run, code style and common problems.

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

## Troubleshooting

- **The Node demo exits with `null is not an object (evaluating 'server.address.port')` or `transport was disconnected`.** Use `bun run demo:node`, which runs Astro on Node. Forcing Bun with `bun --bun astro dev` can trigger a restart during Astro's first update check on macOS. Bun still handles installs, tests and the Node demo's build and production server.
- **The first admin load after a dev-server start shows "Loading EmDash..." or a hydration error.** Reload; `e2e/auth.setup.ts` retries until two clean loads.
- **Don't run `astro build` for a demo while its dev server is running.** It can leave the dev admin unable to hydrate; restart the dev server.
- **Port already in use** (4411, 4412, 4421, 4422): a demo is still running. Stop it, or run Playwright without `CI=1` to reuse it.
- **A failing `bun test` prints megabytes of object dump:** an assertion was given a DOM element. Assert on its markup or on a boolean instead.
- **workerd crashes with `SIGXFSZ`:** a file-size limit (`ulimit -f`) is set in your shell. Don't limit file size or address space when running the demos or e2e; cap memory instead if you need to.
- **Playwright failures** keep a trace in `test-results/<test>/trace.zip`.

## Security

Please report vulnerabilities privately, as [SECURITY.md](SECURITY.md) describes.

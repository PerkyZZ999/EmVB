# Contributing to EmVB

Thanks for helping. This page covers setup, the checks to run, code style and common problems.

## Set up

You need [Bun](https://bun.sh) 1.4.3 or later and Node 24. End-to-end tests use Chromium at `/usr/bin/chromium`, or the binary in `EMVB_CHROMIUM`.

```bash
bun install
bun run demo:node    # http://127.0.0.1:4411
```

## Before you open a pull request

```bash
bun run check                                   # lint, format, types, dead code, runtime and seed checks, unit and Astro tests
                                              # GitHub CI runs those same checks
bun run e2e e2e/<area>.e2e.ts --project=node    # the e2e specs for what you touched
```

- **Tests prove themselves.** Every new or changed test needs a seeded bug in `scripts/seeded-bugs.json` that makes it fail. Run it with `bun run seeded-bugs --only <id>`.

### Running seeded bugs fast

```bash
bun run seeded-bugs --only <id>                  # one seed (or every id containing the text)
bun run seeded-bugs --changed-since <git ref>    # every seed that edits a file changed since the ref
bun run seeded-bugs --changed-since <ref> --list # just list them
bun run seeded-bugs                              # all of them
```

- Unit seeds run in parallel git worktrees (a quarter of the cores, at most 4; `--jobs <n>` to change). Each seed is still applied alone and must make its test fail.
- e2e seeds run in parallel lanes (`--e2e-lanes <n>`, default a quarter of the cores, at most 4), each with its own worktree and demo ports (4411/4412, then 4511/4512, 4611/4612…; production servers 10 above). Each lane keeps one Node dev server up and signs in once. A seed's test runs only once a dev-only probe (`scripts/seed-probe.ts`, copied into the lane's worktree, never into the demo) shows the server has the mutation, and the next seed waits until it shows the restore. After each test file's seeds, the tests that caught them run again on the clean code; a catch counts only if its test passes there. Anything not proven that way, and every `e2e:prod` seed, runs on a fresh server. `--cold-e2e` gives every e2e seed its own fresh server (the 1.1.0 release gate's mode); `--one-lane-e2e` runs them one at a time in the repo itself.
- Benchmark seeds run alone at the end. Every run starts with a self-check: a known seed must be caught and a no-op seed must escape.
- `--cache` skips seeds already caught with the same seed, edited files and test files. Use it while iterating, not for a release.
- Stop your own demo servers on those ports first; the runner refuses to start on a busy port.
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

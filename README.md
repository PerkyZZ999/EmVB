# EmVB

A visual page builder plugin for [EmDash CMS](https://github.com/emdash-cms/emdash) 0.41.x. Pages are built in a full-screen editor inside the EmDash admin and published as plain HTML and CSS, with no EmVB JavaScript on the public site. It runs on Node (SQLite) and Cloudflare Workers (D1).

**Status:** early development (slice S1: one container and one heading, end to end). Not published yet.

## Quick start

Needs [Bun](https://bun.sh) and Node, because the Cloudflare demo and Playwright run on Node. Verified with Bun 1.4.2 and Node 24.21. End-to-end tests use the system Chromium at `/usr/bin/chromium`, or the binary in `EMVB_CHROMIUM`.

```bash
bun install
bun run check        # lint, format, types, dead code, unit and Astro tests
bun run demo:node    # Node demo on http://127.0.0.1:4411
```

1. Sign in to the demo admin (dev only): <http://127.0.0.1:4411/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin>
2. Open **Visual pages** and click **Set up EmVB**.
3. Click **New page**, edit the heading, and **Publish**. The page is served at `http://127.0.0.1:4411/<slug>`.

The Cloudflare demo runs the same way with `bun run demo:cf` on port 4412.

## More

- [AGENTS.md](AGENTS.md): commands, tests, code style and project rules.
- [docs/project/](docs/project/): requirements, decisions, architecture and validation evidence.
- [docs/system/layout-format.md](docs/system/layout-format.md): how pages and the design system are stored.

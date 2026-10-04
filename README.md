# EmVB

A visual page builder plugin for [EmDash CMS](https://github.com/emdash-cms/emdash) 1.0.x. Pages are built in a full-screen editor inside the EmDash admin and published as plain HTML and CSS, with no EmVB JavaScript on the public site except the optional popups and tabs scripts, which load only on pages that have a popup or Tabs. Forms use the forms plugin's own script. It runs on Node (SQLite) and Cloudflare Workers (D1).

**Status:** MVP implement slices S1–S6 complete. The source can be published on GitHub. The npm package stays private until release (D-007).

![The EmVB editor: the element tree, the canvas and the Style panel](site/public/screenshots/editor-1600.webp)

## Features

- **Editor:** drag, drop and nest elements; edit text on the canvas; copy, paste, undo and redo; preview desktop, tablet and mobile.
- **Elements:** containers (flexbox or CSS Grid), sections, headings, text, lists, links, buttons, images, video, icons, dividers, spacers, tabs, accordions, popups, forms, and post fields for theme templates.
- **Styling:** Hover, Focus and Active states with transitions, per-device styles and hide on device, backgrounds with gradients and overlays, entrance animations, custom attributes.
- **Site styles:** variables, classes in a clear priority order, tag defaults, changes staged until **Publish styles**, import and export as JSON.
- **Theme Builder:** headers, footers, Error 404, Search Results, Single Page, Single Post, Archive, Loop Item and popups, with display conditions.

More screenshots are in [`site/public/screenshots/`](site/public/screenshots/), and the project site in `site/` shows them all.

## Quick start

Needs [Bun](https://bun.sh) and Node, because the Cloudflare demo and Playwright run on Node. Verified with Bun 1.4.2 and Node 24.21. End-to-end tests use the system Chromium at `/usr/bin/chromium`, or the binary in `EMVB_CHROMIUM`.

```bash
bun install
bun run check        # lint, format, types, dead code, unit and Astro tests
bun run demo:node    # Node demo on http://127.0.0.1:4411
```

1. Sign in to the demo admin (dev only): <http://127.0.0.1:4411/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin>
2. Open **Pages VisualBuilder** and click **Set up EmVB**.
3. Click **New page**, edit the heading, and **Publish**. The page is served at `http://127.0.0.1:4411/<slug>`.

The Cloudflare demo runs the same way with `bun run demo:cf` on port 4412.

## Use it in your EmDash site

EmVB isn't on npm yet. To try it in a host site, follow [docs/guides/install-in-a-host-site.md](docs/guides/install-in-a-host-site.md). The demos in `demos/node` and `demos/cloudflare` are complete host sites; their `src/pages/[slug].astro` shows the public route.

## Development and testing

| Task                                                 | Command                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Lint, format, types, dead code, unit and Astro tests | `bun run check`                                              |
| Unit tests only                                      | `bun run test`                                               |
| End to end, both demos (Playwright)                  | `bun run e2e`                                                |
| Public pages on production builds                    | `bun run e2e:prod`                                           |
| Seeded bugs (prove the tests catch real defects)     | `bun run seeded-bugs`                                        |
| Project site                                         | `bun run site` (http://127.0.0.1:4455), `bun run site:build` |

[AGENTS.md](AGENTS.md) has the full guide: commands, test layout, code style and troubleshooting. [CONTRIBUTING.md](CONTRIBUTING.md) covers pull requests, and [SECURITY.md](SECURITY.md) how to report a vulnerability.

## Docs

- [docs/system/layout-format.md](docs/system/layout-format.md): how pages and the design system are stored.
- [docs/system/theme-parts.md](docs/system/theme-parts.md): theme parts, conditions, triggers and dynamic data.
- [docs/DESIGN.md](docs/DESIGN.md): the editor's UI rules.
- [docs/project/](docs/project/): requirements, decisions, architecture, work items and validation evidence.
- [CHANGELOG.md](CHANGELOG.md).

## License

No license has been chosen yet. Until a `LICENSE` file is added, the code is visible but not licensed for reuse.

## Before a public GitHub push

Pushing this repository is not an npm publish. D-007 still keeps the `emvb` package private.

- [ ] Add a `LICENSE` file and a matching `license` field in `packages/emvb/package.json`, then update the License section above.
- [ ] Replace `OWNER` in the `repository` URL in `packages/emvb/package.json`.
- [x] No Cloudflare `database_id`, KV id or API token is committed. `demos/cloudflare/wrangler.jsonc` names the local D1 database only.
- [x] `.env`, `.dev.vars`, local databases, `demos/*/.wrangler/`, build output and Playwright auth state are gitignored; nothing generated or local is tracked.
- [ ] Decide whether the internal notes stay public: `docs/HANDOFF.md`, `docs/project/STATE.md` and `docs/project/VALIDATION.md` mention this machine, and every commit carries the author's email address.

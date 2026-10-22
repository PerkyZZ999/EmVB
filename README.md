# EmVB

[![Website](https://img.shields.io/badge/website-emvb.dev-1f6feb)](https://emvb.dev) [![npm](https://img.shields.io/npm/v/@perkyzz/emvb)](https://www.npmjs.com/package/@perkyzz/emvb)

EmVB is a visual page builder plugin for [EmDash CMS](https://github.com/emdash-cms/emdash). You build pages in a full-screen editor inside the EmDash admin, and EmVB publishes them as plain HTML and CSS. It runs wherever EmDash runs: Node with SQLite, or Cloudflare Workers with D1.

Try it without installing anything in the [playground](https://emvb.dev/playground): the real editor and a starter page, in your browser. Your edits stay on your device.

![The EmVB editor: the element tree, the canvas and the Style panel](site/public/screenshots/editor-1600.webp)

**Current release:** 0.8.0. It adds saved sections, Loop forever for icon animations, and Recipe and Zoom in the image editor. Layout schema 17, design schema 16. See the [changelog](CHANGELOG.md) for every release.

## Requirements

- **EmDash 1.3.x.** EmVB 0.8.0 is built and tested against EmDash 1.3.1. Its peer range is `emdash` ^1.0.0.
- **Astro 7, up to 7.3.5.** Astro 7.3.6 and later need a newer zod than EmDash pins, which breaks type checking of plugin routes. Keep `astro` at 7.3.5 until EmDash moves its pin.
- **React 19**, `@cloudflare/kumo` 2.6.0 and `@phosphor-icons/react` ^2.1.10. An EmDash site already has these.
- **Optional:** `@emdash-cms/plugin-forms` ^0.2.9 for forms.
- **AI agents need EmDash 1.2 or later** with `mcp: true`. The local bridge needs Node 20 or later on the agent's computer.

## Install

1. Add the package:

   ```bash
   npm i @perkyzz/emvb
   ```

   This also installs [`@perkyzz/emvb-icons`](packages/emvb-icons/), the icon sets for the editor's Icon library. It's a regular dependency pinned to an exact version, so you don't install or import it yourself. Only the editor loads it; a placed icon is saved into the page as SVG.

2. Register the plugin next to your other EmDash plugins in `astro.config.mjs`:

   ```js
   import { emvb } from "@perkyzz/emvb";

   export default defineConfig({
     integrations: [
       emdash({
         plugins: [emvb()],
         // …database, storage…
       }),
     ],
   });
   ```

3. Add the public route that serves EmVB pages (`src/pages/[slug].astro`). The [package README](packages/emvb/README.md#serve-emvb-pages) has the full route, and the demos in `demos/node` and `demos/cloudflare` are complete host sites.

4. Sign in as an admin, open **Pages VisualBuilder** and click **Set up EmVB** once.

The [install guide](docs/guides/install-in-a-host-site.md) covers each step in detail, plus runtimes, visitor data and loading your site's stylesheets into the editor canvas.

## AI agents (MCP)

Agents can build and edit draft EmVB pages, either through EmDash's own MCP endpoint (`/_emdash/api/mcp`) or through the local bridge:

```bash
EMVB_TOKEN=<token> npx -y @perkyzz/emvb-mcp --site https://your.site
```

- **Turn it on:** an admin enables agents in **Pages VisualBuilder → AI agents** (off by default) and approves the EmVB tools on EmDash's Plugins screen.
- **Token:** an EmDash API token with the `mcp:tools:emvb` scope, for an editor. Never give an agent an admin token.
- **Limits:** agents change drafts only, unless an admin allows publishing. Each token may make 300 reads and 60 changes a minute and 10 publishes an hour. Every agent change shows in the version timeline with an **Agent** badge.
- **Agent Skill:** the bridge ships the `emvb-page-builder` skill with its references (in [`packages/emvb-mcp/skill/`](packages/emvb-mcp/skill/)), along with the layout and style schemas and prompts such as `build_landing_page` and `fix_accessibility`.

See the [bridge README](packages/emvb-mcp/README.md) and the [MCP guide](docs/guides/mcp.md).

## Features

**Editor**

- Drag, drop and nest elements; edit text on the canvas; copy, paste, undo and redo.
- Preview desktop, tablet and mobile.
- A command palette, a version timeline that restores a whole version or one section, and shareable playground links.

**Elements**

- Layout: sections, containers (flexbox or CSS Grid), dividers and spacers.
- Content: headings, text, lists, links, buttons (with an optional icon), images, video and icons.
- Interactive: tabs, accordions, a table of contents, menus, popups, floating bars and forms.
- Data: loops, pagination, and post fields for theme templates.

**Styles and classes**

- Site styles: variables (including fluid type and spacing), classes in a clear priority order, and tag defaults. Changes are staged until **Publish styles**, and you can import and export them as JSON.
- Per element: Hover, Focus and Active states with transitions, per-device styles and hide on device, container queries, text direction, backgrounds (image, video, gradient, overlay), entrance animations and scroll motion, custom attributes and print styles.

**Saved sections**

Save any element as a section and reuse it from **My sections**, as an independent copy or synced everywhere you use it. See the [saved sections guide](docs/guides/saved-sections.md).

**Image editor**

Edit a library picture without leaving the admin: crop, adjust, filters, curves, blur and metadata, then save it as a copy. Download your edits as a recipe and load one back. Images also take a link, a caption, a focal point and extra sizes for `srcset`. See the [image editor guide](docs/guides/image-editor.md).

**Icons**

An Icon library of 14,480 icons from Lucide, Font Awesome Free, Tabler and Remix Icon, plus your own uploads. Icons can be styled and animated with CSS; Loop forever keeps a spinner turning. See the [icon library guide](docs/guides/icon-library.md).

**Theme Builder**

Headers, footers, Error 404, Search Results, Single Page, Single Post, Archive, Loop Item, synced sections, page templates, popups and floating bars, each with display conditions.

**Live data and personalization**

Bind text and images to a post, a site setting or a URL parameter. Show content by visitor rules (country, device, new or returning, hours, and segments your site passes), and run A/B tests decided on the server.

**Checks while you build**

- **Accessibility check:** a score and a list of issues (alt text, headings, link and field names, contrast, new-tab links, landmarks), most with a one-click fix.
- **Page weight:** the perf meter shows a page's HTML, CSS, JavaScript and image bytes against their budgets.

**Light public pages**

Published pages are plain HTML and CSS. The only EmVB scripts on the public site are the small runtimes for popups, floating bars, tabs and menus, and each loads only on pages that use it. Forms use the forms plugin's own script.

## Development

You need [Bun](https://bun.sh) 1.4.3 or later and Node 24. End-to-end tests use Chromium at `/usr/bin/chromium`, or the binary in `EMVB_CHROMIUM`.

```bash
bun install
bun run check        # lint, format, types, dead code, runtime and seed checks, unit and Astro tests
bun run demo:node    # Node demo on http://127.0.0.1:4411
```

To try the editor locally, sign in to the demo admin with the dev-only link <http://127.0.0.1:4411/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin>, open **Pages VisualBuilder** and click **Set up EmVB**. The Cloudflare demo runs with `bun run demo:cf` on port 4412.

| Task                                             | Command                                                      |
| ------------------------------------------------ | ------------------------------------------------------------ |
| All offline checks                               | `bun run check`                                              |
| Unit tests only                                  | `bun run test`                                               |
| End to end, both demos (Playwright)              | `bun run e2e`                                                |
| Public pages on production builds                | `bun run e2e:prod`                                           |
| Seeded bugs (prove the tests catch real defects) | `bun run seeded-bugs`                                        |
| Project site (source in `site/`)                 | `bun run site` (http://127.0.0.1:4455), `bun run site:build` |

[CONTRIBUTING.md](CONTRIBUTING.md) covers setup, pull requests and troubleshooting.

## Docs

- [Install in a host site](docs/guides/install-in-a-host-site.md)
- [AI agents (MCP)](docs/guides/mcp.md)
- [Saved sections](docs/guides/saved-sections.md)
- [Image editor](docs/guides/image-editor.md)
- [Icon library](docs/guides/icon-library.md)
- [Layout format](docs/system/layout-format.md): how pages and the design system are stored.
- [Theme parts](docs/system/theme-parts.md): theme parts, conditions, triggers and dynamic data.

## Links

- Website and playground: <https://emvb.dev>
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md): how to report a vulnerability privately.
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE) © 2026 Charles Wilkin.

The Icon library uses icons from [Lucide](https://lucide.dev) (ISC), [Font Awesome Free](https://fontawesome.com) (icons [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), by Fonticons, Inc.), [Tabler Icons](https://tabler.io/icons) (MIT) and [Remix Icon](https://remixicon.com) 4.8.0 (Apache-2.0). See [packages/emvb/THIRD_PARTY_NOTICES.md](packages/emvb/THIRD_PARTY_NOTICES.md).

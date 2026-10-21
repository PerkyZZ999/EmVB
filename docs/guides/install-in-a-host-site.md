# Install EmVB in a host site (R-052)

EmVB is a **native** EmDash plugin: add the package, register it in `astro.config`, and add one public route. The EmDash plugin registry installs sandboxed plugins only; native plugins like EmVB are npm packages (D-010, W-082).

Project website: <https://emvb.dev>. Package: [`@perkyzz/emvb`](https://www.npmjs.com/package/@perkyzz/emvb).

Verified against EmDash `^1.0.0` (1.0.1 and 1.2.0) and the EmVB TypeScript-source package shape (no `bun build` step for the plugin).

## 1. Install the package

From your EmDash site root:

```bash
npm i @perkyzz/emvb
# or: bun add @perkyzz/emvb
```

EmVB ships TypeScript source and has no build step; your site's Vite build compiles it. Its peers are what an EmDash 1.x site already has: `emdash` ^1.0.0, `astro` ^7, `react` and `react-dom` ^19, `@cloudflare/kumo` 2.6.0 (EmDash's exact pin) and `@phosphor-icons/react` ^2.1.10. npm and Bun install missing peers on their own. EmVB currently supports Astro 7 up to 7.3.5: Astro 7.3.6 and later depend on zod ^4.6.5, while EmDash pins zod to exactly 4.5.4, and the second copy of zod breaks type checking of EmDash plugin routes. Keep your site on `astro` 7.3.5 for now; this will be widened once EmDash moves its zod pin.

It also installs two dependencies: `zod` and `@perkyzz/emvb-icons`, the icon sets for the editor's Icon library (pinned to the exact version EmVB was built with). Only the editor loads the icon sets; a placed icon is saved into the page as SVG, so public pages never fetch them.

Optional (forms on EmVB pages):

```bash
bun add @emdash-cms/plugin-forms@0.2.9
```

## 2. Register the plugin

In `astro.config.mjs` (or `.ts`), add EmVB next to your other plugins:

```js
import { emvb } from "@perkyzz/emvb";
import { formsPlugin } from "@emdash-cms/plugin-forms"; // optional

export default defineConfig({
  integrations: [
    emdash({
      plugins: [formsPlugin(), emvb()],
      // …adapters…
    }),
  ],
});
```

### Your site's styles in the editor canvas

The editor canvas is a sandboxed frame, so it doesn't see your layout's stylesheets or fonts. Pass them as `canvasStyles` and the canvas loads them before EmVB's own CSS, so pages look in the editor as they do on your site:

```js
emvb({
  canvasStyles: ["/styles/site.css", "https://fonts.googleapis.com/css2?family=Inter&display=swap"],
});
```

- Use `https:` (or `http:`) URLs or site paths starting with `/`. Anything else (`javascript:`, `data:`, `//host`, relative paths) is ignored. At most 10.
- EmVB's CSS comes after them, so an element's own styles and your Site styles still win.
- The canvas runs no scripts, so script-loaded fonts won't apply; use a stylesheet with `@font-face` or a font service's CSS URL.
- The demo sites load their `public/site.css` this way.

## 3. Public route

Copy the pattern from EmVB’s demos (`demos/node/src/pages/[slug].astro`): try `resolveEmVBPage` first, then fall through to the site’s own pages, and rewrite to `/404` when neither matches.

```astro
---
import { getEmDashEntry, getSeoMeta, decodeSlug, getSiteSettings } from "emdash";
import { EmVBPage, resolveEmVBPage } from "@perkyzz/emvb/astro";
import { EmVBFormsRuntime } from "@perkyzz/emvb/astro/forms/client"; // only with @emdash-cms/plugin-forms
import { EmVBMenuRuntime } from "@perkyzz/emvb/astro/menu";
import { EmVBTabsRuntime } from "@perkyzz/emvb/astro/tabs";
// …site layout…

const emvb = await resolveEmVBPage(Astro);
if (!emvb && !(await getEmDashEntry("pages", decodeSlug(Astro.params.slug)))) {
  return Astro.rewrite("/404");
}
---

{emvb ? (
  <EmVBPage page={emvb}>
    {emvb.needsFormsRuntime && <EmVBFormsRuntime />}
    {emvb.needsTabsRuntime && <EmVBTabsRuntime />}
    {emvb.needsMenuRuntime && <EmVBMenuRuntime />}
  </EmVBPage>
) : (
  /* site page */
  null
)}
```

A fixed route has no slug parameter, so pass the page’s slug instead. To serve the EmVB page `home` at `/`, in `src/pages/index.astro`:

```astro
---
import { EmVBPage, resolveEmVBPage } from "@perkyzz/emvb/astro";
import { EmVBFormsRuntime } from "@perkyzz/emvb/astro/forms/client"; // only with @emdash-cms/plugin-forms
// …site layout…

const emvb = await resolveEmVBPage(Astro, { slug: "home" });
if (!emvb) return Astro.rewrite("/404");
---

<EmVBPage page={emvb}>{emvb.needsFormsRuntime && <EmVBFormsRuntime />}</EmVBPage>
```

Mount the tabs and menu runtimes here too, as above. Until a page with the slug `home` is published (step 4), `/` returns 404; if the site has its own home content, fall through to it instead, as the `[slug]` route does. The `[slug]` route still serves the same page at `/home`, so redirect that path or set the page’s canonical URL to `/`.

Blank-canvas EmVB pages use `standalone` on `EmVBPage` (see the demos).

`@perkyzz/emvb/astro/forms` does not import the forms plugin, so a site can always import it and the build still succeeds; rendering it does nothing. When `@emdash-cms/plugin-forms` is installed, import `EmVBFormsRuntime` from `@perkyzz/emvb/astro/forms/client` instead. That subpath calls `initForms`.

Public pages are script-free except for these runtimes, and each one is mounted only when the page says it needs it: `needsFormsRuntime` (a Form element), `needsTabsRuntime` (a Tabs element, `@perkyzz/emvb/astro/tabs`) and `needsMenuRuntime` (a Menu element, `@perkyzz/emvb/astro/menu`). Theme parts report their own flags from `resolveThemeParts`, with popups (`@perkyzz/emvb/astro/popups`) and floats (`@perkyzz/emvb/astro/floats`) in addition; mount those in the site layout as `demos/node/src/layouts/Base.astro` does. See [Theme parts § Public render](../system/theme-parts.md#public-render).

### Tell EmVB what you know about the visitor

An element's **Visitors** rules can show it only to visitors in a segment, such as members or paying customers. EmVB can't know that on its own, so your route passes it:

```astro
---
const user = Astro.locals.user; // however your site knows who is signed in
const visitor = {
  segments: user ? ["member", ...(user.plan === "pro" ? ["pro"] : [])] : [],
};
const emvb = await resolveEmVBPage(Astro, { visitor });
const theme = await resolveThemeParts(Astro, undefined, { visitor }); // theme parts too
---
```

- `segments`: names your editors type in Visitors → Segments (a lowercase letter or digit, then lowercase letters, digits, `:`, `_` or `-`, up to 64 characters, so `plan:pro` works). A name that doesn't fit is dropped. A rule matches a visitor in any of its segments.
- `country` (two letters), `device` (`mobile`, `tablet`, `desktop`) and `returning` (true or false) replace what EmVB detects from the request, when your site knows better.
- Pages with Visitors rules are sent with `Cache-Control: private, no-store`, so one visitor's version is never cached for another.

## 4. First-run setup

1. Start the site (`bunx --bun astro dev` or your host’s script).
2. Sign in as an admin.
3. Open **Pages VisualBuilder** → **Set up EmVB** once (creates the hidden `emvb_pages` collection).
4. Create a page, publish it, open `/{slug}`.

## 5. Optional: AI agents (EmDash 1.2+)

Turn on EmDash's MCP server with `emdash({ mcp: true, … })`, then open **Pages VisualBuilder → AI agents** to switch agents on and approve the EmVB tools on EmDash's Plugins screen. [The MCP guide](mcp.md) covers tokens (scope `mcp:tools:emvb`, an editor user), the `@perkyzz/emvb-mcp` bridge, publishing and rate limits.

## 6. Package shape check

From the EmVB repo, to try an unreleased change in a host site:

```bash
bun pm pack --cwd packages/emvb
# In the host site: npm i /path/to/perkyzz-emvb-<version>.tgz, then apply steps 2–4.
bun run pack:smoke
```

`pack:smoke` checks that the packed package is `@perkyzz/emvb`, isn't private, exports TypeScript source for `.`, `./astro`, `./astro/forms`, `./astro/forms/client`, `./admin` and `./core`, ships no tests, and has no `workspace:` or `catalog:` ranges. The package also exports `./astro/popups`, `./astro/floats`, `./astro/tabs`, `./astro/menu` and `./mcp` (the tool definitions the `@perkyzz/emvb-mcp` bridge uses).

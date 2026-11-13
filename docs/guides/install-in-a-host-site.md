# Install EmVB in a host site (R-052)

EmVB is a **native** EmDash plugin: add the package, register it in `astro.config`, and add one public route. The EmDash plugin registry installs sandboxed plugins only; native plugins like EmVB are npm packages (D-010, W-082).

Project website: <https://emvb.dev>. Package: [`@perkyzz/emvb`](https://www.npmjs.com/package/@perkyzz/emvb).

EmVB 1.0 is verified on EmDash 1.4.0 (a fresh `create-emdash` 1.4.0 site, node and Cloudflare templates as created, with Astro 7.4.7, and again on 2026-11-09 with Astro 7.4.8 and the 1.0 extras, following this guide; 0.9.0 was verified the same way with Astro 7.3.5); earlier releases were verified on 1.0.1 and 1.2.0. The package ships TypeScript source (no `bun build` step for the plugin).

## 1. Install the package

From your EmDash site root:

```bash
npm i @perkyzz/emvb
# or: bun add @perkyzz/emvb
```

EmVB ships TypeScript source and has no build step; your site's Vite build compiles it. Its peers are what an EmDash 1.x site already has: `emdash` ^1.0.0, `astro` ^7, `react` and `react-dom` ^19, `@cloudflare/kumo` 2.6.0 (EmDash's exact pin) and `@phosphor-icons/react` ^2.1.10. npm and Bun install missing peers on their own. Keep the Astro version your EmDash site came with; you don't need to change it. A stock EmDash 1.4.0 site installs Astro 7.4.7, and EmVB builds, passes `astro check` and runs there. Your site ends up with two copies of zod (EmDash and EmVB use 4.5.4, Astro uses a newer one); that is expected and harmless.

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

### EmVB layouts on your own collections

`canvasCollections` lets entries in your own collections carry an EmVB layout, edited in place from the entry form:

```js
emvb({ canvasCollections: ["pages"] });
```

1. In the collection's schema, add a **JSON** field (for example `canvas`) and pick the **Edit with EmVB** widget (`emvb:canvas`). Or open **Host collections** in the admin (administrators): it lists your collections, adds the field with **Add canvas field**, and shows the exact `emvb({ canvasCollections: [...] })` line to paste into astro.config (EmVB can't change that file; restart or redeploy after editing it).
2. On the entry form, **Edit with EmVB** opens the full editor. **Preview** shows the unsaved layout in a sandboxed window (Desktop, Tablet, Mobile). **Apply** writes the layout back into the field; the entry's own Save and Publish store it. While the field is empty, **Convert to EmVB** starts a layout from the entry's saved rich-text body (headings, paragraphs, lists and images; other blocks are left out) without changing the body.
3. In the public route, ask for the entry's layout and fall back to your own template when the field is empty:

```astro
const emvb =
  (await resolveEmVBPage(Astro)) ??
  (await resolveEmVBPage(Astro, { collection: "pages", field: "canvas" }));
```

- Slugs must be lowercase letters, digits and `_`; `emvb_pages`, `emvb_theme_parts` and anything else are ignored. At most 20.
- Saves are checked on the server: an invalid layout is refused, and only editors and administrators can change the field (authors see a read-only summary). Since 1.1.2 this holds for every collection with an `emvb:canvas` field, listed or not.
- An AI agent publishing such an entry follows the **AI agents** publish setting, like an EmVB page.
- A hosted layout always renders in your site layout (no blank canvas mode). Preview in a field renders in the browser, so it shows dynamic data the same way the editor canvas does.
- EmVB asks for the `schema:read` capability to find your emvb:canvas fields.
- The demo sites' `pages` collection has a `canvas` field set up this way.

### Which collections Loops may list (optional)

A Loop element lists the published entries of a collection your editors pick, with fields they choose. If you keep a collection published but not meant to be listed on pages (members, internal notes), name the ones Loops may use (since 1.1.2):

```js
emvb({ loopCollections: ["posts", "team"] });
```

A Loop on any other collection then renders empty. Without the option, Loops can list any collection, as before.

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

Public pages are script-free except for these runtimes, and each one is mounted only when the page says it needs it: `needsFormsRuntime` (a Form element), `needsTabsRuntime` (a Tabs element, `@perkyzz/emvb/astro/tabs`) and `needsMenuRuntime` (a Menu element, `@perkyzz/emvb/astro/menu`). Theme parts report their own flags from `resolveThemeParts`, with popups (`@perkyzz/emvb/astro/popups`) and floats (`@perkyzz/emvb/astro/floats`) in addition; mount those in the site layout as `demos/node/src/layouts/Base.astro` does. Since 1.2, widgets with an opt-in script (a dismissible Alert) list it in `runtimes`: `EmVBPage` mounts a page's own, so a page needs no change; for theme parts, add `<EmVBWidgetRuntimes names={theme.runtimes} />` from `@perkyzz/emvb/astro/widgets` once to the site layout, and later widgets' scripts come through it too. See [Theme parts § Public render](../system/theme-parts.md#public-render).

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
- **Visitors rules are presentation, not access control.** A visitor controls their own cookies (A/B arm, returning visitor), and off Cloudflare and Vercel they can also send the country headers. Never hide something with a Visitors rule that a visitor mustn't see.
- **Country detection (since 1.1.2).** EmVB reads `cf-ipcountry` only on Cloudflare Workers and `x-vercel-ip-country` only on Vercel, where the edge sets them, plus Cloudflare's `request.cf`. Behind your own proxy that sets one of these headers and strips the visitor's copy, add `emvb({ trustGeoHeaders: true })`; `false` never reads them. Or pass `country` yourself as above.

### Moving your site from EmDash 1.4 to 1.5

EmVB needs no change for EmDash 1.5. Upgrade EmDash the usual way (with the Cloudflare adapter, upgrade `emdash` and `@emdash-cms/cloudflare` together); on its first start EmDash 1.5 runs its own migrations, and your EmVB pages, theme parts, Site styles, uploaded icons, agent settings and requests carry over (checked on Node with SQLite and on Cloudflare with D1, `bun run check:upgrade` in EmVB's repository).

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

## Responsive images (optional)

EmDash 1.4 doesn't store extra sizes for library images; it builds them at render time through
Astro's image service. EmVB can do the same for library Images on its pages. Pass Astro's
`getImage` and authorise your own origin so the service will resize the files:

```astro
---
import { getImage } from "astro:assets";
const emvb = await resolveEmVBPage(Astro, { getImage });
---
```

```js
// astro.config.mjs
image: { remotePatterns: [{ protocol: "https", hostname: "example.com" }] },
```

An Image with a width and height, from the library, and without sizes of its own gets up to six
srcset sizes (up to twice its width). Without `getImage`, or when the service leaves the URL
unchanged, the plain `<img>` is published as before. A picked library image also takes the focal
point set on it in EmDash's media library.

## Languages (optional)

EmVB follows EmDash's translations: each language of a page is its own entry (D-068), with its own
layout. With Astro's `i18n` set up, `resolveEmVBPage(Astro)` reads the page in `Astro.currentLocale`
(or pass `locale`). When that language has no translation, EmDash serves the next one in its
fallback chain and the result says so in `fallbackLocale`, so the route can show a note and keep
the page's real language in `<html lang>`:

```astro
---
const emvb = await resolveEmVBPage(Astro, { getImage });
if (!emvb) return Astro.rewrite("/404");
---
<Base lang={emvb.fallbackLocale ?? emvb.locale}>
  {emvb.fallbackLocale && <p>This page isn't translated yet; here is the original.</p>}
  <EmVBPage page={emvb} />
</Base>
```

Keep `routing: { prefixDefaultLocale: false }`: prefixing the default locale breaks EmDash's admin.
The default language stays at `/`, others under their prefix (for example `src/pages/fr/[slug].astro`).
Header, footer and other theme parts are shared by every language for now.

The **Language switcher** element links the page's other published languages, each in its own
name with `hreflang`, the shown one marked current; drafts are never linked. `resolveEmVBPage`
fills it, linking the default language at `/<slug>` and others at `/<locale>/<slug>`; pass
`translationHref` when your routes differ. For a switcher in a header or footer, pass the page's
list to the theme parts:

```ts
const theme = await resolveThemeParts(Astro, ctx, { translations: emvb?.translations });
```

In the editor, **Page settings → Languages** lists the site's languages. **Translate** makes a
draft in that language linked to this page, with a copy of its layout, and opens it; with **Ask my
agent to translate the new page** ticked, it also sends your agent a request (see the AI agents
guide) whose proposal you review in the new page's Agent tab. Only words are meant to change:
texts, buttons, alt text, labels and placeholders. Form field names, links and images stay.

## Archive page counts (optional)

EmDash doesn't report how many posts an archive has, so the Pagination element's "Page N of M"
shows "Page N" and its Last link is left out. To count, opt in where you resolve theme parts:

```ts
const theme = await resolveThemeParts(Astro, context, { pageCount: true });
```

EmVB then counts with a few one-row queries through EmDash's public collection query (about
2·log2 of the post count, none on the last page). Pass a function instead of `true` to use your
own count, for example an EmDash count API: `pageCount: async ({ collection, where }) => n`.

# Install EmVB in a host site

EmVB is a **native** EmDash plugin: add the package, register it in `astro.config`, and add one public route. The EmDash plugin registry installs sandboxed plugins only; native plugins like EmVB are npm packages.

Project website: <https://emvb.dev>. Package: [`@perkyzz/emvb`](https://www.npmjs.com/package/@perkyzz/emvb).

Verified against EmDash `^1.0.0` (1.0.1 and 1.2.0) and the EmVB TypeScript-source package shape (no `bun build` step for the plugin).

## 1. Install the package

From your EmDash site root:

```bash
npm i @perkyzz/emvb
# or: bun add @perkyzz/emvb
```

EmVB ships TypeScript source and has no build step; your site's Vite build compiles it. Its peers are what an EmDash 1.x site already has: `emdash` ^1.0.0, `astro` ^7, `react` and `react-dom` ^19, `@cloudflare/kumo` 2.6.0 (EmDash's exact pin) and `@phosphor-icons/react` ^2.1.10. npm and Bun install missing peers on their own.

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

## 3. Public route

Copy the pattern from EmVB’s demos (`demos/node/src/pages/[slug].astro`): try `resolveEmVBPage` first, then fall through to the site’s own pages, and rewrite to `/404` when neither matches.

```astro
---
import { getEmDashEntry, getSeoMeta, decodeSlug, getSiteSettings } from "emdash";
import { EmVBPage, resolveEmVBPage } from "@perkyzz/emvb/astro";
import { EmVBFormsRuntime } from "@perkyzz/emvb/astro/forms"; // only with @emdash-cms/plugin-forms
// …site layout…

const emvb = await resolveEmVBPage(Astro);
if (!emvb && !(await getEmDashEntry("pages", decodeSlug(Astro.params.slug)))) {
  return Astro.rewrite("/404");
}
---

{emvb ? (
  <EmVBPage page={emvb}>{emvb.needsFormsRuntime && <EmVBFormsRuntime />}</EmVBPage>
) : (
  /* site page */
  null
)}
```

A fixed route has no slug parameter, so pass the page’s slug instead. To serve the EmVB page `home` at `/`, in `src/pages/index.astro`:

```astro
---
import { EmVBPage, resolveEmVBPage } from "@perkyzz/emvb/astro";
import { EmVBFormsRuntime } from "@perkyzz/emvb/astro/forms"; // only with @emdash-cms/plugin-forms
// …site layout…

const emvb = await resolveEmVBPage(Astro, { slug: "home" });
if (!emvb) return Astro.rewrite("/404");
---

<EmVBPage page={emvb}>{emvb.needsFormsRuntime && <EmVBFormsRuntime />}</EmVBPage>
```

Until a page with the slug `home` is published (step 4), `/` returns 404; if the site has its own home content, fall through to it instead, as the `[slug]` route does. The `[slug]` route still serves the same page at `/home`, so redirect that path or set the page’s canonical URL to `/`.

Blank-canvas EmVB pages use `standalone` on `EmVBPage` (see the demos).

`@perkyzz/emvb/astro/forms` imports the forms plugin's client script, so import `EmVBFormsRuntime` only when `@emdash-cms/plugin-forms` is installed. Without it the build fails with `"initForms" is not exported`; drop that import and the `EmVBFormsRuntime` element.

## 4. First-run setup

1. Start the site (`bunx --bun astro dev` or your host’s script).
2. Sign in as an admin.
3. Open **Pages VisualBuilder** → **Set up EmVB** once (creates the hidden `emvb_pages` collection).
4. Create a page, publish it, open `/{slug}`.

## 5. Package shape check

From the EmVB repo, to try an unreleased change in a host site:

```bash
bun pm pack --cwd packages/emvb
# In the host site: npm i /path/to/perkyzz-emvb-<version>.tgz, then apply steps 2–4.
bun run pack:smoke
```

`pack:smoke` checks that the packed package is `@perkyzz/emvb`, isn't private, exports TypeScript source for `.`, `./astro`, `./astro/forms`, `./admin` and `./core`, ships no tests, and has no `workspace:` or `catalog:` ranges.

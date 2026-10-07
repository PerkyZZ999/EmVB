# @perkyzz/emvb

[![npm](https://img.shields.io/npm/v/@perkyzz/emvb)](https://www.npmjs.com/package/@perkyzz/emvb)

A visual page builder plugin for [EmDash CMS](https://github.com/emdash-cms/emdash) 1.0.x. Pages are built in a full-screen editor inside the EmDash admin and published as plain HTML and CSS. It runs on Node (SQLite) and Cloudflare Workers (D1).

![The EmVB editor](https://raw.githubusercontent.com/PerkyZZ999/EmVB/main/site/public/screenshots/editor-1600.webp)

## Install

```bash
npm i @perkyzz/emvb
```

Peers, which an EmDash 1.0 site already has: `emdash` ^1.0.0, `astro` ^7, `react` and `react-dom` ^19, `@cloudflare/kumo` 2.6.0 and `@phosphor-icons/react` ^2.1.10. `@emdash-cms/plugin-forms` is optional and enables forms.

## Register the plugin

```js
// astro.config.mjs
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

## Serve EmVB pages

```astro
---
// src/pages/[slug].astro
import { getEmDashEntry, decodeSlug } from "emdash";
import { EmVBPage, resolveEmVBPage } from "@perkyzz/emvb/astro";
// With @emdash-cms/plugin-forms installed and registered:
import { EmVBFormsRuntime } from "@perkyzz/emvb/astro/forms";

const emvb = await resolveEmVBPage(Astro);
if (!emvb && !(await getEmDashEntry("pages", decodeSlug(Astro.params.slug)))) {
  return Astro.rewrite("/404");
}
---

{emvb && <EmVBPage page={emvb}>{emvb.needsFormsRuntime && <EmVBFormsRuntime />}</EmVBPage>}
```

Without the forms plugin, leave out the `EmVBFormsRuntime` import and element; that subpath imports the forms plugin's client script.

Then sign in as an admin, open **Pages VisualBuilder** and click **Set up EmVB** once.

The full guide, the demos and the source are on GitHub: <https://github.com/PerkyZZ999/EmVB>.

## License

MIT. The editor's Icon library includes Lucide (ISC), Font Awesome Free (icons CC BY 4.0, by Fonticons, Inc.), Tabler Icons (MIT) and Remix Icon 4.8.0 (Apache-2.0). Their notices and license texts are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`. Icons you insert are saved into the page as SVG; a site that uses Font Awesome icons should credit Font Awesome (CC BY 4.0), for example "Icons by Font Awesome (fontawesome.com), CC BY 4.0" in its footer or credits.

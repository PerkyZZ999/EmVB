# Extensions

Extensions let a site owner add their own elements to EmVB: a pricing card in your brand, a
component set from a CSS framework, a block that shows data from your own service. An extension
is an npm package (or a folder in your repository) that you list in `astro.config`. Its elements
then appear in the editor's **Add** panel next to EmVB's own, and editors use them like any
other element.

This guide explains how extensions work and walks through writing one. The
[Extensions API reference](../EXTENSIONS.md) lists every key and limit.

## How extensions work

- **Installed in code, by the site owner.** Extensions are listed in `emvb({ extensions: [...] })`
  in `astro.config` and take effect on the next build or dev-server restart. Editors can't
  install or remove them from the admin.
- **Elements are data, output is checked.** An extension element is stored in the page like
  any other element, as `ext:<package>/<name>` with its props. Its props are checked against
  the schema the extension declares, plus EmVB's own limits, before the extension sees them.
- **Extensions render to EmVB elements, never to raw HTML.** An element's `render()` function
  returns a small tree of built-in elements (headings, text, buttons, images, boxes and so on).
  EmVB validates that tree and renders it with the same code and the same safety checks as
  editor-made content: links, image addresses and text are cleaned exactly the same way.
- **Your look, from your stylesheet.** An extension can put its own CSS classes on the elements
  it returns, from a list it declares up front, and ship a stylesheet for them. It can also ship
  a small browser script. Both are added only to pages that show one of its elements.
- **Pages never break.** If an extension is removed, or its `render()` throws, the element shows
  a short placeholder and the rest of the page renders as usual. Put the extension back and the
  element renders again, with its saved props.
- **Extension code runs in your site.** EmVB runs inside EmDash, so an extension's code is not
  sandboxed: install extensions you trust, as you would any npm package. What EmVB *does*
  guarantee is that stored data and rendered output are checked.

## Install an extension

Install the package, then list it in `emvb()`:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
// Your EmDash site already has the two lines above.
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [emvb({ extensions: [hello] })],
      // …adapters…
    }),
  ],
});
```

Restart the dev server (or rebuild and redeploy). The extension's elements appear in the
**Add** panel, in the group the extension chose, and its panels in the left panel.

The extension works the same on Node and on Cloudflare Workers, in the dev server and in
production builds, as long as it sets `module` (see below). If `astro build` can't prepare it,
for example because `node_modules` is read-only, the build stops with an error rather than
publishing a site where the elements show placeholders.

## Write an extension

The sample package [`examples/emvb-ext-hello`](../../examples/emvb-ext-hello) is a complete
extension: one element, one editor panel, one data source, a class list, a stylesheet and a
script. This walk-through builds the same thing step by step.

### 1. The package

An extension is an ES module that default-exports `defineExtension({ ... })`. Its `id` must be
the package name, without a scope:

```text
emvb-ext-hello/
  package.json        "name": "emvb-ext-hello", "type": "module"
  src/index.ts        defineExtension({ id: "emvb-ext-hello", ... })
  src/hello.css       the stylesheet (optional)
  src/hello-runtime.js  the browser script (optional)
```

List `@perkyzz/emvb` as a peer dependency (`"^1.4.0"` if you use classes, `css`, `runtime` or
`module`, which arrived in 1.4).

```ts
import { defineExtension } from "@perkyzz/emvb";

export default defineExtension({
  id: "emvb-ext-hello",
  label: "Hello",
  module: import.meta.url,
  elements: [/* step 2 */],
});
```

`module: import.meta.url` tells EmVB where the extension lives. EmVB uses it to include the
extension in your site's server build (that's what makes it render on Cloudflare Workers and in
production builds) and to find the `css` and `runtime` files. Always set it.

### 2. An element

Each element has a name, a label, a schema for its props, the fields the editor shows, optional
starting props, and a `render()` function:

```ts
import { defineExtension, type ExtensionOutputNode } from "@perkyzz/emvb";
import { newNodeId } from "@perkyzz/emvb/core";

export default defineExtension({
  id: "emvb-ext-hello",
  label: "Hello",
  module: import.meta.url,
  elements: [
    {
      name: "greeting",            // stored as ext:emvb-ext-hello/greeting
      label: "Greeting",           // shown in the Add panel
      group: "content",            // layout, content, form or dynamic
      schema: {
        type: "object",
        properties: {
          text: { type: "string", maxLength: 200, default: "Hello from an extension" },
        },
        required: ["text"],
      },
      fields: [{ key: "text", kind: "text", label: "Greeting text" }],
      defaults: () => ({ text: "Hello from an extension" }),
      render: (props) => ({
        id: newNodeId(),
        type: "div-block",
        props: {},
        children: [
          { id: newNodeId(), type: "heading", props: { text: String(props.text), level: 2 } },
        ],
      }),
    },
  ],
});
```

**The schema** is plain data, not code: `string` (with `minLength`, `maxLength`), `number`
(`min`, `max`, `integer`), `boolean`, `enum` (`values`), `array` (`items`, `maxItems`) and
`object` (`properties`, `required`), each with an optional `default`. EmVB turns it into a
validator. Stored props are checked before every render: if they don't match (a page edited by
hand, an import, an older version of your schema), `render()` gets the schema's defaults instead,
so it only ever sees props of the right shape. An AI agent's proposal with props that don't
match is refused. EmVB's own limits on text length, depth and list size always apply on top.

**The fields** are the controls in the editor's settings panel, using EmVB's own inputs:
`text`, `textarea`, `number`, `int`, `select` (with `options`), `boolean` and `href` (a link
field with EmVB's link checks). Each field edits one prop by its `key`.

**`render(props, ctx)`** receives the element's validated props and returns one node or an
array of nodes. Each node is a built-in EmVB element with an `id` (use `newNodeId()`), a `type`
and its `props`, plus `children` for boxes. The types and their props are the ones in the
[layout format](../system/layout-format.md); the useful ones are `div-block`, `container`,
`flexbox` and `grid` (boxes), `heading`, `text`, `list`, `link`, `button`, `image`, `icon` and
`divider`. A few rules:

- Return nodes, never HTML strings. A string is refused.
- Don't return another extension's element (`ext:` types) or set `style` on the nodes. Style
  comes from your classes and stylesheet (step 3), or from the styles an editor gives the
  element itself.
- At most 32 nodes, nested at most 8 deep.
- If `render()` throws or returns something invalid, the element shows the placeholder; nothing
  else on the page is affected.

Editors style an extension element like any other: its own **Style** panel settings apply to
the box around what `render()` returns.

### 3. Classes and a stylesheet

To give the element your own look, declare the class names your output may use, put them on
nodes with `extClasses`, and ship a stylesheet:

```ts
export default defineExtension({
  id: "emvb-ext-hello",
  module: import.meta.url,
  classes: { prefix: "hello-", allow: ["hello-card", "hello-title", "hello-wave"] },
  css: "./hello.css",
  elements: [
    {
      // …
      render: (props) => ({
        id: newNodeId(),
        type: "div-block",
        props: {},
        extClasses: ["hello-card"],
        children: [
          {
            id: newNodeId(),
            type: "heading",
            props: { text: String(props.text), level: 2 },
            extClasses: ["hello-title", "hello-wave"],
          },
        ],
      }),
    },
  ],
});
```

```css
/* src/hello.css */
.hello-card { border: 2px solid #6d28d9; border-radius: 12px; padding: 16px 20px; }
.hello-title { color: #5b21b6; margin: 0; }
```

The published page then has `<div class="emvb-div-block hello-card">` and
`<h2 class="emvb-heading hello-title hello-wave">`.

- **The prefix** keeps your classes apart from EmVB's (`emvb-…`) and from the site's own
  classes. It is 2 to 16 lowercase letters, digits and hyphens ending in `-` (`d-`, `acme-ui-`),
  and can't start with `emvb`.
- **The list** (`allow`) holds up to 512 names, each starting with the prefix. Only exact names
  from the list reach the page, at most 16 per node; anything else on a node is dropped. Class
  names can't come from props, so an editor can't type a class in.
- **The stylesheet** is a `.css` file inside your package, given relative to `module`, up to
  256 KB. EmVB reads it once at build time. It is added once to each public page that shows one
  of your elements (however many times it appears, header and footer included), to the editor
  canvas when it shows one, and to the HTML export. Pages without your elements don't get it.
  It never reaches the admin's own interface.
- Style only your own prefixed classes, so your CSS doesn't change the rest of the site.

### 4. A browser script

Some components need a little JavaScript: a dialog, a slider, a live counter. Ship it as
`runtime`:

```ts
export default defineExtension({
  // …
  runtime: "./hello-runtime.js",
});
```

```js
// src/hello-runtime.js: self-contained, no import or export
(() => {
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  for (const card of document.querySelectorAll(".hello-card")) {
    if (card.dataset.helloReady !== undefined) continue;
    card.dataset.helloReady = "";
    if (reduce) continue;
    for (const title of card.querySelectorAll(".hello-wave")) title.dataset.helloWave = "on";
  }
})();
```

- The script loads only on public pages that show one of your elements, once per page. Pages
  without them stay script-free, as EmVB promises.
- It never runs in the editor or the admin. The editor canvas shows your markup and stylesheet
  without the script, so make the element look right before the script runs.
- Write it as one self-contained script, wrapped in a function as above: no `import` or
  `export`, no top-level `await`. Public pages load it as a module script, the HTML export as a
  classic deferred script, so it must work as both. The build checks this and refuses a script
  that doesn't parse. Size limit: 64 KB.
- Find your elements by your own classes, and don't assume they exist only once on a page.
- Sites with a Content Security Policy need to allow the inline script, as they already do for
  EmVB's page styles.

### 5. Accessibility is your package's job

EmVB checks pages for accessibility problems, but it can't see what your script does or what
your stylesheet hides. Your package is responsible for:

- **Reduced motion.** Animate only under `@media (prefers-reduced-motion: no-preference)`, and
  check the setting in scripts, as the sample does.
- **Keyboard use.** Anything a visitor can click must work with Tab, Enter, Space and Escape,
  and show where focus is.
- **Names, roles and states.** Use real buttons and links (EmVB's `button` and `link` elements
  give you those), and keep `aria-expanded`, `aria-pressed` and similar attributes up to date
  in your script.
- **Contrast.** Your colours must stay readable, including on sites with dark Site styles.

EmVB's own checks still apply to the elements you return: a heading level that skips, an image
without alt text or a link without a name is reported as usual.

### 6. Panels and data sources (optional)

An extension can add a **panel** to the editor's left panel: a label, a short description and,
optionally, a data source whose values it lists. Panels are declarative: EmVB draws them with
its own controls, and an extension can't add CSS to the admin.

A **source** is a read-only function that returns text, link or image values from anywhere your
server can reach, for example your product catalogue. Its values arrive in `render()` as
`ctx.sources["source-name"]`, cleaned like any other bound value:

```ts
sources: [
  {
    name: "site-info",
    label: "Hello site info",
    capabilities: ["text"],
    resolve: () => ({ title: "EmVB", tagline: "Extensions API sample" }),
  },
],
```

Sources are read-only. They are not a place to store content; use EmDash collections for that.

### 7. Try it

1. Add your package to the site (`bun add ../emvb-ext-hello`, or publish it and install it from
   npm) and list it in `emvb({ extensions: [...] })`.
2. Restart the dev server. Your element is in the **Add** panel. Drop it on a page, change its
   fields, and check the canvas shows your classes and stylesheet.
3. Publish the page and open it: your classes, stylesheet and script are there. Open a page
   without the element: none of them are.
4. Build for production (`astro build`) and check the same on the built site, on Node or
   Cloudflare, whichever you deploy to.

## Remove an extension

Remove it from `emvb({ extensions: [...] })` and restart or redeploy. Pages keep its elements
and their props. Until it's back, they show a placeholder in the editor ("Missing extension")
and a short note on the public page ("This block needs an extension that is not installed").
Agents can't add or change an element whose extension isn't installed.

## Stability

The Extensions API is versioned (`extensionApi: 1`) and follows the same rule as EmVB's page
format: within 1.x, nothing an extension relies on is removed or changes meaning. New keys,
like the classes, stylesheet and script added in 1.4, are optional additions, and an extension
written for 1.0 works unchanged in 1.4. Breaking changes would wait for `extensionApi: 2`,
announced at least one release ahead.

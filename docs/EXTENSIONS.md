# Extensions API 1.0

EmVB's Extensions API lets a **site owner** add custom elements, editor panels and
read-only data sources at build time (W-927, D-066). Editors cannot install
extensions from the admin. EmVB is in-process (D-029), so extension **code** is
not sandboxed; stored data and render output are still checked.

The API version is `extensionApi: 1` (`EXTENSION_API_VERSION`).

## Registering

```js
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";

emvb({
  canvasStyles: ["/site.css"],
  extensions: [hello],
});
```

Use `defineExtension({ ... })` from `@perkyzz/emvb` so `extensionApi: 1` is set.
See [`examples/emvb-ext-hello`](../examples/emvb-ext-hello) for a full sample
(element + panel + source).

## Namespace

Stored element types are `ext:<package>/<name>`:

- package id: `^[a-z][a-z0-9-]{0,63}$`
- name: `^[a-z][a-z0-9-]{0,31}$`

Path escape (`..`), extra colons, HTML/control characters and collisions with
built-in element types are refused at registration. A stored type that is not a
valid extension type still saves (W-022) and never runs extension code.

## Element contract

An element declares:

1. **schema** — a declarative Zod *subset* (`string` / `number` / `boolean` /
   `enum` / `array` / `object`). EmVB compiles it. Do not pass a Zod instance or
   other code as a schema. EmVB's limits (`MAX_TEXT_LENGTH`, depth, array size)
   always apply on top.
2. **fields** — declarative inspector fields (`text`, `textarea`, `number`,
   `int`, `select`, `boolean`, `href`) mapped onto existing Kumo controls.
3. **render(props, ctx)** — returns EmVB **layout nodes** of built-in types only
   (never HTML strings, never nested `ext:` types). Output is re-validated
   through EmVB's layout schema; links, media URLs, SVG and text go through the
   same sanitizers as editor-saved content. Style on the returned nodes is
   dropped; style the host element in the editor instead, or use the extension's
   own classes (see below).
4. **defaults** — optional starter props for the Add panel.

`ctx.sources` holds this package's resolved read-only source values.

## Classes, stylesheet and runtime (W-1086, extensionApi 1.x)

These keys are additive and optional. An extension without them works exactly as before.

```js
import { defineExtension } from "@perkyzz/emvb";

export default defineExtension({
  id: "emvb-ext-hello",            // must equal the package name (unscoped)
  module: import.meta.url,         // this module; needed for css, runtime and server bundling
  classes: { prefix: "hello-", allow: ["hello-card", "hello-title", "hello-wave"] },
  css: "./hello.css",              // relative to `module`, inside the package
  runtime: "./hello-runtime.js",   // relative to `module`, inside the package
  elements: [
    {
      name: "greeting",
      // ...
      render: (props) => ({
        id: "card0001",
        type: "div-block",
        props: {},
        extClasses: ["hello-card"],
        children: [/* nodes; each may carry extClasses too */],
      }),
    },
  ],
});
```

### `module`

The extension module's own `import.meta.url` (a local `file:` URL). EmDash bundles a plugin
only through its entrypoint, so when an extension names its module, `emvb()` writes a small
server entry at `<site>/node_modules/.emvb/server-entry-<hash>.ts` that imports the module,
registers the extension and re-exports `createPlugin`. This is what makes extension elements
render on Cloudflare Workers and on production builds, where `astro.config` never runs. Without
`module`, an extension renders only in a Node dev server (as in 1.0–1.3). The module must sit in
a package whose `package.json` name (without scope) equals the extension `id`.

### `classes` and `extClasses`

- `prefix`: 2–16 characters, lowercase letters, digits and single hyphens, ending in `-`
  (`d-`, `acme-ui-`). It may not start with `emvb`. A refused prefix drops the whole allowlist
  (the extension still registers, without classes).
- `allow`: up to 512 names, each `^[a-z][a-z0-9-]*$`, at most 64 characters, starting with the
  prefix and longer than it. Other names are dropped one by one.
- A node returned by `render()` may carry `extClasses: string[]`. EmVB keeps only exact names
  from this extension's allowlist, at most 16 per node, without duplicates; anything else (free
  text, names with spaces, quotes or `<`, `emvb-*` names, unlisted names) is dropped. They are
  added after the built-in element's own classes (`class="emvb-heading hello-title"`), escaped by
  the core serializer.
- `extClasses` is render output, not stored data: it never enters a layout, and the layout
  schema is unchanged. Class names never come from props or editors.

### `css` and `runtime`

- Paths are relative to `module` (`./file`, `../dir/file`), must stay inside the extension's
  package, and end in `.css` (stylesheet) or `.js`/`.mjs` (runtime). URLs (`https:`, `data:`,
  `//host`), absolute paths and `\` are refused, with a build-time warning.
- They are read **once at build time** by `emvb()`, and their text travels in the plugin's
  serialized options. Nothing is fetched or `import()`ed at request time.
- Limits: stylesheet 256 KB, runtime 64 KB. A stylesheet containing `</style` is refused; a
  runtime containing `<script`, `</script` or `<!--`, or a line starting with `import` or
  `export`, is refused.
- The runtime must be a **self-contained browser script** (wrap it in an IIFE). Public pages
  write it inline as `<script type="module">`; the HTML export copies it to
  `assets/ext/<id>.js` and loads it with `<script defer>`. It must work in both (no imports, no
  top-level `await`). Sites with a Content Security Policy must allow it, as for EmVB's own
  inline page styles.
- **Emitted only where used:** a public page gets the stylesheet (once, inside the page's EmVB
  CSS) and the runtime (once per response, including theme parts) only when it renders at least
  one of the extension's elements. A placeholder (missing extension, throwing render) emits
  neither. Pages without the extension's elements get no extra CSS and no extra script.
- **Editor canvas:** the canvas iframe gets the stylesheet when it shows one of the extension's
  elements. The runtime never runs in the canvas (the canvas is sandboxed without scripts) or in
  the admin. Extension CSS never goes into the admin UI itself (D-067).
- **HTML export:** the stylesheet is in each page's `style.css`, the runtime in `assets/ext/`.

### Canvas and export output

The admin bundle holds no extension code. The editor canvas and the HTML export ask the server
(`POST /_emdash/api/plugins/emvb/editor/extensions/render`, editors and above) for each
extension element's output by type and props, then check it again against the layout schema
and the allowlist before rendering it.

### What the package is responsible for

EmVB's accessibility check can't see inside extension markup or scripts. The package owns:

- **Reduced motion:** a runtime or stylesheet that animates must honour
  `prefers-reduced-motion` (the sample only waves under `no-preference`).
- **Keyboard use:** anything interactive must work with the keyboard and show focus.
- **ARIA:** roles, names and states for anything the runtime makes interactive.

## Panels

Panels are **declarative**. EmVB renders them in a Kumo slot with EmVB tokens
(D-067). An extension **must not** inject global CSS into the admin. A panel may
point at a source name to label which read-only data it relates to.

## Sources

Sources are **read-only** resolvers with declared capabilities (`text`, `url`,
`image`). Results are cleaned like bound values before anything uses them.
They are not writable and are not a substitute for EmDash collections.

## Missing extension

Removing an extension (or shipping a page to a site that never had it) leaves
the page **valid**. The element renders a placeholder:

- Public: “This block needs an extension that is not installed.”
- Editor: “Missing extension “ext:pkg/name””

A throwing or illegal `render` uses the same placeholder. Siblings keep
rendering.

## Stability and deprecation (extensionApi 1.x)

Same freeze rules as the schema contract (D-065):

- Within `extensionApi` 1.x: no key on the public extension surface is removed,
  renamed or changed in meaning.
- New keys are additive and optional.
- Unknown keys from a newer 1.x on a manifest EmVB does not know are ignored.
- Limits (string length, depth, counts) may only loosen.
- Breaking changes wait for `extensionApi: 2`, with a migration note and at
  least one 1.x release of deprecation warnings in the CHANGELOG.

The sample package `emvb-ext-hello` is illustrative; its element and source
names are not part of the frozen surface.

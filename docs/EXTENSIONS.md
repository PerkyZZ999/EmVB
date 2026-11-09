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
   dropped; style the host element in the editor instead.
4. **defaults** — optional starter props for the Add panel.

`ctx.sources` holds this package's resolved read-only source values.

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

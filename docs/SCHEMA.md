# EmVB schema contract 1.0

This document describes the stored formats EmVB promises to keep stable through 1.x (W-925, D-065).
The contract version is `CONTRACT_VERSION = "1.0"` (exported from `packages/emvb/src/core`). It covers
**layout schema 18** and **design schema 17**.

- Prose reference for every element, prop and style key, with the CSS each one produces:
  [system/layout-format.md](system/layout-format.md).
- Machine-readable schemas: [schema/layout.schema.json](schema/layout.schema.json) and
  [schema/design.schema.json](schema/design.schema.json) (JSON Schema 2020-12). These are generated from
  `packages/emvb/src/core/json-schema.ts` by `bun scripts/export-json-schema.ts`. A test fails when they
  are out of date (`scripts/export-json-schema.test.ts`). The MCP resources `emvb://schema/layout` and
  `emvb://schema/design` serve the same schemas.
- The source of truth is the Zod schemas in `packages/emvb/src/core/schema/`, plus `core/limits.ts`,
  `core/contract.ts` and `core/migrate/`.
- Extensions API v1 (custom elements, panels, sources): [EXTENSIONS.md](EXTENSIONS.md) (W-927, D-066).

## The promise (D-065)

From 1.0, within 1.x:

- No key is removed or renamed, and no key changes meaning.
- New keys are additive and optional.
- A 1.x page renders the same on every later 1.x.
- Every older page (0.1–0.9, layout schemas 1–17 and design schemas 1–16) migrates forward
  automatically on read. Stored 0.x pages render byte-identical HTML and CSS after migration. The
  `packages/emvb/test/compat` corpus proves this, and it runs in `bun run check`.
- A key written by a newer 1.x is **kept and ignored, not stripped** (see below).
- Breaking changes only come in 2.0, with a migration.

## Unknown keys

A document may carry keys this version does not know. They are allowed in exactly these places:

| Place | Examples |
| --- | --- |
| a node | `root.children[0].futureKey` |
| a node's `props` (for a known element type) | `props.futureProp` |
| a node's style records: `style`, `states.hover/focus/active`, `devices.tablet/mobile`, `query.style` | `style.futureStyle` |
| a design class's `style`, `states` and `devices`, and a tag default in `defaults` | `classes[0].style.futureStyle` |

Rules (`core/contract.ts`, limits in `core/limits.ts`):

- **Stored untouched.** The validator sets these keys aside, parses the rest strictly, then puts them
  back unchanged. A save keeps them.
- **Never rendered.** `renderPage` reads known keys only: no unknown key reaches HTML, CSS or a
  script. Editors and the MCP tools keep the keys when they edit other fields.
- **Limits.** A name must match `UNKNOWN_KEY_PATTERN`, `^[A-Za-z][A-Za-z0-9_.:/@-]{0,127}$`. At most
  `MAX_UNKNOWN_KEYS` (32) unknown keys are kept in one place, and a value nests at most
  `MAX_UNKNOWN_DEPTH` (16) levels. Beyond that the document is refused with code `unknown_key` and
  the key's path. The whole document still has to fit the page and design byte budgets.
- **Everywhere else stays strict.** The top level of a layout or design, variables, binding,
  audience, query (other than its `style`) and every value shape are still refused when they hold a
  key EmVB does not know.
- An element **type** EmVB does not know is kept too, as before (W-022).
- `motion` inside a state is refused: motion is Normal-only.

Note that D-031 says a document from a *newer* schema version is refused as "newer", not guessed at.
That still holds for `schemaVersion` above 18. The unknown-key rule is for 1.x documents that still say
schema 18 but were written by a later 1.x that added optional keys.

## What changed at 1.0 (layout 17 → 18, design 16 → 17)

Accepted by Charles 2026-11-04. Each rename has a forward migration. The old names are still
accepted on input (validation and the MCP tools) and are upgraded when the document is read.

| 0.x (≤ layout 17) | 1.0 (layout 18) | Why |
| --- | --- | --- |
| node type `section` | `part-ref` | It embeds a Theme section part; "section" also meant the HTML tag and the `layout-section` element |
| node `label` | `editorLabel` | Editor-only name. Avoids a clash with the form fields' and menus' `props.label`, which are rendered |
| Loop `props.itemPartId` | `props.partId` | Same name as on `part-ref` |
| `style.transition` | `style.motion.transition` | All motion in one place |
| `style.entrance` | `style.motion.entrance` | |
| `style.scrollMotion` | `style.motion.scroll` | |
| `style.iconAnimation` | `style.motion.icon` | |

`motion` is `{ entrance?, scroll?, transition?, icon? }`, each part with its 0.x shape. It is
allowed in `style`, `devices.*`, `query.style` and a class's style, but not in `states`. The renderer
flattens it back in the 0.x key order, so the CSS is byte-identical.

Added in 1.0 (W-938, additive): `motion.loop` is `{ effects, duration, easing?, alternate?, loop? }`
or `{ type: "none" }`. `effects` are the scroll-motion effects (`fade`, `move-x`, `move-y`,
`scale`, `rotate`, `blur`, each once, same limits); `duration` 200–20000 ms; `easing` one of the
transition easings; `alternate` (default true) plays back and forth; it stops after about 5 s
unless `loop: true`. Normal-only, off for reduced motion. It has no 0.x key.

The design moves to 17 only for the motion folding in class styles, their devices, and tag defaults.

On input, a v18 document with a 0.x flat motion key (such as `style.entrance`) keeps the key as an
unknown key and does not render it. Only documents that say schema 17 or lower, and MCP tool input,
are upgraded. Rendering a raw, unvalidated v17 tree through `renderPage` is not supported: validate
or upgrade first. The `part-ref` type and the motion folding only exist after the upgrade.

## Shapes

A layout is `{ schemaVersion: 18, root }`, where `root` is a `container` node.

Every node has these keys:

- `id`: 4–24 characters, letters, digits, `_` or `-`, unique on the page.
- `type` and `props`.
- Optional: `style`, `states`, `devices`, `hiddenOn`, `classes`, `htmlId`, `attributes`,
  `editorLabel` (1–80 characters, never rendered), `bind`, `variant`, `audience`, `dir`,
  `container`, `query`, and `children` for parents.

Element types and their props (see layout-format.md for each prop's type and limits):

| Type | Props |
| --- | --- |
| `container` | tag, href, newTab |
| `div-block` | href, newTab |
| `layout-section` | tag, contentWidth, fullWidth |
| `flexbox` | href, newTab |
| `grid` | columns, columnsTablet, columnsMobile, columnTracks, columnTracksTablet, columnTracksMobile, href, newTab |
| `svg` | markup, title, decorative, size |
| `tabs` | (none) |
| `tab-panel` | label |
| `heading` | text, level, href, newTab |
| `toc` | title |
| `language-switcher` | label |
| `spacer` | height |
| `divider` | (none) |
| `text` | text, tag |
| `label` | text |
| `link` | text, href, newTab |
| `button` | text, href, newTab, iconId, iconSvg, iconPosition, iconGap, iconSize |
| `list` | ordered, marker, start, items |
| `image` | src, alt, decorative, width, height, mediaId, priority, href, newTab, caption, focalX, focalY, sources, edit |
| `icon` | iconId, iconSvg, singleColor, size, decorative, title, href, newTab |
| `video` | url, title, mediaId |
| `form` | formId |
| `text-input`, `textarea`, `select`, `radio` | field, label, placeholder |
| `checkbox` | field, label |
| `submit` | label |
| `post-title` | level |
| `post-excerpt` | maxWords |
| `post-content`, `post-author` | (none) |
| `post-image` | decorative |
| `post-link` | text, newTab |
| `post-date` | format |
| `loop` | partId, perPage, collection, limit, order, display, columns, permalink, imageField, excerptField, filter |
| `loop-empty` | (none) |
| `pagination` | prevText, nextText, showCount, countText, showLast, lastText, lastLabel, titleText, archiveTitle, navLabel, pageLabel, prevLabel, nextLabel |
| `part-ref` | partId |
| `accordion` | (none) |
| `accordion-item` | summary, open |
| `menu` | direction, label |
| `menu-item` | text, href, newTab, wide |

These style keys are allowed in `style`, `devices.*`, `query.style` and class styles; `states.*` takes
the same keys except `motion`:

- **Layout:** flexDirection, flexWrap, justifyContent, alignItems, gap, gridColumnSpan, gridRowSpan,
  gridColumnStart, gridRowStart, flexGrow, flexShrink, flexBasis, alignSelf, order.
- **Size:** width, minWidth, maxWidth, height, minHeight, maxHeight, overflow, overflowX,
  overflowY, aspectRatio, objectFit, objectPosition.
- **Spacing:** paddingTop, paddingRight, paddingBottom, paddingLeft, marginTop, marginRight,
  marginBottom, marginLeft.
- **Position:** position, top, right, bottom, left, zIndex.
- **Type:** fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textAlign, textTransform,
  textDecoration, fontStyle, whiteSpace, overflowWrap, color, markerColor, markerSize.
- **Background:** backgroundColor, backgroundImage, backgroundSize, backgroundPosition,
  backgroundRepeat, backgroundVideo, gradient, overlay.
- **Border:** borderWidth, borderTopWidth, borderRightWidth, borderBottomWidth, borderLeftWidth,
  borderStyle, borderColor, borderRadius, borderTopLeftRadius, borderTopRightRadius,
  borderBottomRightRadius, borderBottomLeftRadius.
- **Effects:** opacity, boxShadow, filter, backdropFilter, transform, cursor.
- **Icon:** iconRotate, iconFlip, iconScale, iconStrokeWidth, iconShadow.
- **Motion:** `motion`.

A design is `{ schemaVersion: 17, variables, classes?, fluidRange?, direction?, defaults? }`.

Limits (`core/limits.ts`):

| Limit | Value |
| --- | --- |
| Page JSON | 512 KiB |
| Design JSON | 256 KiB |
| Tree depth | 24 |
| Nodes | 2000 |
| Text length | 2000 |
| Tabs | 12 |

The per-key limits are in layout-format.md and the JSON Schema.

## Names we kept, and what they mean

These names are awkward, but changing them would cost more than it gains, so they are frozen as they
are (W-925 audit):

- **Grid per-device keys.** `columns`, `columnsTablet`, `columnsMobile` and `columnTracks*` are
  props, not `devices` style overrides. The grid's column count is content structure, not style.
  Other per-device values live in `devices.tablet` and `devices.mobile`.
- **`iconSize` vs `size`.** A `button`'s icon size is `props.iconSize`, because the button's own size
  is its style. An `icon` or `svg` element's size is `props.size`.
- **`focalX` / `focalY`.** These are image props, whole percentages 0–100 from the left and top. They
  become `object-position`. They are not style keys, because they belong to the picture: they stay
  with the image when it is cropped or replaced in the editor.
- **`container` / `div-block` / `flexbox`.** These are three box elements with the same structure:
  - `container` takes a semantic `tag` and is the root type.
  - `div-block` is a plain block.
  - `flexbox` starts as a flex row.

  They differ in their defaults and their place in the Add panel. The node key `container`, which
  sets container queries (W-341), is unrelated to the `container` type.
- **Design `direction` vs node `dir`.** The design's `direction` (`ltr`, `rtl`, `auto`) is the
  site's text direction. A node's `dir` overrides it for one element and its children (W-341). A
  `menu`'s `props.direction` (`row` or `column`) is layout, not text direction.
- **`section` words that are not `part-ref`.** These still say "section" and are not schema names
  that changed:
  - the HTML tag `section` (`container`/`layout-section` `tag`)
  - the theme part type `section`
  - the CSS class `emvb-section`
  - the editor's "Theme section" wording

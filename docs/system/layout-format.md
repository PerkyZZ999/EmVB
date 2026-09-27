# Layout format (schema v1)

How EmVB stores a page and its site-wide design, as implemented through S2 (W-016–W-022). The source of truth is the code: `packages/emvb/src/core/schema/` (Zod schemas), `core/limits.ts`, `core/validate.ts` and `core/migrate/`. Update this file in the same change as any of them (ARCHITECTURE.md § Documentation).

## Where it lives

- **Pages** are entries in the hidden `emvb_pages` collection (D-012, D-019). The layout is the `layout` field (EmDash type `json`, shown with the read-only `emvb:layout` widget). The other fields are `title`, `canvas_mode` (`site-layout` or `blank`) and EmDash's own slug, status, revision and SEO fields. EmDash may hand a `json` field back as a string, so readers accept both (`renderStored` in `src/astro/render.ts`).
- **The design system** (colour variables in S1) is one document in plugin storage, collection `design`, key `system` (D-013). It is written with compare-and-set on its revision through `POST /_emdash/api/plugins/emvb/design/save` and read through the public `GET /_emdash/api/plugins/emvb/design`.

## Page layout

```json
{
  "schemaVersion": 1,
  "root": {
    "id": "root0001",
    "type": "container",
    "props": {},
    "style": { "flexDirection": "column", "gap": { "value": 16, "unit": "px" } },
    "children": [
      {
        "id": "head0001",
        "type": "heading",
        "props": { "text": "Welcome", "level": 1 },
        "style": { "color": { "var": "brand" } }
      }
    ]
  }
}
```

- `schemaVersion` is the literal `1`. `root` is always a container.
- Every node has `id` (4–24 of `A-Z a-z 0-9 _ -`, unique within the page), `type`, `props`, and optional `style` and `classes` (up to 20 ids of 1–40 of `a-z 0-9 -`; not rendered yet).
- Objects are strict: unknown keys are rejected, not ignored.
- **Unknown element types** (W-022 / R-033): a node whose `type` is not in the known set is kept on save (`id` rules still apply; `props` is an open record; optional `children` are validated recursively). Public pages omit it; the editor shows a selectable placeholder. Damaged known nodes (wrong props) still fail validation with path-specific issues.


| Type | `props` | Children | Renders as |
| --- | --- | --- | --- |
| `container` | optional `tag` (`div`, `section`, `header`, `footer`, `main`, `article`, `aside`, `nav`) | `children: Node[]` (required, may be empty) | that tag (default `div`) with `class="emvb-container …"` |
| `heading` | `text` (≤ 2000), `level` (1–6) | none | `<h1>`–`<h6>` |
| `spacer` | `height` length | none | `<div aria-hidden="true">` with height in CSS |
| `divider` | `{}` | none | `<hr>` |
| `text` | `text`, optional `tag` (`p` \| `div`) | none | `<p>` or `<div>` |
| `label` | `text` | none | `<span>` |
| `link` | `text`, `href`, optional `newTab` | none | `<a href>` (+ `target`/`rel` when `newTab`) |
| `button` | `text`, optional `href` and `newTab` | none | `<a href>` when `href` is safe, else `<button type="button">` |
| `list` | `items` (string[], ≤ 200), optional `ordered` | none | `<ul>` or `<ol>` with `<li>` |

Every node may also carry optional `htmlId` (CSS `id`, unique on the page) and `classes` (unused until S4).

### Style properties (v1, W-017)

Lengths are `{ "value": 0–10000, "unit": "px" | "rem" | "em" | "%" }`. Colours are hex or `{ "var": "<id>" }`.

| Key | Value | CSS |
| --- | --- | --- |
| `flexDirection` | `row`, `column`, `row-reverse`, `column-reverse` | `flex-direction` |
| `flexWrap` | `nowrap`, `wrap`, `wrap-reverse` | `flex-wrap` |
| `justifyContent` | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `space-evenly` | `justify-content` |
| `alignItems` | `stretch`, `flex-start`, `flex-end`, `center`, `baseline` | `align-items` |
| `gap` | length | `gap` |
| `width` / `minWidth` / `maxWidth` / `height` / `minHeight` | length | matching size properties |
| `paddingTop` / `Right` / `Bottom` / `Left` | length | `padding-*` |
| `marginTop` / `Right` / `Bottom` / `Left` | length | `margin-*` |
| `fontSize` / `lineHeight` / `letterSpacing` | length | matching type properties |
| `fontWeight` | `400`–`700`, `normal`, `bold` | `font-weight` |
| `textAlign` | `left`, `center`, `right`, `justify` | `text-align` |
| `textTransform` | `none`, `uppercase`, `lowercase`, `capitalize` | `text-transform` |
| `color` / `backgroundColor` / `borderColor` | colour | matching colour properties |
| `borderWidth` / `borderRadius` | length | matching border properties |
| `borderStyle` | `none`, `solid`, `dashed`, `dotted` | `border-style` |

## Design system document

```json
{
  "schemaVersion": 1,
  "variables": { "colors": [{ "id": "brand", "name": "Brand", "value": "#0055ff" }] }
}
```

- Colour ids are 1–40 of `a-z 0-9 -`, names 1–60 characters, values hex as above. At most 200 colours.
- The document is at most 256 KiB (`MAX_DESIGN_BYTES`).

## Limits and validation

`validateLayout()` runs on every save (the plugin's `beforeSave` hook) and on every read (editor and public render), in this order:

1. **Size:** the JSON is at most 512 KiB (`MAX_LAYOUT_BYTES`) in UTF-8 bytes.
2. **Version:** `upgradeLayout()` runs the migration chain up to the current version. A document from a newer EmVB is refused with "Update EmVB to edit it", never downgraded.
3. **Structure:** at most 2000 nodes (`MAX_NODES`) and 24 levels (`MAX_DEPTH`), checked iteratively before parsing.
4. **Schema:** the Zod schema above.
5. **Ids:** every node id is unique.

Issues carry a path such as `root.children[0].props.level`, which the editor uses to select the element at fault. A layout that fails on read renders nothing on the public page and logs only the page id (R-033).

## Rendered output

- The root gets `emvb-root`, each node `emvb-<type>` and, when its style yields at least one valid declaration, `emvb-e-<id>`. Invalid style values are dropped with a render warning. A reference to an unknown variable is kept and also reported as a warning. Unknown element types render nothing publicly and a placeholder with `data-emvb-id` in the editor (warning `unknown-type`).
- The CSS is, in order: variables on `.emvb-root` (`--emvb-c-<id>:<value>`), base CSS for the element types in use, then one `.emvb-e-<id>{…}` rule per styled node (R-021).
- Text and attributes are escaped by the serializer. Public output has no `data-emvb-*` attributes and no scripts.

## Changing the format

- Add a migration `LAYOUT_MIGRATIONS[n]` (pure, version n to n + 1) and bump `LAYOUT_SCHEMA_VERSION` in the same change.
- Add fixtures and tests for the old and new shapes, and update this file.

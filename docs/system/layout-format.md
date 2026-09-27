# Layout format (schema v1)

How EmVB stores a page and its site-wide design, as implemented in S1. The source of truth is the code: `packages/emvb/src/core/schema/` (Zod schemas), `core/limits.ts`, `core/validate.ts` and `core/migrate/`. Update this file in the same change as any of them (ARCHITECTURE.md § Documentation).

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

| Type | `props` | Children | Renders as |
| --- | --- | --- | --- |
| `container` | `{}` | `children: Node[]` (required, may be empty) | `<div class="emvb-container …">` |
| `heading` | `text` (string, at most 2000 characters), `level` (integer 1–6) | none | `<h1>`–`<h6>` with `class="emvb-heading …"` |

### Style properties (v1)

| Key | Value | CSS |
| --- | --- | --- |
| `flexDirection` | `row`, `column`, `row-reverse`, `column-reverse` | `flex-direction` |
| `gap` | `{ "value": 0–10000, "unit": "px" \| "rem" \| "em" \| "%" }` | `gap` |
| `color` | a hex colour (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or `{ "var": "<variable id>" }` | `color`, with `var(--emvb-c-<id>)` for a variable |

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

- The root gets `emvb-root`, each node `emvb-<type>` and, when its style yields at least one valid declaration, `emvb-e-<id>`. Invalid style values are dropped with a render warning. A reference to an unknown variable is kept and also reported as a warning.
- The CSS is, in order: variables on `.emvb-root` (`--emvb-c-<id>:<value>`), base CSS for the element types in use, then one `.emvb-e-<id>{…}` rule per styled node (R-021).
- Text and attributes are escaped by the serializer. Public output has no `data-emvb-*` attributes and no scripts.

## Changing the format

- Add a migration `LAYOUT_MIGRATIONS[n]` (pure, version n to n + 1) and bump `LAYOUT_SCHEMA_VERSION` in the same change.
- Add fixtures and tests for the old and new shapes, and update this file.

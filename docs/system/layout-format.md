# Layout format (schema v1)

How EmVB stores a page and its site-wide design, as implemented through S4 (variables W-028+). The source of truth is the code: `packages/emvb/src/core/schema/` (Zod schemas), `core/limits.ts`, `core/validate.ts` and `core/migrate/`. Update this file in the same change as any of them (ARCHITECTURE.md § Documentation).

## Where it lives

- **Pages** are entries in the hidden `emvb_pages` collection (D-012, D-019). The layout is the `layout` field (EmDash type `json`, shown with the read-only `emvb:layout` widget). The other fields are `title`, `canvas_mode` (`site-layout` or `blank`) and EmDash's own slug, status, revision and SEO fields. EmDash may hand a `json` field back as a string, so readers accept both (`renderStored` in `src/astro/render.ts`).
- **The design system** (colours, fonts, font sizes, spacings; classes in W-030) is one document in plugin storage, collection `design`, key `system` (D-013). It is written with compare-and-set on its revision through `POST /_emdash/api/plugins/emvb/design/save` and read through the public `GET /_emdash/api/plugins/emvb/design`.

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
| `image` | `src`, `alt`, optional `decorative`, `width`, `height`, `mediaId` | none | `<img loading="lazy">` (decorative → empty `alt` + `role="presentation"`) |
| `icon` | `iconId` (bundled Lucide id), optional `size`, `decorative`, `title` | none | Inline Lucide `<svg>` (unknown id → placeholder; never a remote URL) |
| `video` | `url`, `title`, optional `mediaId` | none | YouTube/Vimeo privacy `<iframe loading="lazy">` or media `<video controls>` (no autoplay) |
| `form` | `formId` (forms-plugin id; may be empty until bound) | `children: Node[]` (form fields + submit; no nested forms) | Bound: `<form class="emvb-form ec-form" …>`. Unbound: editor placeholder `data-emvb-form-unbound`; omitted on public (no forms runtime). |
| `text-input` | `field`, optional `label`, `placeholder` | none | labelled `<input class="ec-form-input">` + `data-error-for` |
| `textarea` | `field`, optional `label`, `placeholder` | none | labelled `<textarea class="ec-form-input">` + `data-error-for` |
| `select` | `field`, optional `label`, `placeholder` | none | labelled `<select>` (options from the public form definition when available) |
| `checkbox` | `field`, optional `label` | none | labelled `<input type="checkbox" value="true">` |
| `radio` | `field`, optional `label`, `placeholder` | none | `<fieldset>` of radios (options from definition when available) |
| `submit` | optional `label` | none | `<button type="submit" class="ec-form-submit">` |
| `post-title` | optional `level` (1–6) | none | Dynamic heading from `ThemeDynamicData.post` |
| `post-excerpt` | (none) | none | Dynamic excerpt paragraph |
| `post-content` | (none) | none | Dynamic body (Portable Text → safe blocks) |
| `post-image` | optional `decorative` | none | Dynamic featured image when URL present |
| `post-link` | optional `text`, `newTab` | none | Dynamic permalink; blank text → title |
| `loop` | optional `itemPartId` | `children: Node[]` (inline item template when no part id) | Repeats item template for each archive post |

Every node may also carry optional `htmlId` (CSS `id`, unique on the page) and `classes` (style-class ids from the design system, S4).

**Forms (S5):** form fields are only valid inside a `form` (or under one). Pages with a form set `needsFormsRuntime`; the host route loads `EmVBFormsRuntime` so `initForms` handles AJAX submit. Pages without a form stay zero EmVB JS (R-031).

### Style properties (v1, W-017)

Lengths are `{ "value": 0–10000, "unit": "px" | "rem" | "em" | "%" | "vw" | "vh" }` (`vw` and `vh` since W-088). Colours are hex or `{ "var": "<id>" }`. A **size** is a length, a variable reference or `"auto"`. An **offset** is a size whose value may also be negative (−10000 to 10000).

| Key | Value | CSS |
| --- | --- | --- |
| `flexDirection` | `row`, `column`, `row-reverse`, `column-reverse` | `flex-direction` |
| `flexWrap` | `nowrap`, `wrap`, `wrap-reverse` | `flex-wrap` |
| `justifyContent` | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `space-evenly` | `justify-content` |
| `alignItems` | `stretch`, `flex-start`, `flex-end`, `center`, `baseline` | `align-items` |
| `gap` | length | `gap` |
| `width` / `height` | size | `width` / `height` |
| `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | length | matching size properties (`maxHeight` since W-088) |
| `overflow` | `visible`, `hidden`, `clip`, `scroll`, `auto` | `overflow` |
| `aspectRatio` | `"auto"` or `"w/h"` with whole numbers 1–9999, such as `"16/9"` | `aspect-ratio` (`16 / 9`) |
| `objectFit` | `fill`, `contain`, `cover`, `none`, `scale-down` | `object-fit` (the editor offers it on Image and Video) |
| `paddingTop` / `Right` / `Bottom` / `Left` | length | `padding-*` |
| `marginTop` / `Right` / `Bottom` / `Left` | size | `margin-*` |
| `position` | `static`, `relative`, `absolute`, `fixed`, `sticky` | `position` |
| `top` / `right` / `bottom` / `left` | offset | matching inset properties |
| `zIndex` | whole number −9999 to 9999 | `z-index` |
| `fontSize` / `lineHeight` / `letterSpacing` | length | matching type properties |
| `fontWeight` | `400`–`700`, `normal`, `bold` | `font-weight` |
| `textAlign` | `left`, `center`, `right`, `justify` | `text-align` |
| `textTransform` | `none`, `uppercase`, `lowercase`, `capitalize` | `text-transform` |
| `color` / `backgroundColor` / `borderColor` | colour | matching colour properties |
| `borderWidth` / `borderRadius` | length | matching border properties |
| `borderStyle` | `none`, `solid`, `dashed`, `dotted` | `border-style` |
| `opacity` | number 0–1 (the editor shows 0–100 %) | `opacity` |
| `boxShadow` | `{ x, y, blur, spread, color?, inset? }`: px numbers, `x`, `y` and `spread` −1000 to 1000, `blur` 0 to 1000; `color` is a colour; `inset` is a boolean | `box-shadow` as `[inset] Xpx Ypx Bpx Spx [colour]`; no colour means the text colour |
| `filter` | `{ blur?, brightness?, contrast?, saturate?, grayscale?, hueRotate? }`, at least one set: `blur` 0–100 px, `brightness` / `contrast` / `saturate` 0–300 %, `grayscale` 0–100 %, `hueRotate` 0–360° | `filter`, functions always in that order, such as `blur(2px) grayscale(100%)` |
| `cursor` | `default`, `pointer`, `text`, `move`, `grab`, `not-allowed`, `help`, `crosshair`, `zoom-in` | `cursor` |

**W-088 additions are additive.** Every new key and unit is optional and every earlier value keeps its meaning, so stored pages and classes are valid unchanged: `schemaVersion` stays 1 and no migration runs. The keys are the same on `node.style` and on `design.classes[].style`. The generator builds each value from typed numbers and keywords only and runs the same `isSafeCssValue` gate as every other property; anything else is dropped with a `rejected-style` warning. A shadow colour bound to a colour variable counts as a use of that variable, and deleting the variable clears it from the page layout. One limit: an older EmVB reports a page or class that uses a new key as a validation issue rather than "saved by a newer EmVB".

## Design system document

```json
{
  "schemaVersion": 1,
  "variables": {
    "colors": [{ "id": "brand", "name": "Brand", "value": "#0055ff" }],
    "fonts": [{ "id": "body", "name": "Body", "value": "Noto Sans, sans-serif" }],
    "fontSizes": [{ "id": "lg", "name": "Large", "value": { "value": 24, "unit": "px" } }],
    "spacings": [{ "id": "md", "name": "Medium", "value": { "value": 16, "unit": "px" } }]
  },
  "classes": [{ "id": "card", "name": "Card", "style": { "paddingTop": { "value": 16, "unit": "px" } } }]
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
- The CSS is, in order: variables on `.emvb-root` (`--emvb-c-*` colours, `--emvb-f-*` fonts, `--emvb-fs-*` font sizes, `--emvb-s-*` spacings), base CSS for the element types in use, then class rules (W-030), then one `.emvb-e-<id>{…}` rule per styled node (R-021).
- **Style classes** (`design.classes[]`): `{ id, name, style }`. Elements list ids in `node.classes`; HTML gets `emvb-k-<id>` in applied order. Cascade merge for computed styles: `resolveCascade(classStyles, local)` (later wins).
- Length/font style props may use `{ "var": "<id>", "from": "spacing"|"fontSize"|"font" }` (colours keep `{ "var": "<id>" }`). Offsets (`top`, `right`, `bottom`, `left`) take spacing variables; the shadow colour takes a colour variable.
- Text and attributes are escaped by the serializer. Public output has no `data-emvb-*` attributes and no scripts.

## Changing the format

- Add a migration `LAYOUT_MIGRATIONS[n]` (pure, version n to n + 1) and bump `LAYOUT_SCHEMA_VERSION` in the same change.
- Add fixtures and tests for the old and new shapes, and update this file.

## S8 additive elements (W-072–W-074)

- **`div-block`**: block container (`display:block`); children like Container.
- **`flexbox`**: flex container defaulting to row + wrap + gap (Container stays column).
- **`svg`**: `props.markup` (sanitized allowlist; no scripts/handlers/`use`/`foreignObject`); optional `title`, `decorative`, `size`.
- **`tabs` / `tab-panel`**: Tabs hold only tab-panels. Public markup is CSS-only (radio + `:has()`); no EmVB public JS (D-EV4-02).


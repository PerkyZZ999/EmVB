# Layout format (schema v8)

How EmVB stores a page and its site-wide design, as implemented through S4 (variables W-028+). The source of truth is the code: `packages/emvb/src/core/schema/` (Zod schemas), `core/limits.ts`, `core/validate.ts` and `core/migrate/`. Update this file in the same change as any of them (ARCHITECTURE.md § Documentation).

## Where it lives

- **Pages** are entries in the hidden `emvb_pages` collection (D-012, D-019). The layout is the `layout` field (EmDash type `json`, shown with the read-only `emvb:layout` widget). The other fields are `title`, `canvas_mode` (`site-layout` or `blank`) and EmDash's own slug, status, revision and SEO fields. EmDash may hand a `json` field back as a string, so readers accept both (`renderStored` in `src/astro/render.ts`).
- **The design system** (colours, fonts, font sizes, spacings; classes in W-030) is one document in plugin storage, collection `design`, key `system` (D-013). Editors save a draft at key `draft` through `POST /_emdash/api/plugins/emvb/design/save` (W-100, D-040 proposed). `POST .../design/publish` copies that draft onto `system`. The public `GET /_emdash/api/plugins/emvb/design` returns `system` only.

## Page layout

```json
{
  "schemaVersion": 8,
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

- `schemaVersion` is the literal `8` (D-031, D-032, D-034, D-036, D-038, D-039, D-041; v1–v7 documents are upgraded on read by steps that change nothing). `root` is always a container.
- Every node has `id` (4–24 of `A-Z a-z 0-9 _ -`, unique within the page), `type`, `props`, and optional `style`, `states` (W-089, see [State styles](#state-styles-w-089)) and `classes` (up to 20 ids of 1–40 of `a-z 0-9 -`; not rendered yet).
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
| `grid` | `columns` (1–12) | `children: Node[]` | `display: grid` with that many equal columns |
| `section` | optional `partId` | `children: Node[]` (inline contents when no part id) | When `partId` is set, the published Section theme part's children replace the local ones |

Every node may also carry optional `htmlId` (CSS `id`, unique on the page), `classes` (style-class ids from the design system, S4), `devices` and `hiddenOn` (W-096, below).

**Forms (S5):** form fields are only valid inside a `form` (or under one). Pages with a form set `needsFormsRuntime`; the host route loads `EmVBFormsRuntime` so `initForms` handles AJAX submit. Pages without a form stay zero EmVB JS (R-031).

### Style properties (W-017, extended in W-088)

Lengths are `{ "value": 0–10000, "unit": "px" | "rem" | "em" | "%" | "vw" | "vh" }` (`vw` and `vh` since W-088). Colours are hex or `{ "var": "<id>" }`. A **size** is a length, a variable reference or `"auto"`. An **offset** is a size whose value may also be negative (−10000 to 10000).

| Key | Value | CSS |
| --- | --- | --- |
| `flexDirection` | `row`, `column`, `row-reverse`, `column-reverse` | `flex-direction` |
| `flexWrap` | `nowrap`, `wrap`, `wrap-reverse` | `flex-wrap` |
| `justifyContent` | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `space-evenly` | `justify-content` |
| `alignItems` | `stretch`, `flex-start`, `flex-end`, `center`, `baseline` | `align-items` |
| `gap` | length | `gap` |
| `gridColumnSpan` / `gridRowSpan` (W-099) | whole number 1–12 | `grid-column` / `grid-row` as `span N` |
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
| `backgroundImage` (W-094) | http(s) URL or a site path, no spaces, quotes or parentheses | `background-image` as `url("…")`. With no size, position or repeat: `cover`, `center`, `no-repeat` |
| `backgroundSize` | `auto`, `cover`, `contain` | `background-size` (the image layer) |
| `backgroundPosition` | `center`, an edge (`top`, `bottom`, `left`, `right`) or a corner (`top left` and the other three) | `background-position` |
| `backgroundRepeat` | `no-repeat`, `repeat`, `repeat-x`, `repeat-y` | `background-repeat` |
| `gradient` | `{ angle: 0–360, from, to }`; stops are colours | `linear-gradient`, behind the image |
| `overlay` | `{ color, opacity: 0–1 }` | a colour layer above the image. Hex becomes 8-digit hex; a colour variable becomes `color-mix` |
| `borderWidth` / `borderRadius` | length | matching border properties |
| `borderStyle` | `none`, `solid`, `dashed`, `dotted` | `border-style` |
| `opacity` | number 0–1 (the editor shows 0–100 %) | `opacity` |
| `boxShadow` | `{ x, y, blur, spread, color?, inset? }`: px numbers, `x`, `y` and `spread` −1000 to 1000, `blur` 0 to 1000; `color` is a colour; `inset` is a boolean | `box-shadow` as `[inset] Xpx Ypx Bpx Spx [colour]`; no colour means the text colour |
| `filter` | `{ blur?, brightness?, contrast?, saturate?, grayscale?, hueRotate? }`, at least one set: `blur` 0–100 px, `brightness` / `contrast` / `saturate` 0–300 %, `grayscale` 0–100 %, `hueRotate` 0–360° | `filter`, functions always in that order, such as `blur(2px) grayscale(100%)` |
| `cursor` | `default`, `pointer`, `text`, `move`, `grab`, `not-allowed`, `help`, `crosshair`, `zoom-in` | `cursor` |
| `transition` (W-089, Normal only) | `{ duration, delay?, easing, property }`: `duration` and `delay` whole ms 0–2000; `easing` `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`; `property` `all`, `colors`, `opacity`, `shadow`, `filter`. No other keys | `transition`, one entry per CSS property: `colors` is `color`, `background-color` and `border-color`; `shadow` is `box-shadow`. For example `opacity 200ms ease-out 50ms` |
| `entrance` (W-101, Normal only) | `{ type, duration }`: `type` is `fade`, `fade-up` or `fade-down`; `duration` whole ms 0–2000 | `animation` named `emvb-<type>`, once, `ease-out`, `both`. Reduced motion sets `animation: none` |

**W-088 additions are additive.** Every new key and unit is optional and every earlier value keeps its meaning, so stored pages and classes are valid unchanged. The version moved to 2 (D-031) with a v1 → v2 step that changes nothing, so an older EmVB shows "saved by a newer EmVB" rather than an invalid-layout error. The keys are the same on `node.style` and on `design.classes[].style`. The generator builds each value from typed numbers and keywords only and runs the same `isSafeCssValue` gate as every other property; anything else is dropped with a `rejected-style` warning. A shadow colour bound to a colour variable counts as a use of that variable, and deleting the variable clears it from the page layout and from class styles.

### State styles (W-089)

`node.states` and `design.classes[].states` are `{ "hover"?, "focus"?, "active"? }`. Each state is a style object with the same keys, limits and variable references as `style`, except `transition`, which belongs to Normal only. Any other state name is refused. Adding `states` moved the version to 3 (D-032) with a v2 → v3 step that changes nothing.

```json
{
  "id": "btn00001",
  "type": "button",
  "props": { "text": "Go" },
  "style": { "backgroundColor": "#1d4ed8", "transition": { "duration": 200, "easing": "ease-out", "property": "colors" } },
  "states": { "hover": { "backgroundColor": "#1e3a8a" }, "focus": { "borderColor": "#f59e0b" } }
}
```

- **Selectors.** `hover` is `:hover`, `focus` is `:focus-visible` (keyboard focus, so a mouse click leaves no focus style) and `active` is `:active`.
- **Cascade.** Each selector's base rule is followed by its `:hover`, `:focus-visible` and `:active` rules, classes first and then the local rule. So a state rule beats every Normal rule (a class's Hover colour shows over a local Normal colour), within one state the local rule beats the class, and Active beats Focus, which beats Hover.
- **Safety.** State values go through the same mappers and `isSafeCssValue` gate as `style`. A rejected value is dropped with a `rejected-style` warning naming `<state>.<key>` (such as `hover.color`); a `transition` inside a state is dropped and reported the same way, and so is an unknown state name. An unknown variable in a state is reported like one in `style`. An element whose only styles are states still gets `emvb-e-<id>`.
- **Reduced motion.** When any rule has a `transition`, the CSS ends with one `@media (prefers-reduced-motion: reduce){…{transition:none}}` block that lists exactly those selectors. Nothing else changes under reduced motion.
- **Editor preview.** The canvas CSS repeats every state rule for `[data-emvb-state="hover"|"focus"|"active"]`, and the editor sets that attribute on the selected element while a state is chosen in the Style tab. Public CSS has neither the attribute nor those selectors.

### Per-device styles (W-096)

`node.devices` and `design.classes[].devices` are `{ "tablet"?, "mobile"? }`. Each is a style object with the same keys as `style`. Only keys that differ from desktop are stored. `node.hiddenOn` and `design.classes[].hiddenOn` are arrays of `"desktop"`, `"tablet"` and `"mobile"` (at most one of each). Desktop itself stays in `style`.

- **Queries.** Tablet is `@media (max-width: 1024px)`, then mobile `@media (max-width: 767px)`. A phone matches both, so mobile wins on a shared key, and a tablet-only key still applies on mobile. The bounds match `deviceForWidth` (under 768 mobile, under 1025 tablet).
- **Hide.** Each device has its own query, so `display: none` does not leak: desktop `(min-width: 1025px)`, tablet `(min-width: 768px) and (max-width: 1024px)`, mobile `(max-width: 767px)`.
- **States.** Hover, focus and active stay all-viewport. Device overrides edit Normal only.
- **Version.** Adding these fields moved the version to 5 (D-036) with a v4 → v5 step that changes nothing.

## Design system document

```json
{
  "schemaVersion": 8,
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

- The root gets `emvb-root`, each node `emvb-<type>` and, when its style, a state, a device override or a hide flag yields a rule, `emvb-e-<id>`. Invalid style values are dropped with a render warning. A reference to an unknown variable is kept and also reported as a warning. Unknown element types render nothing publicly and a placeholder with `data-emvb-id` in the editor (warning `unknown-type`).
- The CSS is, in order: variables on `.emvb-root` (`--emvb-c-*` colours, `--emvb-f-*` fonts, `--emvb-fs-*` font sizes, `--emvb-s-*` spacings), base CSS for the element types in use, then class rules (W-030), then one `.emvb-e-<id>{…}` rule per styled node (R-021). Each class and local rule is followed by its state rules, then the tablet media query, the mobile media query and the hide queries (see [Per-device styles](#per-device-styles-w-096)). A reduced-motion block closes the CSS when a transition is set (see [State styles](#state-styles-w-089)).
- **Style classes** (`design.classes[]`): `{ id, name, style, states?, devices?, hiddenOn? }`. Elements list ids in `node.classes`; HTML gets `emvb-k-<id>` in applied order. Cascade merge for computed styles: `resolveCascade(classStyles, local)` (later wins).
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


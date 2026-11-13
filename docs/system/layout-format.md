# Layout format (schema 18)

How EmVB stores a page and its site-wide design, at layout schema 18 and design schema 17, schema contract 1.0 (W-925, D-065: renames, motion under `motion`, unknown keys kept; see [docs/SCHEMA.md](../SCHEMA.md)); Loop forever on an icon animation in W-853, D-059; the image editor's `edit` record on images in W-481; per-element direction, image link and caption, button icons, table of contents, container queries, and focal points in W-341 onward; visitor segments in W-329; Loop fields in W-330; `ch` lengths and negative margins in W-331). The source of truth is the code: `packages/emvb/src/core/schema/` (Zod schemas), `core/limits.ts`, `core/validate.ts` and `core/migrate/`. Update this file in the same change as any of them (ARCHITECTURE.md § Documentation).

## Where it lives

- **Pages** are entries in the hidden `emvb_pages` collection (D-012, D-019). The layout is the `layout` field (EmDash type `json`, shown with the read-only `emvb:layout` widget). The other fields are `title`, `canvas_mode` (`site-layout` or `blank`) and EmDash's own slug, status, revision and SEO fields. EmDash may hand a `json` field back as a string, so readers accept both (`renderStored` in `src/astro/render.ts`).
- **The design system** (colours, fonts, font sizes, spacings; classes in W-030) is one document in plugin storage, collection `design`, key `system` (D-013). Editors save a draft at key `draft` through `POST /_emdash/api/plugins/emvb/design/save` (W-100, D-040 proposed). `POST .../design/publish` copies that draft onto `system`. The public `GET /_emdash/api/plugins/emvb/design` returns `system` only.

## Page layout

```json
{
  "schemaVersion": 18,
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

- `schemaVersion` is the literal `18` (D-031, D-032, D-034, D-036, D-038, D-039, D-041, D-042, D-044, W-141, D-045, W-160, W-307, W-329, W-341, W-481, W-885, W-925; older documents are upgraded on read by steps that change nothing, except v11 → v12, which rewrites a gradient's `from` and `to` into `stops`, and v17 → v18 (W-925), which renames `section` to `part-ref`, a node's `label` to `editorLabel` and a Loop's `itemPartId` to `partId`, and moves `transition`, `entrance`, `scrollMotion` and `iconAnimation` under `style.motion`). `root` is always a container.
- Every node has `id` (4–24 of `A-Z a-z 0-9 _ -`, unique within the page), `type`, `props`, and optional `style`, `states` (W-089, see [State styles](#state-styles-w-089)), `classes` (up to 20 ids of 1–40 of `a-z 0-9 -`, rendered as `emvb-k-<id>`), `bind` (W-307), `variant` (an A/B arm, W-312) and `audience` (who sees it, W-313, W-329).
- Objects are strict: unknown keys are rejected, not ignored.
- **Unknown element types** (W-022 / R-033): a node whose `type` is not in the known set is kept on save (`id` rules still apply; `props` is an open record; every shared node field, including `devices` and `hiddenOn`, is allowed and checked as on known nodes; optional `children` are validated recursively). Public pages omit it; the editor shows a selectable placeholder. Damaged known nodes (wrong props) still fail validation with path-specific issues.


| Type | `props` | Children | Renders as |
| --- | --- | --- | --- |
| `container` | optional `tag` (`div`, `section`, `header`, `footer`, `main`, `article`, `aside`, `nav`), optional `href` and `newTab` (the box is the link; a link inside a link is dropped) | `children: Node[]` (required, may be empty) | that tag (default `div`) with `class="emvb-container …"` |
| `layout-section` (shown as "Section", W-156) | optional `tag` (as `container`, default `section`), `contentWidth` length, `fullWidth` boolean | `children: Node[]` | that tag with `class="emvb-layout-section …"`, wrapping `<div class="emvb-layout-section-inner">` around the children; the inner box is at most `contentWidth` (default 1140 px, none with `fullWidth`) wide and centred |
| `heading` | `text` (≤ 2000), `level` (1–6), optional `href` (≤ 2000) and `newTab` (W-141), optional `marks` (W-950, see below) | none | `<h1>`–`<h6>`; with a safe `href`, the text is wrapped in `<a class="emvb-heading-link">` (colour and decoration inherited) |
| `spacer` | `height` length | none | `<div aria-hidden="true">` with height in CSS |
| `divider` | `{}` | none | `<hr>` |
| `text` | `text`, optional `tag` (`p` \| `div`), optional `marks` (W-950) | none | `<p>` or `<div>`; formatted words as below |
| `label` | `text` | none | `<span>` |
| `link` | `text`, `href`, optional `newTab` | none | `<a href>` (+ `target`/`rel` when `newTab`) |
| `button` | `text`, optional `href` and `newTab` | none | `<a href>` when `href` is safe, else `<button type="button">` |
| `list` | `items` (string[], ≤ 200), optional `ordered`; W-952: optional `marker` (`disc`, `circle`, `square`, `decimal`, `decimal-leading-zero`, `lower-alpha`, `upper-alpha`, `lower-roman`, `upper-roman`, `steps`, `none`; a number style or `steps` makes it numbered) and `start` (1–9999, numbered only) | none | `<ul>` or `<ol>` (with `start`) with `<li>`; the marker is `list-style-type`, `steps` adds `emvb-list--steps` (numbers in circles, CSS sent only when used) |
| `image` | `src`, `alt`, optional `decorative`, `width`, `height`, `mediaId`, `edit` (editor-only image-editor record, never rendered; see below) | none | `<img loading="lazy">` (decorative → empty `alt` + `role="presentation"`) |
| `icon` | `iconId` (a bundled Lucide id, or `<set prefix>:<name>` from the icon library, W-236), optional `iconSvg` (the picked icon's SVG, ≤ 32768 chars, W-234 / W-239; `iconId` `upload:<id>` for an uploaded SVG), optional `singleColor` (W-238: `true` paints a picked SVG's own fills, strokes and stops in `currentColor`), `size`, `decorative`, `title`, `href` (≤ 2000) and `newTab` (W-141); a non-empty `href` needs a `title` | none | Inline `<svg>`: `iconSvg` sanitized again at render (allowlist; size, id, role and aria attributes replaced), else the bundled Lucide icon (unknown id and no `iconSvg` → placeholder; never a remote URL); with a safe `href`, the svg is hidden inside `<a class="emvb-icon-link" aria-label="title">` |
| `video` | `url`, `title`, optional `mediaId` | none | YouTube/Vimeo privacy `<iframe loading="lazy">` or media `<video controls>` (no autoplay) |
| `form` | `formId` (forms-plugin id; may be empty until bound) | `children: Node[]` (form fields + submit; no nested forms) | Bound: `<form class="emvb-form ec-form" …>`. Unbound: editor placeholder `data-emvb-form-unbound`; omitted on public (no forms runtime). |
| `text-input` | `field`, optional `label`, `placeholder` | none | labelled `<input class="ec-form-input">` + `data-error-for` |
| `textarea` | `field`, optional `label`, `placeholder` | none | labelled `<textarea class="ec-form-input">` + `data-error-for` |
| `select` | `field`, optional `label`, `placeholder` (words the empty first choice; unset is "Choose…", W-686) | none | labelled `<select>` (options from the public form definition when available) |
| `checkbox` | `field`, optional `label` | none | labelled `<input type="checkbox" value="true">` |
| `radio` | `field`, optional `label`, `placeholder` | none | `<fieldset>` of radios (options from definition when available) |
| `submit` | optional `label` | none | `<button type="submit" class="ec-form-submit">` |
| `post-title` | optional `level` (1–6) | none | Dynamic heading from `ThemeDynamicData.post` |
| `post-excerpt` | optional `maxWords` (whole number, 1–10000, W-177) | none | Dynamic excerpt paragraph; with `maxWords`, cut to that many words with "…" |
| `post-content` | (none) | none | Dynamic body (Portable Text → safe blocks) |
| `post-image` | optional `decorative` | none | Dynamic featured image when URL present |
| `post-link` | optional `text`, `newTab` | none | Dynamic permalink; blank text → title |
| `post-date` | optional `format`: `medium` (default), `short`, `long`, `full` or `numeric` (W-177) | none | `<time datetime>` with the published date in UTC; `numeric` is YYYY-MM-DD |
| `post-author` | (none) | none | The author's name |
| `pagination` | optional `prevText`, `nextText`, `showCount` and `countText` (`{page}` and `{total}`; unset text is "Page {page} of {total}"), `titleText` (the paged archive title, `{title}` and `{page}`, W-529), `archiveTitle` (replaces "Posts" as the posts archive title, ≤ 60, W-532), and screen reader names `navLabel` ("Pagination"), `pageLabel` ("Page {page}"), `prevLabel` and `nextLabel` ("Previous page" / "Next page", used when the text is only an arrow), each ≤ 60 (W-689) | none | `nav` of Previous, page numbers and Next. Nothing on a single page, with no archive data, or inside a Loop item |
| `loop` | optional `partId` (the item part; `itemPartId` before schema 18); `perPage` (1–50, unset = 20) on an archive; a collection Loop also takes `collection`, `limit`, `order`, `display`, `columns`, `permalink`, `imageField`, `excerptField` and `filter` (see [Schema 13](#schema-13-the-w-307-feature-batch) and [Schema 14](#schema-14)) | `children: Node[]` (inline item template when no part id) | Repeats the item template for each post or collection entry |
| `grid` | `columns` (1–12); optional `columnsTablet` and `columnsMobile` (1–12, W-139); optional `columnTracks`, `columnTracksTablet`, `columnTracksMobile` (1–12 tracks: `1fr`, `2fr`, `3fr`, `auto`, `min-content`, `max-content`, or a length) | `children: Node[]` | `display: grid` with that many equal columns, or the custom tracks when that device sets them; the device values go in the tablet and mobile media queries, and an unset one follows the next wider device |
| `part-ref` (shown as "Theme section"; `section` before schema 18) | optional `partId` | `children: Node[]` (inline contents when no part id) | When `partId` is set, the published Section theme part's children replace the local ones |

An image's optional `edit` (W-481, D-061) is written by the image editor and never rendered. `src`, `mediaId`, `width` and `height` point at the edited file; `edit` points back at the original: `v` (`1`), `engine` (`"photocn"`), `engineVersion` (such as `"0.1.2"`), `recipe` (photocn's `RecipeV1`, strict: sliders −1 to 1, blur and curve points 0 to 1, at most 32 points per curve channel, straighten ±45°, a filter name of up to 32 letters, digits, spaces, `_` or `-`, a blend image only as a site path or `https:` URL, at most 16 KB as JSON), optional `originalMediaId`, `originalSrc` (up to 2000 characters), `output` (`format` `webp`, `jpeg` or `png`, optional `quality` 0.1 to 1, optional `maxSide` 16 to 10000 px, `stripGps` boolean) and `editedAt` (an ISO 8601 timestamp).

Every node may also carry an optional `editorLabel` (`label` before schema 18; 1–80 characters, trimmed; an editor-only name shown in Layers and on the canvas, never rendered, W-157), optional `htmlId` (CSS `id`, unique on the page; since 1.1.2 an id that names a browser global such as `location` or `document` is kept in the layout but not rendered, S-12), `classes` (style-class ids from the design system, S4), `devices` and `hiddenOn` (W-096, below).

**Forms (S5):** form fields are only valid inside a `form` (or under one). Pages with a form set `needsFormsRuntime`; the host route loads `EmVBFormsRuntime` so `initForms` handles AJAX submit. Pages without a form stay zero EmVB JS (R-031).

### Style properties (W-017, extended in W-088)

**Text marks (W-950).** `marks` on a Heading or Text is up to 100 ranges `{ "start", "end", "bold"?: true, "italic"?: true, "color"?: colour, "href"?, "newTab"?: true }` over its `text` (characters `start` to `end`, end not included, 0–2000). They render as `<strong>`, `<em>`, `<span class="emvb-mark-c<n>">` (the colour as `--emvb-mark-<n>` on the element, up to 8 per element; `.emvb-mark-c<n>{color:var(--emvb-mark-<n>)}` is sent only when a page uses one) and `<a class="emvb-mark-link">` (checked like any link; left out inside a linked heading). Ranges past the text are clipped when drawn, so editing the text never invalidates a page; the editor moves them with the words.

Lengths are `{ "value": 0–10000, "unit": "px" | "rem" | "em" | "%" | "vw" | "vh" | "ch" }` (`vw` and `vh` since W-088, `ch` since W-331). Colours are hex or `{ "var": "<id>" }`. A **size** is a length, a variable reference or `"auto"`. An **offset** is a size whose value may also be negative (−10000 to 10000). A **fluid size** (W-955) is `{ "fluid": { "min": 0–10000, "max": 0–10000 } }` in px: written as `clamp()` growing from `min` on 360 px wide screens to `max` on 1280 px ones (the formula the design's fluid sizes use); `fontSize`, `gap`, the width and height keys, padding and margins (and the offsets) take one.

| Key | Value | CSS |
| --- | --- | --- |
| `flexDirection` | `row`, `column`, `row-reverse`, `column-reverse` | `flex-direction` |
| `flexWrap` | `nowrap`, `wrap`, `wrap-reverse` | `flex-wrap` |
| `justifyContent` | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `space-evenly` | `justify-content` |
| `alignItems` | `stretch`, `flex-start`, `flex-end`, `center`, `baseline` | `align-items` |
| `gap` | length | `gap` |
| `gridColumnSpan` / `gridRowSpan` (W-099) | whole number 1–12 | `grid-column` / `grid-row` as `span N` |
| `gridColumnStart` / `gridRowStart` | whole number 1–13 | `grid-column` / `grid-row` as the line number, or `start / span N` when a span is set too |
| `width` / `height` | size | `width` / `height` |
| `minWidth` / `maxWidth` / `minHeight` / `maxHeight` | length | matching size properties (`maxHeight` since W-088) |
| `flexGrow`, `flexShrink` (W-954) | number 0–100 | `flex-grow`, `flex-shrink`: a Flexbox or Container child's share of free space, and of the shortfall |
| `flexBasis` (W-954) | length or `auto` | `flex-basis`: the child's starting size along the row or column |
| `alignSelf` (W-954) | `auto`, `stretch`, `flex-start`, `flex-end`, `center`, `baseline` | `align-self`: the child's own cross-axis alignment (`auto` follows the parent's Align) |
| `order` (W-954) | whole number −99 to 99 | `order`: the child's place among its siblings (lower first) |
| `overflow` | `visible`, `hidden`, `clip`, `scroll`, `auto` | `overflow` |
| `overflowX`, `overflowY` (W-957) | same as `overflow` | `overflow-x`, `overflow-y`, after `overflow` so one axis wins |
| `aspectRatio` | `"auto"` or `"w/h"` with whole numbers 1–9999, such as `"16/9"` | `aspect-ratio` (`16 / 9`) |
| `objectFit` | `fill`, `contain`, `cover`, `none`, `scale-down` | `object-fit` (the editor offers it on Image and Video) |
| `objectPosition` (W-957) | `center`, `top`, `bottom`, `left`, `right`, `top left`, `top right`, `bottom left`, `bottom right` | `object-position` (Image and Video) |
| `paddingTop` / `Right` / `Bottom` / `Left` | length | `padding-*` |
| `marginTop` / `Right` / `Bottom` / `Left` | offset (negative since W-331) | `margin-*` |
| `position` | `static`, `relative`, `absolute`, `fixed`, `sticky` | `position` |
| `top` / `right` / `bottom` / `left` | offset | matching inset properties |
| `zIndex` | whole number −9999 to 9999 | `z-index` |
| `fontFamily` | a font stack (1–200, checked as safe) or a font variable | `font-family` |
| `fontSize` | length | `font-size` |
| `lineHeight` | length, or a unitless number 0–100 | `line-height` |
| `letterSpacing` | length whose value may be negative (−10000 to 10000) | `letter-spacing` |
| `fontWeight` | `100`–`900` in steps of 100, `normal`, `bold` | `font-weight` |
| `textAlign` | `left`, `center`, `right`, `justify` | `text-align` |
| `textTransform` | `none`, `uppercase`, `lowercase`, `capitalize` | `text-transform` |
| `textDecoration` | `none`, `underline`, `overline`, `line-through` | `text-decoration` (W-113; a button sets `none` in its base CSS) |
| `markerColor`, `markerSize` (W-952, Lists) | colour; length | `--emvb-marker-color`, `--emvb-marker-size`, read by the marker and step rules (sent only when a page sets them) |
| `fontStyle` (W-957) | `normal`, `italic` | `font-style` |
| `whiteSpace` (W-957) | `normal`, `nowrap`, `pre-line`, `pre-wrap` | `white-space` (a Text element defaults to `pre-line`) |
| `overflowWrap` (W-957) | `normal`, `break-word`, `anywhere` | `overflow-wrap` |
| `color` / `backgroundColor` / `borderColor` | colour | matching colour properties |
| `backgroundImage` (W-094) | http(s) URL or a site path, no spaces, quotes or parentheses | `background-image` as `url("…")`. With no size, position or repeat: `cover`, `center`, `no-repeat` |
| `backgroundVideo` | the same URL rule as `backgroundImage` | a muted, looping `<video>` behind the content |
| `backgroundSize` | `auto`, `cover`, `contain` | `background-size` (the image layer) |
| `backgroundPosition` | `center`, an edge (`top`, `bottom`, `left`, `right`) or a corner (`top left` and the other three) | `background-position` |
| `backgroundRepeat` | `no-repeat`, `repeat`, `repeat-x`, `repeat-y` | `background-repeat` |
| `gradient` | `{ type, angle?, position?, stops }`: `type` `linear`, `radial` or `conic`; `angle` whole degrees 0–360 (the linear direction, default 180, or the conic start, default 0); `position` (the radial centre, default `center`) takes the `backgroundPosition` values; `stops` are 2–10 `{ color, at }`, `color` a colour and `at` a whole % 0–100 | `linear-gradient`, `radial-gradient` (a circle) or `conic-gradient`, stops in `at` order, behind the image |
| `overlay` | `{ color, opacity: 0–1 }`, or since W-949 `{ gradient, opacity?: 0–1 }` with the same `gradient` shape | a colour or gradient layer above the image (a scrim). Hex becomes 8-digit hex; a colour variable becomes `color-mix`; a gradient overlay's `opacity` (unset = 1) fades every stop |
| `borderWidth` / `borderRadius` | length | matching border properties: every side or corner |
| `borderTopWidth`, `borderRightWidth`, `borderBottomWidth`, `borderLeftWidth` (W-138) | length | `border-top-width`, `border-inline-end-width`, `border-bottom-width`, `border-inline-start-width`, after `border-width`, so a side beats it |
| `borderTopLeftRadius`, `borderTopRightRadius`, `borderBottomRightRadius`, `borderBottomLeftRadius` (W-138) | length or a spacing variable | `border-start-start-radius`, `border-start-end-radius`, `border-end-end-radius`, `border-end-start-radius`, after `border-radius` |
| `borderStyle` | `none`, `solid`, `dashed`, `dotted` | `border-style` |
| `opacity` | number 0–1 (the editor shows 0–100 %) | `opacity` |
| `boxShadow` | `{ x, y, blur, spread, color?, inset? }`: px numbers, `x`, `y` and `spread` −1000 to 1000, `blur` 0 to 1000; `color` is a colour; `inset` is a boolean | `box-shadow` as `[inset] Xpx Ypx Bpx Spx [colour]`; no colour means the text colour |
| `filter` | `{ blur?, brightness?, contrast?, saturate?, grayscale?, hueRotate? }`, at least one set: `blur` 0–100 px, `brightness` / `contrast` / `saturate` 0–300 %, `grayscale` 0–100 %, `hueRotate` 0–360° | `filter`, functions always in that order, such as `blur(2px) grayscale(100%)` |
| `backdropFilter` (W-957) | the same object as `filter` | `backdrop-filter`, applied to what is behind the element (frosted glass) |
| `transform` (W-953) | `{ x?, y?, scale?, rotate? }`, at least one: `x` and `y` whole px −2000 to 2000, `scale` whole % 10–400, `rotate` whole degrees −360 to 360 | `translate`, `scale` and `rotate` (CSS's own properties, so an entrance never cancels it; a scroll motion or loop on the same property wins while it runs). In a hover state it is a lift; animate it with a `transform` transition |
| `cursor` | `default`, `pointer`, `text`, `move`, `grab`, `not-allowed`, `help`, `crosshair`, `zoom-in` | `cursor` |
| `motion.transition` (W-089, Normal only) | `{ duration, delay?, easing, property }`: `duration` and `delay` whole ms 0–2000; `easing` `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`; `property` `all`, `colors`, `opacity`, `shadow`, `filter`, `transform` (W-953). No other keys | `transition`, one entry per CSS property: `colors` is `color`, `background-color` and `border-color`; `shadow` is `box-shadow`; `transform` is `translate`, `scale` and `rotate`. For example `opacity 200ms ease-out 50ms` |
| `motion.entrance` (W-101, Normal only) | `{ type, duration, delay?, trigger? }`: `type` is `fade`, `fade-up`, `fade-down`, `slide-up`, `slide-down` or `scale`; `duration` and `delay` whole ms 0–2000; `trigger` is `load` (default) or `view` (as it scrolls in; browsers without scroll-driven animations play it on load) | `animation` named `emvb-<type>`, once, `ease-out`, `both`. Reduced motion sets `animation: none` |
| `motion.loop` (W-938, Normal only; 1.0) | `{ effects, duration, easing?, alternate?, loop? }` or `{ type: "none" }`. `effects` as `motion.scroll`; `duration` 200–20000 ms; `easing` a transition easing (default `ease-in-out`); `alternate` false plays one way; `loop: true` never stops | A time-based CSS animation; stops after about 5 s unless `loop`; off for reduced motion. The accessibility check flags Loop forever and runs over 5 s |
| `motion.scroll` (W-319, Normal only; `scrollMotion` before schema 18) | `{ effects, range }` or `{ type: "none" }`. Each effect is `{ type, from, to }`: `type` is `fade`, `move-x`, `move-y`, `scale`, `rotate` or `blur` (one of each). `range` is `enter`, `cross`, `exit` or `page`. `none` stops motion a wider device set | CSS scroll-driven animations. Reduced motion, and browsers without them, show the element still |
| `iconRotate` (W-237, icons) | whole degrees −360 to 360 | `--emvb-icon-rotate`, read by the icon's `svg` as `rotate` |
| `iconFlip` (W-237, icons) | `none`, `horizontal`, `vertical`, `both` | `--emvb-icon-flip` (`1 1`, `-1 1`, `1 -1`, `-1 -1`), read by the `svg` as `scale` |
| `iconScale` (W-237) | number 0.1–4 | `scale` on the element (the icon and its background shape) |
| `iconStrokeWidth` (W-237, outline icons) | number 0.25–6 | `--emvb-icon-stroke`; applies when the stored SVG's root has a stroke width of 1, 1.5, 2, 2.5 or 3 (render moves it into an `emvb-icon-sw<w>` class) |
| `iconShadow` (W-237, icons) | `{ x, y, blur, color? }`: px, `x` and `y` −100 to 100, `blur` 0–100 | `--emvb-icon-shadow` as `drop-shadow(Xpx Ypx Bpx [colour])`, read by the `svg` as `filter` (follows the outline) |
| `motion.icon` (W-237, Normal only; `iconAnimation` before schema 18) | `{ type, duration }`: `type` `spin` or `pulse`; `duration` whole ms 200–10000; optional `loop: true` (W-853, D-059) keeps it running forever. Or `{ type: "none" }` (W-248), which stops an animation a device inherits from a wider one | `--emvb-icon-animation` (`emvb-icon-spin <ms> linear <runs>`, `emvb-icon-pulse <ms> ease-in-out <runs> alternate` or `none`; W-848: `<runs>` is as many whole runs as fit in 5 s, at least one, even for a pulse; with `loop: true` it is `infinite`); the icon base CSS turns it off under `prefers-reduced-motion: reduce` |

**W-088 additions are additive.** Every new key and unit is optional and every earlier value keeps its meaning, so stored pages and classes are valid unchanged. The version moved to 2 (D-031) with a v1 → v2 step that changes nothing, so an older EmVB shows "saved by a newer EmVB" rather than an invalid-layout error. The keys are the same on `node.style` and on `design.classes[].style`. The generator builds each value from typed numbers and keywords only and runs the same `isSafeCssValue` gate as every other property; anything else is dropped with a `rejected-style` warning. A shadow colour bound to a colour variable counts as a use of that variable, and deleting the variable clears it from the page layout and from class styles.

### State styles (W-089)

`node.states` and `design.classes[].states` are `{ "hover"?, "focus"?, "active"? }`. Each state is a style object with the same keys, limits and variable references as `style`, except `motion` (transition, entrance, scroll and icon motion), which belongs to Normal only. Any other state name is refused. Adding `states` moved the version to 3 (D-032) with a v2 → v3 step that changes nothing.

```json
{
  "id": "btn00001",
  "type": "button",
  "props": { "text": "Go" },
  "style": { "backgroundColor": "#1d4ed8", "motion": { "transition": { "duration": 200, "easing": "ease-out", "property": "colors" } } },
  "states": { "hover": { "backgroundColor": "#1e3a8a" }, "focus": { "borderColor": "#f59e0b" } }
}
```

- **Selectors.** `hover` is `:hover`, `focus` is `:focus-visible` (keyboard focus, so a mouse click leaves no focus style); a linked Heading or Icon also matches when its inner link has keyboard focus (`:has(> :is(.emvb-heading-link,.emvb-icon-link):focus-visible)`, W-242) and `active` is `:active`.
- **Cascade.** Each selector's base rule is followed by its `:hover`, `:focus-visible` and `:active` rules, classes first and then the local rule. So a state rule beats every Normal rule (a class's Hover colour shows over a local Normal colour), within one state the local rule beats the class, and Active beats Focus, which beats Hover.
- **Safety.** State values go through the same mappers and `isSafeCssValue` gate as `style`. A rejected value is dropped with a `rejected-style` warning naming `<state>.<key>` (such as `hover.color`); a `motion` inside a state is refused by validation and dropped by the renderer and reported the same way, and so is an unknown state name. An unknown variable in a state is reported like one in `style`. An element whose only styles are states still gets `emvb-e-<id>`.
- **Reduced motion.** When any rule has a `transition`, the CSS ends with one `@media (prefers-reduced-motion: reduce){…{transition:none}}` block that lists exactly those selectors. Nothing else changes under reduced motion.
- **Editor preview.** The canvas CSS repeats every state rule for `[data-emvb-state="hover"|"focus"|"active"]`, and the editor sets that attribute on the selected element while a state is chosen in the Style tab. Public CSS has neither the attribute nor those selectors.

### Per-device styles (W-096)

`node.devices` and `design.classes[].devices` are `{ "laptop"?, "tablet"?, "mobile"? }` (`laptop` since W-956). Each is a style object with the same keys as `style`. Only keys that differ from the wider devices are stored. `node.hiddenOn` and `design.classes[].hiddenOn` are arrays of `"desktop"`, `"laptop"`, `"tablet"` and `"mobile"` (at most one of each). Desktop itself stays in `style`.

- **Queries.** Laptop is `@media (max-width: 1366.98px)`, then tablet `@media (max-width: 1024.98px)`, then mobile `@media (max-width: 767.98px)`. A narrower screen matches every wider query, so the narrowest device wins on a shared key, and a laptop-only key still applies on tablets and phones. The tablet and mobile bounds match `deviceForWidth` (under 768 mobile, under 1025 tablet), which popup targeting and visitor rules use (a laptop is desktop there).
- **Hide.** Each device has its own query, so `display: none` does not leak: desktop `(min-width: 1367px)`, laptop `(min-width: 1025px) and (max-width: 1366.98px)`, tablet `(min-width: 768px) and (max-width: 1024.98px)`, mobile `(max-width: 767.98px)`. An element hidden on both Desktop and Laptop gets the one rule `(min-width: 1025px)`. Before W-956, `"desktop"` meant every screen from 1025 px; schema 17 pages are upgraded to `["desktop", "laptop", …]` on read, so they render byte for byte as before.
- **Grids.** Column counts have no laptop value: laptops use the desktop columns. The `.98` keeps fractional widths from zoom or display scaling (1024.5, say) inside one device, so nothing slips between two hide queries (W-506).
- **Wide screen (W-959, 1.1).** An own `style.wide` record holds the values for 2400 px and up, in `@media (min-width: 2400px)`, built on Desktop's (the narrower devices never overlap it). `style.wide.hidden` overrides the Desktop hide there: `true` adds `(min-width: 2400px)` for an element not hidden on Desktop; `false` on an element hidden on Desktop stops its Desktop rule at `2399.98px`. Without `hidden`, Wide screen follows Desktop and the CSS is what it was. The renderer reads it as one more device (`renderableNode` moves it to `devices.wide` and `wideHidden`). Grid column counts have no Wide screen value.
- **States.** Hover, focus and active stay all-viewport. Device overrides edit Normal only.
- **Version.** Adding these fields moved the version to 5 (D-036) with a v4 → v5 step that changes nothing.

## Design system document

```json
{
  "schemaVersion": 17,
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
- A font size or spacing variable may set `fluid: { min, max }` (px, 0–1000). It is emitted as `clamp()` between `fluidRange` (unset is 360 to 1280 px; `minWidth` must be less than `maxWidth`). `value` stays the fixed fallback (W-316).
- `direction` is `ltr`, `rtl` or `auto` (unset is left to right). It is `dir` on every EmVB root, and hosts get it back for `<html dir>` (W-230).
- `defaults` is a starting style per tag (`h1`–`h6`, `p`, `a`, `button`), emitted under `:where(.emvb-root)` so a class still wins.

## Limits and validation

`validateLayout()` runs on every save (the plugin's `beforeSave` hook) and on every read (editor and public render), in this order:

1. **Size:** the JSON is at most 512 KiB (`MAX_LAYOUT_BYTES`) in UTF-8 bytes.
2. **Version:** `upgradeLayout()` runs the migration chain up to the current version. A document from a newer EmVB is refused with "Update EmVB to edit it", never downgraded.
3. **Structure:** at most 2000 nodes (`MAX_NODES`) and 24 levels (`MAX_DEPTH`), checked iteratively before parsing.
4. **Schema:** the Zod schema above.
5. **Ids:** every node id is unique.

Issues carry a path such as `root.children[0].props.level`, which the editor uses to select the element at fault. A layout that fails on read renders nothing on the public page and logs only the page id (R-033).

## Rendered output

- The root gets `emvb-root`, each node `emvb-<type>` and, when its style, a state, a device override or a hide flag yields a rule, `emvb-e-<id>`. Invalid style values are dropped with a render warning. A reference to an unknown variable is kept and also reported as a warning. Unknown element types render nothing publicly and a placeholder with `data-emvb-id` in the editor (warning `unknown-type`). An unknown node still keeps `dir`, `container` and `query` (W-352), so a later version that understands the type still has them.
- The CSS is, in order: variables on `.emvb-root` (`--emvb-c-*` colours, `--emvb-f-*` fonts, `--emvb-fs-*` font sizes, `--emvb-s-*` spacings), base CSS for the element types in use, then class rules (W-030), then one `.emvb-e-<id>{…}` rule per styled node (R-021). Each class and local rule is followed by its state rules, then the tablet media query, the mobile media query and the hide queries (see [Per-device styles](#per-device-styles-w-096)). A reduced-motion block closes the CSS when a transition is set (see [State styles](#state-styles-w-089)).
- **Style classes** (`design.classes[]`): `{ id, name, style, states?, devices?, hiddenOn? }`. Elements list ids in `node.classes`; HTML gets `emvb-k-<id>` in that order. When two classes set the same property, the one later in `design.classes` wins, because its rule comes later in the stylesheet. Local `.emvb-e-<id>` rules come after every class, so local styles win. `classStylesInListOrder` feeds `resolveCascade` in that list order.
- Length/font style props may use `{ "var": "<id>", "from": "spacing"|"fontSize"|"font" }` (colours keep `{ "var": "<id>" }`). Offsets (`top`, `right`, `bottom`, `left`) take spacing variables; the shadow colour takes a colour variable.
- Text and attributes are escaped by the serializer. Public output has no scripts and no editor `data-emvb-*` attributes (such as `data-emvb-id`). The only `data-emvb-*` attributes it carries are these public hooks (`PUBLIC_DATA_ATTRIBUTES` in `core/public-attributes.ts`, kept in step with this list by a test): `data-emvb-theme-part` on a theme part's wrapper ([theme-parts.md](theme-parts.md#public-render)); `data-emvb-loop-item` (the post id) on each Loop item; `data-emvb-popup`, `data-emvb-popup-config` and `data-emvb-popup-dismiss` on popup chrome; `data-emvb-float`, `data-emvb-float-dismiss` and `data-emvb-float-edge` on float chrome. The popup, float and menu runtimes may add their own state attributes after load (`data-emvb-menu-dismissed`).

## Changing the format

- Add a migration `LAYOUT_MIGRATIONS[n]` (pure, version n to n + 1) and bump `LAYOUT_SCHEMA_VERSION` in the same change.
- Add fixtures and tests for the old and new shapes, and update this file.
- `test/docs/layout-format.test.ts` checks this file's title, the "literal `N`" sentence and the JSON examples against the code, so a schema bump must update them.

## S8 additive elements (W-072–W-074)

- **`div-block`**: block container (`display:block`); children like Container. Optional `href` and `newTab`, like Container.
- **`flexbox`**: flex container defaulting to row + wrap + gap (Container stays column). Optional `href` and `newTab`.
- **`svg`**: `props.markup` (sanitized allowlist; no scripts/handlers/`use`/`foreignObject`); optional `title`, `decorative`, `size`. A valid non-square `viewBox` keeps its ratio: the longer side is `size` (48 when unset) and the other side scales. A square, missing, or unreadable `viewBox` stays a square of `size`.
- **`tabs` / `tab-panel`**: Tabs hold only tab-panels. Public markup is CSS-only (radio + `:has()`); the optional tabs script only takes the hidden radios out of the tab order.
- **`accordion` / `accordion-item`**: items are `<details>`. An item needs `summary` (1–200) and may start `open`. No script.
- **`menu` / `menu-item`**: a `nav` (named by `label`, default "Menu") of links. `direction` is `row` or `column`. An item with children is a dropdown; `wide` stretches that panel across the menu. A menu with a dropdown can load the optional menu script so Escape closes it. An empty menu is a plain box, not a `nav`.
- **`grid`** also takes optional `href` and `newTab`.


## Schema 13: the W-307 feature batch

Schema 13 only adds optional fields, so a v12 document upgrades unchanged.

### Collection Loops (W-308)

A `loop` with `props.collection` (a collection slug) lists that collection's published entries
instead of the archive's posts. `limit` (1–50, default 6), `order` (`newest`, `oldest`, `title`),
`display` (`list`, `grid`, `cards`) and `columns` (1–6) are optional. Hosts fill
`dynamic.collections[loopId]` (see `collectCollectionLoops`). A `loop-empty` child is left out of
the item design and rendered when there are no entries; it is only valid inside a `loop`.

### Data bindings (W-307)

Any node may carry `bind`: prop name → `{ source, key }`. `source` is `post` (a post field such as
`title`, or any plain field of the entry by name, for example `role`), `site` (a site setting:
`title`, `tagline`, `url`, `social.github`…) or `param` (a URL parameter). Which props can be bound
is fixed per element (`BINDABLE_FIELDS`: text, links, image source and alt). The typed prop stays as
the fallback when the source has no value. Bound values are plain text, capped at 500 characters,
and go through the element's own escaping and link and image URL checks.

A link or image bound to `param` only takes same-site URLs: relative ones, or absolute ones on the
page's origin (hosts pass it as `dynamic.origin`). Anything else shows the typed value, unless the
binding sets `outside: true` ("Allow outside sites" in the editor). Anyone can craft a URL
parameter, so that option lets them point the page's links and images at any site.

### A/B tests and visitors (W-312, W-313, W-329)

Any node may set `variant`: `{ test, arm, split? }`. `test` is a name of lowercase letters, digits and `-` (up to 32). `arm` is `a` or `b`. `split` (on the B element, 1–99, unset = 50) is the share of visitors who see B. The host picks one arm per visitor and keeps it in a cookie.

`audience` shows or hides the element. Every field that is set must match, and `hide: true` flips that to "everyone except":

- `countries`: two-letter codes, 1–50
- `devices`: `mobile`, `tablet`, `desktop`
- `visitor`: `new` or `returning`
- `hours`: `{ from, to }` (0–23 and 0–24; wraps past midnight when `to` < `from`) and `days` (0 = Sunday), in `timeZone` (an IANA name; unset = UTC)
- `segments` (W-329): 1–20 names the host passes (`member`, `pro`), lowercase letters, digits, `-` and `_`

A rule the host cannot check does not match. Pages with a variant or an audience are sent `Cache-Control: private, no-store`.

## Schema 14

Schema 14 only adds optional fields, so a v13 document upgrades unchanged.

- **Visitor segments (W-329).** `audience.segments`, above. Hosts pass them as `resolveEmVBPage(Astro, { visitor: { segments } })` and the same option on `resolveThemeParts`. `country`, `device` and `returning` on that object replace what EmVB detects.
- **Loop fields (W-330).** On a collection Loop, `permalink` is a site path containing `{slug}` or `{id}` (unset is `/<collection>/{slug}`). `imageField` and `excerptField` name the entry fields Post Image and Post Excerpt read (unset is `featured_image` and `excerpt`). `filter` is up to five `field=value` pairs separated by `;`. A taxonomy name filters by term, and the same field twice matches either value.
- **`ch` and negative margins (W-331).** Lengths may use `ch`. Margins may be negative (−10000 to 10000). Padding stays 0 or more.

## Internal proposal records (W-928)

Proposals are review data in the plugin-storage collection `emvb_proposals`, not page
revisions. A row holds `{ proposal, createdAt }`, keyed by a server-generated 16-hex id.
The version-1 proposal is `{ version: 1, target: { collection, id }, baseRevision,
baseDesignRevision, ops }`. The plugin adapter currently reads the target entry's
`layout` field (native visual pages and theme parts); arbitrary host canvas-field
selection is not part of this transport. `baseRevision` is EmDash's current `_rev`.
`baseDesignRevision` is the effective draft style revision, or the published style
revision when no draft exists, or null on an empty site. It is checked only when
class/variable ops are present, so page-only proposals survive unrelated style edits.

Operations run in list order against frozen schema 18 ids and names:

- `insert`: `{ kind, parentId, index, node }` — a complete stored node/subtree.
- `move`: `{ kind, id, parentId, index }` — uses editor drop rules; index addresses
  the destination children **before** removal, as in `moveNode`.
- `update`: `{ kind, id, set }` — editable node fields only. `props` shallow-merges;
  other fields replace their whole value, and null clears an optional node field.
  `id`, `type` and `children` cannot be patched. Use `editorLabel`, `props.partId`
  and `style.motion`, not their old aliases.
- `delete`: `{ kind, id }` — never the root.
- `class`: `{ kind, id, value }` — full class upsert, or null to remove an existing id.
- `variable`: `{ kind, group, id, value }` — full variable upsert/removal;
  group is `colors`, `fonts`, `fontSizes` or `spacings`. Payload ids must match the
  operation id. Names must already be clean and unique in their list; no truncation.

`applyProposal(base, proposal, selectedIndexes?)` returns a new `{ layout, design }`
only: it cannot save, publish, acquire an edit lock, or change review/undo state.
Selected indexes refer to the original list; selection order cannot reorder ops.
Each selected intermediate result passes stored-layout/design validation, nesting
rules and the existing URL/SVG/CSS/font allowlists. Unknown layout keys still use
the frozen contract's keep-and-ignore rules. A dependency on an omitted operation,
a missing id, a bad node, a duplicate id, an invalid index or any other refusal
aborts the entire preview. Nothing is partially returned or persisted. W-930 must
feed accepted results through normal undo and draft saves, including the existing
site-wide guards for shared-style deletion; this store never writes site styles.

Creation checks **all** ops and re-reads the base before storage. `STALE_BASE` reports
expected/current revisions and asks the caller to read the current document and
submit a rebased proposal; there is no merge/retry/override. Preparation rechecks the
live revisions, so keeping or reading an old proposal does not make it applicable.
Get/list are review reads, not an applicability guarantee; malformed rows are refused
by get and omitted by list. Per-isolate serialization matches saved sections; there
is no distributed content transaction (the final draft save still needs its own CAS).

Budgets: 100 ops, 512 KiB JSON, 64 JSON nesting levels, and 100 stored proposals per
site; resulting layouts/designs retain all existing byte/node/depth limits. Cycles,
non-JSON values and prototype-manipulation keys are refused before parsing.

Plugin-local editor transport mirrors saved sections: `proposals` (target-filtered
list), `proposals/get`, `proposals/create`, `proposals/withdraw`. Every route requires
`content:edit_any` and EmDash's private-request/CSRF guard. These are not public/MCP
APIs; W-929 adds MCP tools and W-930 adds review UI later. Withdrawal only removes
review data; it cannot affect a page. No per-op review states or agent publish path
are implemented here.

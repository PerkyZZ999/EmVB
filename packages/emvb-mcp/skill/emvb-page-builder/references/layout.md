# Layout format (short)

A layout is `{ schemaVersion, root }`. `root` is a container whose `children` are the page's
bands (usually `layout-section`). Each node has `id`, `type`, `props`, optional `style` (with
`devices.tablet/mobile` overrides and `states.hover/focus`), `classes` (site class ids),
`editorLabel` (an editor-only name), and `children` when it is a parent. Motion lives under
`style.motion` as `{ entrance, scroll, transition, icon }` (Normal only, never in `states`).
A Theme section embed is type `part-ref` with `props.partId`; a Loop's item part is
`props.partId`. Older names (`section`, `label`, `itemPartId`, flat `entrance` and friends) are
still accepted on input and upgraded (schema 18, contract 1.0).

Style values are literals or variable references:

- lengths `{ "value": 24, "unit": "px" }` (px, rem, em, %, vw, vh, ch), or `"auto"` for widths
  and margins;
- colours `"#1e1b4b"` (hex only) or `{ "var": "brand" }`;
- fonts, font sizes, spacings `{ "var": "id", "from": "font" | "fontSize" | "spacing" }`;
- `gradient: { type: "linear", angle: 135, stops: [{ color, at: 0 }, { color, at: 100 }] }`,
  `boxShadow: { x, y, blur, spread, color }`, `backgroundImage` (an https URL), `overlay`;
- flex values use CSS names: `alignItems` is stretch, flex-start, flex-end, center or baseline.
- A border on one side: set `borderWidth` 0, then `borderBottomWidth`, plus `borderStyle` and
  `borderColor`; `borderStyle` alone draws all four sides.

Grids take `props.columns`, `columnsTablet` and `columnsMobile`. Images need `alt` (or
`decorative: true`) and should have `width`/`height` props for their aspect ratio.

The full JSON Schema is the resource `emvb://schema/layout`; the full prose reference is
`emvb://docs/layout-format`. Element props, allowed parents and notes: `list_element_types`.

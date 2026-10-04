export const steps = [
  {
    title: "Edit",
    body: "A full-screen React and Kumo editor inside the EmDash admin. The canvas is a sandboxed iframe with scripts off.",
  },
  {
    title: "Store",
    body: "Each page is one JSON layout in the emvb_pages collection, checked against schema version 9 and the 512 KB limit before it is saved.",
  },
  {
    title: "Render",
    body: "On the server, the layout and the site design become HTML and CSS. Unknown element types render nothing.",
  },
  {
    title: "Serve",
    body: "The host’s Astro route places the result inside its own layout. Visitors download markup and styles.",
  },
] as const;

/** A real node from the Northfold demo and what the renderer made of it. */
export const sample = {
  json: `{
  "id": "page-headin002",
  "type": "heading",
  "props": { "text": "Walk the wild edges of the North.", "level": 1 },
  "style": {
    "color": { "var": "white" },
    "maxWidth": { "value": 860, "unit": "px" }
  },
  "devices": { "mobile": { "fontSize": { "value": 46, "unit": "px" } } }
}`,
  html: `<h1 class="emvb-heading emvb-e-page-headin002">
  Walk the wild edges of the North.
</h1>`,
  css: `.emvb-e-page-headin002{max-width:860px;color:var(--emvb-c-white)}
@media (max-width: 767px){.emvb-e-page-headin002{font-size:46px}}`,
} as const;

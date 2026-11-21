/** The Docs section (W-964): which repo docs appear, in what order, with a one-line summary. */
export type DocEntry = { slug: string; title: string; summary: string };
export type DocGroup = { title: string; docs: DocEntry[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Get started",
    docs: [
      {
        slug: "install-in-a-host-site",
        title: "Install EmVB",
        summary: "Add the package, register the plugin, add the public route and run setup.",
      },
      {
        slug: "upgrade-1.0",
        title: "Upgrade from 0.9 to 1.0",
        summary: "What changes for sites and pages moving to 1.0.",
      },
      {
        slug: "native-page-editing",
        title: "Edit your own pages",
        summary: "EmVB layouts on entries in your own collections, with Edit with EmVB.",
      },
    ],
  },
  {
    title: "Build pages",
    docs: [
      {
        slug: "widgets",
        title: "Widgets",
        summary:
          "Star rating, alert, boxes, testimonial, social icons, gallery, carousel, the 1.3 marketing widgets, and since 1.4 the search form, mega menus, and light and dark with the Theme toggle.",
      },
      {
        slug: "starter-templates",
        title: "Starter templates",
        summary: "Ready-made sections and pages in your Site styles, from Add → Templates.",
      },
      {
        slug: "forms",
        title: "Forms",
        summary:
          "Forms sent to EmDash's forms plugin: steps, number and date boxes, and messages next to the fields.",
      },
      {
        slug: "saved-sections",
        title: "Saved sections",
        summary: "Save any element and reuse it, as a copy or synced everywhere.",
      },
      {
        slug: "popups",
        title: "Popups and off-canvas panels",
        summary: "Popups and slide-in panels, their triggers, and limits by address and date.",
      },
      {
        slug: "motion",
        title: "Motion",
        summary: "Entrance, scroll and hover motion in plain CSS, and sticky header effects.",
      },
      {
        slug: "icon-library",
        title: "Icon library",
        summary: "About 15,000 open-source icons, plus your own uploads.",
      },
      {
        slug: "custom-fonts",
        title: "Custom fonts",
        summary: "Your own WOFF2 files and Google fonts, served from your site.",
      },
      {
        slug: "image-editor",
        title: "Image editor",
        summary: "Crop, adjust, filter and save copies of library pictures.",
      },
      {
        slug: "languages",
        title: "Languages",
        summary: "One version of a page per language, and a language switcher.",
      },
    ],
  },
  {
    title: "Content in and out",
    docs: [
      {
        slug: "scheduled-publishing",
        title: "Schedule publishing",
        summary: "Pick when a page or theme part goes live; EmDash publishes it then.",
      },
      {
        slug: "elementor-import",
        title: "Import from Elementor",
        summary: "Bring Elementor pages and templates over, with a report.",
      },
      {
        slug: "html-import",
        title: "Import from WordPress or HTML",
        summary: "Turn WordPress block content or any HTML page into a draft, with a report.",
      },
      {
        slug: "leaving-emvb",
        title: "Leaving EmVB",
        summary: "Export as HTML or rich text, and remove the plugin cleanly.",
      },
    ],
  },
  {
    title: "AI agents",
    docs: [
      {
        slug: "mcp",
        title: "AI agents (MCP)",
        summary: "Tools that let AI agents read and build draft pages.",
      },
      {
        slug: "co-design",
        title: "Co-design",
        summary: "Review an agent's proposed changes one by one on the canvas.",
      },
    ],
  },
  {
    title: "For developers",
    docs: [
      {
        slug: "extensions",
        title: "Extensions",
        summary:
          "How extensions work, and how to write one: your own elements with their own classes, stylesheet and script.",
      },
      {
        slug: "extensions-api",
        title: "Extensions API reference",
        summary: "Every key and limit of the Extensions API 1.x, and its stability rules.",
      },
      {
        slug: "performance",
        title: "Performance on large pages",
        summary: "What a 2,000-element page costs on the site and in the editor, measured.",
      },
      {
        slug: "schema",
        title: "Schema contract",
        summary: "The stored layout and design formats, stable through 1.x.",
      },
    ],
  },
];

export const ALL_DOCS: DocEntry[] = DOC_GROUPS.flatMap((group) => group.docs);

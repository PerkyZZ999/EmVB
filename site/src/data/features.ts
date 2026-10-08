import { ELEMENT_DESCRIPTORS } from "../../../packages/emvb/src/core/index.ts";

export interface Feature {
  title: string;
  body: string;
}

export interface FeatureGroup {
  id: string;
  label: string;
  items: Feature[];
}

export const featureGroups: FeatureGroup[] = [
  {
    id: "build",
    label: "Build",
    items: [
      {
        title: "Drag, drop, nest",
        body: "Drop elements from the Add panel onto the canvas, then reorder and nest them in the Layers tree or with the keyboard.",
      },
      {
        title: "Edit text in place",
        body: "Double-click a heading or paragraph on the canvas and type.",
      },
      {
        title: "Copy, paste, undo",
        body: "Copy elements and styles between pages, and step back through up to 100 edits with Ctrl or Cmd + Z.",
      },
      {
        title: "An icon library",
        body: "Over 14,000 icons from Lucide, Font Awesome Free, Tabler and Remix, or upload your own SVG.",
      },
      {
        title: "Synced sections and templates",
        body: "A Section element renders a shared part live. New pages can start from a page template.",
      },
    ],
  },
  {
    id: "style",
    label: "Style",
    items: [
      {
        title: "Four states",
        body: "Normal, Hover, Focus and Active, each with its own styles, plus transitions between them.",
      },
      {
        title: "Per device",
        body: "Tablet (up to 1024 px) and mobile (up to 767 px) overrides, and hide on device.",
      },
      {
        title: "Backgrounds",
        body: "Images, linear, radial and conic gradients with up to 10 stops, overlays and background video.",
      },
      {
        title: "Grid and flexbox",
        body: "Flexbox and CSS Grid containers, with 1 to 12 columns and spans on the children.",
      },
      {
        title: "Entrance animations",
        body: "Fade, slide and scale in, with a delay. Reduced motion turns them off.",
      },
    ],
  },
  {
    id: "system",
    label: "Design system",
    items: [
      {
        title: "Variables",
        body: "Colours, fonts, font sizes and spacings, published as CSS custom properties.",
      },
      {
        title: "Classes with a clear order",
        body: "When two classes set the same property, the one lower in the list wins. Local styles still win.",
      },
      {
        title: "Tag defaults",
        body: "Set the look of every h1, paragraph or link once.",
      },
      {
        title: "Staged until published",
        body: "Site style changes wait as a draft until you press Publish styles, then reach every live page.",
      },
      {
        title: "Import and export",
        body: "Move a design between sites as JSON.",
      },
    ],
  },
];

/** The Add panel's groups, in the editor's order. */
const addGroups = [
  { id: "layout", label: "Layout" },
  { id: "content", label: "Content" },
  { id: "dynamic", label: "Dynamic" },
  { id: "form", label: "Form" },
] as const;

/** Every element the Add panel offers (Tab panels come with their Tabs), grouped as it shows them. */
export const addPanel = addGroups.map(({ id, label }) => ({
  id,
  label,
  items: ELEMENT_DESCRIPTORS.filter((d) => d.group === id && d.type !== "tab-panel").map((d) => ({
    type: d.type,
    name: d.name,
  })),
}));

export const elementCount = addPanel.reduce((sum, group) => sum + group.items.length, 0);

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
        body: "Drop elements from the Add panel onto the canvas, then reorder and nest them in the Layers tree.",
      },
      {
        title: "Edit text in place",
        body: "Double-click a heading or paragraph on the canvas and type.",
      },
      {
        title: "Copy, paste, undo",
        body: "Copy elements and styles, paste them elsewhere, and step back through up to 100 edits with Ctrl or Cmd + Z.",
      },
      {
        title: "Synced sections and templates",
        body: "A Section element renders a shared Section part live. New pages can start from a page template.",
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
        body: "Images, two-stop gradients, colour overlays and background video.",
      },
      {
        title: "Grid and flexbox",
        body: "Flexbox and CSS Grid containers, with 1 to 12 columns and column spans.",
      },
      {
        title: "Entrance animations",
        body: "Fade, fade up or down, slide up or down and scale, with a delay. Reduced motion turns them off.",
      },
      {
        title: "Attributes",
        body: "Custom data-* and aria-* attributes on any element.",
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
        body: "Site style changes wait as a draft until you press Publish styles, then update every live page.",
      },
      {
        title: "Import and export",
        body: "Move a design between sites as JSON.",
      },
    ],
  },
];

/** Element families from the element registry, grouped for the elements strip. */
export const elementFamilies = [
  {
    label: "Layout",
    items: ["Section", "Container", "Flexbox", "Grid", "Div block", "Spacer", "Divider"],
  },
  {
    label: "Content",
    items: ["Heading", "Text", "Label", "Link", "Button", "List", "Icon", "SVG"],
  },
  { label: "Media", items: ["Image", "Video"] },
  { label: "Interactive", items: ["Tabs", "Tab panel", "Accordion", "Accordion item"] },
  {
    label: "Forms",
    items: ["Form", "Text input", "Textarea", "Select", "Checkbox", "Radio", "Submit"],
  },
  {
    label: "Dynamic",
    items: [
      "Loop",
      "Post title",
      "Post excerpt",
      "Post content",
      "Post image",
      "Post link",
      "Post date",
      "Post author",
    ],
  },
] as const;

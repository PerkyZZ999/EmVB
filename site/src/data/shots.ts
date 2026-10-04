/**
 * Screenshots of the real EmVB editor and the Northfold demo site, captured by
 * `scripts/capture-screenshots.ts`. Desktop shots are 1440 × 900 CSS px at 2×,
 * phone shots 390 × 844 at 3×, each exported as WebP at two widths.
 */
export type ShotKind = "desktop" | "phone";

export interface Shot {
  name: string;
  kind: ShotKind;
  alt: string;
  caption: string;
}

const desktopWidths = [1600, 2400] as const;
const phoneWidths = [780, 1170] as const;

export const shotSize = {
  desktop: { widths: desktopWidths, ratio: 900 / 1440 },
  phone: { widths: phoneWidths, ratio: 844 / 390 },
} as const;

export function shotSrc(name: string, width: number): string {
  return `/screenshots/${name}-${width}.webp`;
}

export function largestSrc(id: ShotId): string {
  const shot: Shot = shots[id];
  const widths = shotSize[shot.kind].widths;
  return shotSrc(shot.name, widths[widths.length - 1] ?? widths[0]);
}

export const shots = {
  editor: {
    name: "editor",
    kind: "desktop",
    alt: "The EmVB editor: Layers tree on the left, a page with three trip cards on the canvas, a selected card with its Style panel on the right.",
    caption: "The editor. Layers on the left, the live canvas in the middle, styles on the right.",
  },
  editorDark: {
    name: "editor-dark",
    kind: "desktop",
    alt: "The EmVB editor in the EmDash dark theme, with the hero heading selected and its Typography section open.",
    caption: "The editor follows the EmDash admin theme, light or dark.",
  },
  states: {
    name: "states",
    kind: "desktop",
    alt: "A button selected in the editor with the Hover state chosen; its Background is set to the Ember dark colour variable.",
    caption: "Hover, Focus and Active get their own styles. A dot marks states that have values.",
  },
  devices: {
    name: "devices",
    kind: "desktop",
    alt: "The canvas switched to Mobile, showing the hero at phone width while the Typography panel sets a 46 px heading.",
    caption: "Switch to Tablet or Mobile and every change becomes an override for that size.",
  },
  backgrounds: {
    name: "backgrounds",
    kind: "desktop",
    alt: "The hero section selected, with its Background panel showing an image from the media library, cover sizing and a gradient.",
    caption: "Background image, gradient and overlay on one section.",
  },
  grid: {
    name: "grid",
    kind: "desktop",
    alt: "A Grid element with three trip cards selected; the Content panel sets Columns to 3.",
    caption: "CSS Grid containers, from 1 to 12 columns, with spans on the children.",
  },
  forms: {
    name: "forms",
    kind: "desktop",
    alt: "An enquiry form on a dark green band, selected in the editor: bordered name, email, trip and message fields, a checkbox and a Send enquiry button, with the Trip enquiry form chosen in the Content panel.",
    caption:
      "Form elements post to the EmDash forms plugin, with clean default fields you can restyle.",
  },
  siteStyles: {
    name: "site-styles",
    kind: "desktop",
    alt: "The Site styles drawer on the Variables tab, with Export and Import on their own row under the title, eleven colour variables with usage counts, and font variables below.",
    caption:
      "Site styles: colours, fonts, sizes and spacings as variables, with a count of where each is used.",
  },
  classes: {
    name: "classes",
    kind: "desktop",
    alt: "The Classes tab of the Site styles drawer, with the Button class open and its Normal, Hover, Focus and Active state tabs.",
    caption:
      "Classes carry their own states. The one lower in the list wins; local styles still win over both.",
  },
  canvasText: {
    name: "canvas-text",
    kind: "desktop",
    alt: "The hero heading being edited in place on the canvas: the text now reads Walk the wild edges of the North, together, in the heading's own font and colour.",
    caption: "Double-click any text on the canvas to edit it in place.",
  },
  pagesList: {
    name: "pages-list",
    kind: "desktop",
    alt: "The Pages VisualBuilder list in the EmDash admin: five pages with their paths, Published or Draft status and last-edited time, and a New page button.",
    caption: "Pages: every EmVB page with its path and status, one click from the editor.",
  },
  themeBuilder: {
    name: "theme-builder",
    kind: "desktop",
    alt: "The Theme Builder list in the EmDash admin with a page template, a 404 page, a popup, a footer and a header, all published.",
    caption: "Theme Builder: every part, its type, its display conditions and its status.",
  },
  popupEditor: {
    name: "popup-editor",
    kind: "desktop",
    alt: "A popup theme part open in the editor; the settings panel shows an Include Entire site condition and an On click trigger for #get-guide.",
    caption: "Display conditions and popup triggers sit next to the canvas.",
  },
  popup: {
    name: "popup",
    kind: "desktop",
    alt: "The published Northfold page with the route guide popup open over a dimmed hero.",
    caption: "The same popup on the published page, opened by its click trigger.",
  },
  publicDesktop: {
    name: "public-desktop",
    kind: "desktop",
    alt: "The published Northfold home page: a header with navigation and a hero photo of green ridges under the headline Walk the wild edges of the North.",
    caption: "The published page: a header theme part over the page layout.",
  },
  publicMobile: {
    name: "public-mobile",
    kind: "phone",
    alt: "The Northfold hero on a phone, with the navigation hidden and the buttons stacked.",
    caption: "Mobile: the header navigation is hidden on this device.",
  },
  publicMobileTrips: {
    name: "public-mobile-trips",
    kind: "phone",
    alt: "The trip cards stacked into one column on a phone.",
    caption: "The trip grid drops to one column.",
  },
} satisfies Record<string, Shot>;

export type ShotId = keyof typeof shots;

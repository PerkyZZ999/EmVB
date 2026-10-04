import type { ShotId } from "./shots";

export interface Spotlight {
  shot: ShotId;
  /** An optional magnified crop of a second shot, as fractions of its width and height. */
  detail?: { shot: ShotId; label: string; x: number; y: number; w: number; h: number };
  kicker: string;
  title: string;
  body: string;
  points: string[];
}

export const spotlights: Spotlight[] = [
  {
    shot: "states",
    kicker: "States",
    title: "Style the hover, not just the resting state",
    body: "Pick Normal, Hover, Focus or Active above the style sections and edit as usual. EmVB writes the matching selector, with Focus mapped to :focus-visible.",
    points: [
      "Transitions between states, switched off under reduced motion",
      "A dot on each state that has values",
      "Works on elements and on classes",
    ],
  },
  {
    shot: "devices",
    kicker: "Devices",
    title: "Tune every breakpoint on the same canvas",
    body: "Switch the canvas to Tablet or Mobile and every change becomes an override for that size. Desktop values stay where they are.",
    points: [
      "Tablet up to 1024 px, mobile up to 767 px",
      "Hide on desktop, tablet or mobile",
      "Overrides cascade down: desktop, then tablet, then mobile",
    ],
  },
  {
    shot: "siteStyles",
    detail: { shot: "classes", label: "Classes tab", x: 0.8, y: 0.125, w: 0.2, h: 0.64 },
    kicker: "Site styles",
    title: "One design system for the whole site",
    body: "Variables, classes and tag defaults live in the Site styles drawer, next to the canvas. Changes wait as a draft until you press Publish styles, then reach every published page without republishing them.",
    points: [
      "Colour, font, font size and spacing variables",
      "Classes with states; the lower class in the list wins",
      "Design import and export as JSON",
    ],
  },
  {
    shot: "backgrounds",
    kicker: "Backgrounds",
    title: "Layered backgrounds without custom CSS",
    body: "Give any box an image from the media library, a two-stop gradient on top, then a colour overlay. Or a background video.",
    points: [
      "Size, position and repeat for images",
      "Gradient angle and two colours, from variables or values",
      "Overlay colour and opacity",
    ],
  },
];

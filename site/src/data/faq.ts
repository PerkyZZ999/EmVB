export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: "Does EmVB add JavaScript to my site?",
    a: "No EmVB script loads on a normal page. Two small scripts are the exception: the popup script, only on pages where a popup can open, and the tabs script, which adds keyboard support to tabs that already work with CSS alone. Forms use the EmDash forms plugin’s own script.",
  },
  {
    q: "Which EmDash version does it need?",
    a: "EmDash CMS 1.0.x. EmVB is a native plugin. It adds its own section to the admin sidebar with Pages VisualBuilder and Theme Builder.",
  },
  {
    q: "Where does it run?",
    a: "Anywhere EmDash runs. The repository has two demos: Node with SQLite, and Cloudflare Workers with D1 and R2. The same stored layout renders the same way on both.",
  },
  {
    q: "Can editors break the site?",
    a: "Layouts are validated against the schema on save and again on read, so a malformed page is refused rather than rendered. Size limits apply, inline SVG is sanitised, and only editors and above can write.",
  },
  {
    q: "Can I move a design to another site?",
    a: "Yes. The Site styles drawer exports the site design as JSON, and the other site imports it.",
  },
  {
    q: "Is it on npm?",
    a: "Not yet. The package is private for now, so you install it from the repository. The host-site guide walks through it.",
  },
];

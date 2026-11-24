import { project } from "./project";

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: "Does EmVB add JavaScript to my site?",
    a: "Not to a normal page. A few small scripts load only where a page needs them: popups, floating bars, keyboard support for tabs (which already work with CSS alone), Escape for menu dropdowns, and the widget options that need one (a dismissible alert, a gallery lightbox, carousel buttons and autoplay, a counter that counts up, a live countdown, rotating headline words, a Theme toggle, a header that hides while scrolling down). Forms use the EmDash forms plugin’s own script.",
  },
  {
    q: "Which EmDash version does it need?",
    a: `EmVB supports EmDash CMS ${project.supportedEmDashVersions}. Release browser tests run on 1.4.0 and 1.6.0. Stock installs are checked on all three versions on Node and Cloudflare. EmVB adds Pages VisualBuilder and Theme Builder to the admin sidebar.`,
  },
  {
    q: "Where does it run?",
    a: "Anywhere EmDash runs. The repository has two demos: Node with SQLite, and Cloudflare Workers with D1 and R2. The same stored layout renders the same way on both.",
  },
  {
    q: "Can editors break the site?",
    a: "Layouts are validated against the schema on save and again on read, so a malformed page is refused rather than rendered. Size limits apply, SVG is sanitised, and only editors and above can write.",
  },
  {
    q: "Can AI agents build pages?",
    a: "Yes, through MCP, once an admin turns agents on. They change drafts only, unless an admin allows publishing. An agent can also draft a whole page as one proposal: you preview it on the canvas and accept it all or change by change.",
  },
  {
    q: "Can I use my own fonts without Google?",
    a: "Yes. Upload WOFF2 files to a font variable in Site styles, or download a Google font once to your own site. Pages load a font only when they use it, and visitors’ browsers never contact Google or another font host.",
  },
  {
    q: "Can I move from WordPress?",
    a: "Yes, as drafts with a report. Elementor pages and templates import from their exported JSON, and WordPress block content or any HTML page imports with Import HTML. Images can be copied into your media library.",
  },
  {
    q: "Can I move a design to another site?",
    a: "Yes. The Site styles drawer exports the site design as JSON, and the other site imports it.",
  },
  {
    q: "Is it on npm?",
    a: `Yes: ${project.packageName}, version ${project.version}. It ships TypeScript source and your site’s build compiles it. The install guide covers the plugin entry and the public route.`,
  },
];

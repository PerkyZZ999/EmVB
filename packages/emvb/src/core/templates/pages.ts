/** W-1068: whole-page starter templates, each a list of starter sections in order. */
export type PageTemplate = {
  id: string;
  name: string;
  description: string;
  sections: readonly string[];
};

export const PAGE_TEMPLATES: readonly PageTemplate[] = [
  {
    id: "landing",
    name: "Landing page",
    description:
      "Hero, features, numbers, quotes, pricing, questions, a call to action and a footer.",
    sections: ["hero", "features", "stats", "testimonials", "pricing", "faq", "cta", "footer"],
  },
  {
    id: "about",
    name: "About page",
    description: "An introduction, numbers, the team, quotes, a call to action and a footer.",
    sections: ["intro", "stats", "team", "testimonials", "cta", "footer"],
  },
  {
    id: "contact",
    name: "Contact page",
    description: "An introduction, contact details, questions and a footer.",
    sections: ["intro", "contact", "faq", "footer"],
  },
];

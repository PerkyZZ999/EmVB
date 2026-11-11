import { project } from "./project";

export const nav = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#theme-builder", label: "Theme Builder" },
  { href: "/#under-the-hood", label: "Under the hood" },
  { href: "/#faq", label: "FAQ" },
  { href: "/docs/", label: "Documentation" },
  { href: "/playground/", label: "Playground" },
  { href: "/changelog/", label: "Changelog" },
] as const;

/** The footer keeps every home-page section, including those left out of the top bar. */
export const footerNav = [
  ...nav.slice(0, 2),
  { href: "/#styles", label: "Styling" },
  ...nav.slice(2),
] as const;

export const externalLinks = [
  { href: project.repoUrl, label: "GitHub" },
  { href: project.npmUrl, label: "npm" },
] as const;

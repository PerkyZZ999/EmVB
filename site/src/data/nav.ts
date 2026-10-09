import { project } from "./project";

export const nav = [
  { href: "/#features", label: "Features" },
  { href: "/#styles", label: "Styling" },
  { href: "/#theme-builder", label: "Theme Builder" },
  { href: "/#under-the-hood", label: "Under the hood" },
  { href: "/#faq", label: "FAQ" },
  { href: "/playground/", label: "Playground" },
  { href: "/changelog/", label: "Changelog" },
] as const;

export const externalLinks = [
  { href: project.repoUrl, label: "GitHub" },
  { href: project.npmUrl, label: "npm" },
] as const;

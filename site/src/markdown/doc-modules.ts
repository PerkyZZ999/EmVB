import type { MarkdownInstance } from "astro";
import { docSlug } from "./docs";

type Doc = MarkdownInstance<Record<string, unknown>>;

// Rendered from the repository's docs at build time (W-964), like the changelog (W-322).
const modules = {
  ...import.meta.glob<Doc>("../../../docs/guides/*.md", { eager: true }),
  ...import.meta.glob<Doc>(["../../../docs/SCHEMA.md", "../../../docs/EXTENSIONS.md"], {
    eager: true,
  }),
};

/** Each published doc by its site slug. */
export const docModules: ReadonlyMap<string, Doc> = new Map(
  Object.entries(modules).flatMap(([path, module]) => {
    const slug = docSlug(path.replace("../../../", ""));
    return slug ? [[slug, module] as const] : [];
  }),
);

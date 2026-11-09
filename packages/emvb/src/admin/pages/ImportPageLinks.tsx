import { Input } from "@cloudflare/kumo";
import * as React from "react";
import { sanitizeHref } from "../../core/index.ts";
import type { PageSummary } from "../content-api.ts";
import { FIELD } from "../ui.ts";

/** Where WordPress page ids went in earlier imports, so a site imports page by page (W-958). */
const STORAGE_KEY = "emvb-elementor-page-links";

export type PageLinks = Readonly<Record<number, string>>;

export function readPageLinks(): PageLinks {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<number, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = Number(key);
      if (Number.isInteger(id) && id > 0 && typeof value === "string" && value.length <= 2000)
        out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function writePageLinks(links: PageLinks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPageLinks(), ...links }));
  } catch {
    // Storage is off or full: the next import asks again.
  }
}

/**
 * Page links (W-958): an Elementor 4 export links to WordPress pages by id only. Each gets an
 * address on this site (one of your pages, or typed); left empty, its links are left out.
 */
export function ImportPageLinks({
  ids,
  links,
  pages,
  onChange,
}: {
  ids: readonly number[];
  links: PageLinks;
  pages: readonly PageSummary[] | undefined;
  onChange: (id: number, address: string) => void;
}) {
  const listId = React.useId();
  if (ids.length === 0) return null;
  return (
    <fieldset className="emvb-import-links" data-emvb-import-links="">
      <legend className="emvb-import-label">Page links</legend>
      <p className="emvb-helper">
        This export links to WordPress pages by their number. Enter where each goes on this site,
        such as /contact, or pick one of your pages. Leave one empty to leave its links out.
      </p>
      <datalist id={listId}>
        {(pages ?? []).map((page) => (
          <option key={page.id} value={`/${page.slug}`}>
            {page.title}
          </option>
        ))}
      </datalist>
      {ids.map((id) => {
        const value = links[id] ?? "";
        const invalid = value.trim() !== "" && sanitizeHref(value.trim()) === undefined;
        return (
          <Input
            key={id}
            label={`WordPress page ${id}`}
            className={`${FIELD} emvb-mono`}
            list={listId}
            placeholder="/address"
            value={value}
            aria-invalid={invalid || undefined}
            error={invalid ? "Enter an address such as /contact." : undefined}
            onChange={(event) => onChange(id, event.target.value)}
          />
        );
      })}
    </fieldset>
  );
}

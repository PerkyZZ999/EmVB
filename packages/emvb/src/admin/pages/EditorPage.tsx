import { Empty } from "@cloudflare/kumo";
import { CursorClickIcon } from "@phosphor-icons/react";
import { PLUGIN_ID } from "../../constants.ts";
import { RequireEditor } from "../access/RequireEditor.tsx";
import { defaultFetcher, type Fetcher } from "../api.ts";

const PAGES_URL = `/_emdash/admin/plugins/${PLUGIN_ID}/pages`;

function entryFromSearch(search: string): string | null {
  const entry = new URLSearchParams(search).get("entry")?.trim();
  return entry ? entry : null;
}

/** The editor (`/editor`), exported but not declared, so it has no sidebar or palette entry (D-024). */
export function EditorPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  return (
    <RequireEditor fetcher={fetcher}>
      {() => <EditorLanding entry={entryFromSearch(window.location.search)} />}
    </RequireEditor>
  );
}

function EditorLanding({ entry }: { entry: string | null }) {
  if (!entry) {
    return (
      <section data-emvb-page="editor">
        <Empty
          icon={<CursorClickIcon size={32} aria-hidden="true" />}
          title="No page selected"
          description="Choose a page to edit from Visual pages."
          contents={<a href={PAGES_URL}>Go to Visual pages</a>}
        />
      </section>
    );
  }
  return (
    <section data-emvb-page="editor" data-emvb-entry={entry} className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">EmVB editor</h1>
      <p>Page {entry}</p>
    </section>
  );
}

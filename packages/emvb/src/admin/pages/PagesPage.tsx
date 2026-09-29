import { RequireEditor } from "../access/RequireEditor.tsx";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { PageList } from "./PageList.tsx";
import { SetupShell } from "./SetupShell.tsx";

/** "Visual pages" (`/pages`): setup states, then the page list. */
export function PagesPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  return (
    <RequireEditor fetcher={fetcher}>
      {(role) => (
        <SetupShell
          fetcher={fetcher}
          role={role}
          page="pages"
          title="Visual pages"
          keptNote="Existing pages are kept."
        >
          <div data-emvb-setup="ready" className="emvb-pages">
            <PageList fetcher={fetcher} />
          </div>
        </SetupShell>
      )}
    </RequireEditor>
  );
}

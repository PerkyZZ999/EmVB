import { RequireEditor } from "../access/RequireEditor.tsx";
import { defaultFetcher, type Fetcher } from "../api.ts";
import { SetupShell } from "./SetupShell.tsx";
import { ThemePartList } from "./ThemePartList.tsx";

/** Theme Builder (`/theme`): setup states, then the theme parts list. */
export function ThemeBuilderPage({ fetcher = defaultFetcher }: { fetcher?: Fetcher }) {
  return (
    <RequireEditor fetcher={fetcher}>
      {(role) => (
        <SetupShell
          fetcher={fetcher}
          role={role}
          page="theme"
          title="Theme Builder"
          keptNote="Existing content is kept."
        >
          <div data-emvb-setup="ready" className="emvb-pages">
            <ThemePartList fetcher={fetcher} />
          </div>
        </SetupShell>
      )}
    </RequireEditor>
  );
}

import * as React from "react";
import { siteBindingValues } from "../../core/index.ts";
import { readEnvelope, type Fetcher } from "../api.ts";

/**
 * Live values for bound fields on the canvas (W-307): the site's settings, read once, and the
 * URL parameters the editor previews with (`?plan=pro`), which only exist in the editor.
 */
type LiveData = {
  site: Readonly<Record<string, string>>;
  params: Readonly<Record<string, string>>;
  /** The preview query as typed, e.g. `plan=pro&utm_source=mail`. */
  query: string;
  setQuery: (query: string) => void;
};

const EMPTY: LiveData = { site: {}, params: {}, query: "", setQuery: () => undefined };

export const LiveDataContext = React.createContext<LiveData>(EMPTY);

export const useLiveData = () => React.useContext(LiveDataContext);

/** `a=1&b=two` (a leading `?` is fine) as a record, first value per name. */
function previewParams(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const search = new URLSearchParams(query.trim().replace(/^\?/, ""));
  for (const [name, value] of search) if (!Object.hasOwn(params, name)) params[name] = value;
  return params;
}

/** The site's settings as binding values; empty when the role can't read them. */
function useSiteSettings(fetcher: Fetcher): Record<string, string> {
  const [site, setSite] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    let cancelled = false;
    fetcher("/_emdash/api/settings")
      .then(async (response) => {
        if (!response.ok) return;
        const body = await readEnvelope<unknown>(response);
        if (!cancelled) setSite(siteBindingValues(body.data));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetcher]);
  return site;
}

/** Provides live data to the editor. */
export function LiveDataProvider({
  fetcher,
  children,
}: {
  fetcher: Fetcher;
  children: React.ReactNode;
}) {
  const site = useSiteSettings(fetcher);
  const [query, setQuery] = React.useState("");
  const value = React.useMemo(
    () => ({ site, params: previewParams(query), query, setQuery }),
    [site, query],
  );
  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

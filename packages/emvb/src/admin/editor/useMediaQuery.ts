import * as React from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  );
}

/** The editor needs at least 1024 px (D-025); below that the small-screen notice shows. */
export const EDITOR_MIN_WIDTH_QUERY = "(min-width: 1024px)";

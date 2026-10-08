import * as React from "react";
import { exitTarget, PAGES_URL } from "./exit.ts";

/**
 * Where the editor sends someone who leaves it. The EmDash admin is the default; a host that
 * embeds the editor somewhere else (the emvb.dev playground) provides its own.
 */
export type EditorHost = {
  /** Exit, and Discard or Save and leave in the Leave dialog. */
  exit: () => void;
  /** The way back when the editor can't open here (small screen, missing page). */
  back: { label: string; go: () => void };
};

const defaultEditorHost: EditorHost = {
  exit: () => window.location.assign(exitTarget(document.referrer, window.location.origin)),
  back: { label: "Visual pages", go: () => window.location.assign(PAGES_URL) },
};

export const EditorHostContext = React.createContext<EditorHost>(defaultEditorHost);

export const useEditorHost = (): EditorHost => React.useContext(EditorHostContext);

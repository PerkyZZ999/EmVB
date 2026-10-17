import * as React from "react";
import { THEME_PARTS_COLLECTION } from "../../constants.ts";

/**
 * UX-087: what the editor has open, in words. Pages and theme parts share the editor, so copy
 * such as "unsaved changes on this page" names the right thing.
 */
export type EditedNoun = "page" | "theme part";

export const EditedNounContext = React.createContext<EditedNoun>("page");

export const editedNounOf = (collection: string): EditedNoun =>
  collection === THEME_PARTS_COLLECTION ? "theme part" : "page";

export const useEditedNoun = (): EditedNoun => React.useContext(EditedNounContext);

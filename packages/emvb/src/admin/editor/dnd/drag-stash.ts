const ID = "emvb-drag-id";
const TYPE = "emvb-drag-type";

const store = (key: string, value: string, other: string) => {
  try {
    sessionStorage.setItem(key, value);
    sessionStorage.removeItem(other);
  } catch {
    /* private mode */
  }
};

/**
 * The element being dragged, kept in session storage because Chromium hides `getData` during
 * dragover and parent-document Esc/dragend must know a drag is running (K16).
 */
export const dragStash = {
  existing: (id: string) => store(ID, id, TYPE),
  new: (type: string) => store(TYPE, type, ID),
  id: () => sessionStorage.getItem(ID),
  type: () => sessionStorage.getItem(TYPE),
  active: () => Boolean(sessionStorage.getItem(ID) || sessionStorage.getItem(TYPE)),
  clear: () => {
    sessionStorage.removeItem(ID);
    sessionStorage.removeItem(TYPE);
  },
};

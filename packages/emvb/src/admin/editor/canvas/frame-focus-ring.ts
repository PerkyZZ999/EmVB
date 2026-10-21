import { useRef, useState, type SyntheticEvent } from "react";

/**
 * W-809: the canvas iframe is a Tab stop (its document takes the canvas shortcuts), but a focused
 * iframe matches neither :focus nor :focus-visible in Chrome, so CSS alone never drew a ring
 * (WCAG 2.4.7), and the iframe element gets no focus event either. The frame's own window
 * reports its focus here instead. A pointer press inside the page marks
 * the focus as a click, which gets no ring, as :focus-visible would decide.
 */
export function useFrameFocusRing() {
  const [ring, setRing] = useState(false);
  const pointer = useRef(false);
  const onPointer = () => {
    pointer.current = true;
    setRing(false);
  };
  const onFocus = () => {
    setRing(!pointer.current);
    pointer.current = false;
  };
  const onBlur = () => {
    pointer.current = false;
    setRing(false);
  };
  return {
    ring,
    /** Call on the frame's load: listens to its window's focus and to presses in its page. */
    watch: (event: SyntheticEvent<HTMLIFrameElement>) => {
      const win = event.currentTarget.contentWindow;
      const doc = event.currentTarget.contentDocument;
      win?.addEventListener("focus", onFocus);
      win?.addEventListener("blur", onBlur);
      doc?.addEventListener("pointerdown", onPointer, true);
      doc?.addEventListener("mousedown", onPointer, true);
    },
  };
}

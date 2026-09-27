import {
  defaultElement,
  newNodeId,
  type ElementType,
  type LayoutNode,
} from "../../../core/index.ts";

/** Default node for an Add-tile drag. W-016 exposes layout and text types; media/forms arrive later. */
export function newElement(type: string, random?: () => number): LayoutNode | null {
  if (
    !(
      type in
      {
        heading: 1,
        container: 1,
        spacer: 1,
        divider: 1,
        text: 1,
        label: 1,
        link: 1,
        button: 1,
        list: 1,
      }
    )
  ) {
    return null;
  }
  return defaultElement(type as ElementType, newNodeId(random));
}

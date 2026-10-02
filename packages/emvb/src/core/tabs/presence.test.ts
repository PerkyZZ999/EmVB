import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import type { Layout } from "../schema/layout.ts";
import { layoutHasTabs } from "./presence.ts";

describe("layoutHasTabs (W-078)", () => {
  test("false without tabs", () => {
    const layout: Layout = {
      schemaVersion: 7,
      root: {
        ...defaultElement("container", "root0001"),
        children: [defaultElement("heading", "h1")],
      },
    };
    expect(layoutHasTabs(layout)).toBe(false);
  });

  test("true when tabs present", () => {
    const layout: Layout = {
      schemaVersion: 7,
      root: {
        ...defaultElement("container", "root0001"),
        children: [defaultElement("tabs", "tabs0001")],
      },
    };
    expect(layoutHasTabs(layout)).toBe(true);
  });
});

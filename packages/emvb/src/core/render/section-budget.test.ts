import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "./index.ts";

const layoutOf = (children: unknown[]) => ({
  schemaVersion: 17,
  root: { id: "root0001", type: "container", props: {}, children },
});
const sectionRef = (id: string, partId: string) => ({
  id,
  type: "section",
  props: { partId },
  children: [],
});
const leaf = { id: "leaf0001", type: "text", props: { text: "leaf" } };

describe("synced sections inside synced sections (W-653)", () => {
  test("nesting that multiplies stops at the render's budget", () => {
    // Five parts, each placing the next 20 times: 160,000 leaves without a budget.
    const parts = ["pa", "pb", "pc", "pd", "pe"];
    const sectionTemplates: Record<string, unknown> = {};
    parts.forEach((part, k) => {
      const next = parts[k + 1];
      sectionTemplates[part] = layoutOf(
        next
          ? Array.from({ length: 20 }, (_, i) =>
              sectionRef(`n${k}x${String(i).padStart(4, "0")}`, next),
            )
          : [leaf],
      );
    });
    const { html } = renderPage(layoutOf([sectionRef("top00001", "pa")]) as never, emptyDesign(), {
      dynamic: { sectionTemplates } as never,
    });
    const leaves = html.match(/>leaf</g)?.length ?? 0;
    expect(leaves).toBeGreaterThan(0);
    expect(leaves).toBeLessThan(40_000);
  });

  test("an ordinary page with a section used many times renders every copy", () => {
    const sectionTemplates = { pa: layoutOf([leaf]) };
    const refs = Array.from({ length: 50 }, (_, i) =>
      sectionRef(`s${String(i).padStart(7, "0")}`, "pa"),
    );
    const { html } = renderPage(layoutOf(refs) as never, emptyDesign(), {
      dynamic: { sectionTemplates } as never,
    });
    expect(html.match(/>leaf</g)?.length).toBe(50);
  });

  test("the editor says why a copy past the budget is missing (W-657)", () => {
    const parts = ["pa", "pb", "pc", "pd", "pe"];
    const sectionTemplates: Record<string, unknown> = {};
    parts.forEach((part, k) => {
      const next = parts[k + 1];
      sectionTemplates[part] = layoutOf(
        next
          ? Array.from({ length: 20 }, (_, i) =>
              sectionRef(`n${k}x${String(i).padStart(4, "0")}`, next),
            )
          : [leaf],
      );
    });
    const { html } = renderPage(layoutOf([sectionRef("top00001", "pa")]) as never, emptyDesign(), {
      mode: "editor",
      dynamic: { sectionTemplates } as never,
    } as never);
    expect(html).toContain("too many synced copies");
  });
});

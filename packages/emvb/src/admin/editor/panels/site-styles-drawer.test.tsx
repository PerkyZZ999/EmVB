import { afterEach, describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { emptyDesign, type DesignSystem, type Layout } from "../../../core/index.ts";
import { SiteStylesDrawer } from "./SiteStylesDrawer.tsx";
import type { Deletion } from "../restore-deleted.ts";
import { cleanup, mount, rerender, settle } from "../../../../test/dom/mount.ts";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 16,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "A", level: 1 },
        classes: ["card"],
      },
      {
        id: "head0002",
        type: "heading",
        props: { text: "B", level: 2 },
        classes: ["card"],
      },
    ],
  },
};

describe("SiteStylesDrawer (W-032)", () => {
  test("Publish styles is offered only while a draft is unpublished", async () => {
    const calls: string[] = [];
    await mount(
      <SiteStylesDrawer
        design={emptyDesign()}
        layout={layout}
        onDesignChange={async () => undefined}
        unpublished
        onPublishStyles={async () => {
          calls.push("publish");
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const label = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Publish styles",
    )?.textContent;
    expect(label).toBe("Publish styles");
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "Publish styles",
    );
    await act(async () => button?.click());
    expect(calls).toEqual(["publish"]);
  });

  test("the header holds the title and Close; the actions sit in their own row (W-115)", async () => {
    await mount(
      <SiteStylesDrawer
        design={emptyDesign()}
        layout={layout}
        onDesignChange={async () => undefined}
        unpublished
        onPublishStyles={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const labels = (selector: string) =>
      [...document.querySelectorAll(`${selector} button`)].map(
        (button) => button.getAttribute("aria-label") ?? button.textContent,
      );
    expect(labels(".emvb-site-styles-head")).toEqual(["Close site styles"]);
    const actions = document.querySelector("[data-emvb-site-styles-actions]");
    expect(actions?.getAttribute("role")).toBe("group");
    expect(actions?.getAttribute("aria-label")).toBe("Site styles actions");
    expect(actions?.parentElement?.classList.contains("emvb-site-styles")).toBe(true);
    expect(labels("[data-emvb-site-styles-actions]")).toEqual([
      "Publish styles",
      "Export",
      "Import",
    ]);
  });

  test("Variables tab is default with footer; Classes tab lists usage counts", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-site-styles]") !== null).toBe(true);
    expect(
      [...document.querySelectorAll('[role="tab"]')].some((el) => el.textContent === "Variables"),
    ).toBe(true);
    expect(document.querySelector('[data-emvb-site-tab="variables"]') !== null).toBe(true);
    expect(document.querySelector('[data-emvb-var-kind="spacing"]') !== null).toBe(true);
    expect(document.body.textContent).toContain(
      "Style changes stay unpublished until you publish styles.",
    );

    const classesTab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Classes",
    ) as HTMLElement | undefined;
    expect(classesTab !== undefined).toBe(true);
    await act(async () => classesTab?.click());
    expect(document.querySelector('[data-emvb-site-tab="classes"]') !== null).toBe(true);
    expect(document.querySelector('[data-emvb-class-def="card"]')?.textContent).toContain(
      "2 on page",
    );
  });

  test("class edit styles button expands StyleRows and save receives patch", async () => {
    let design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    const saves: DesignSystem[] = [];
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async (next) => {
          design = next;
          saves.push(next);
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const classesTab = [...document.querySelectorAll('[role="tab"]')].find(
      (t) => t.textContent === "Classes",
    ) as HTMLElement | undefined;
    await act(async () => classesTab?.click());
    const row = document.querySelector(
      '[data-emvb-class-def="card"] .emvb-site-item-main',
    ) as HTMLButtonElement | null;
    expect(row?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => row?.click());
    expect(row?.getAttribute("aria-expanded")).toBe("true");
    const keys = document.querySelectorAll(".emvb-site-class-styles [data-emvb-style]");
    expect(new Set([...keys].map((el) => el.getAttribute("data-emvb-style")))).toEqual(
      new Set([
        "flexDirection",
        "flexWrap",
        "justifyContent",
        "alignItems",
        "gap",
        "gridColumnSpan",
        "gridColumnStart",
        "gridRowSpan",
        "gridRowStart",
      ]),
    );
    await act(async () => {
      row?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
    });
    const nameInput = document.querySelector(
      '[data-emvb-class-def="card"] .emvb-site-rename',
    ) as HTMLInputElement | null;
    expect(nameInput?.value ?? null).toBe("Card");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(nameInput, "Card 2");
      nameInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(saves.length).toBe(1);
    expect(saves.at(-1)?.classes?.[0]?.name).toBe("Card 2");
  });
});

describe("publishing feedback (W-724)", () => {
  const publishButton = () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Publish styles"),
    );
  const open = (onPublishStyles: () => Promise<void>) =>
    mount(
      <SiteStylesDrawer
        design={emptyDesign()}
        layout={layout}
        onDesignChange={async () => undefined}
        unpublished
        onPublishStyles={onPublishStyles}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );

  test("W-724: pending publishing has stable feedback and unlocks after success", async () => {
    const pending = Promise.withResolvers<void>();
    try {
      await open(() => pending.promise);
      await act(async () => publishButton()?.click());
      expect(publishButton()?.getAttribute("aria-disabled")).toBe("true");
      expect(publishButton()?.getAttribute("aria-busy")).toBe("true");
      expect(publishButton()?.querySelector('svg[role="status"]') !== null).toBe(true);
      expect(document.querySelector('.emvb-site-styles-footer[role="status"]')?.textContent).toBe(
        "Publishing site styles…",
      );
      expect(
        [...document.querySelectorAll<HTMLButtonElement>("button")]
          .filter((button) => button.textContent === "Import" || button.textContent === "Export")
          .every((button) => !button.disabled),
      ).toBe(true);

      await act(async () => pending.resolve());
      expect(publishButton()?.disabled).toBe(false);
      expect(publishButton()?.getAttribute("aria-disabled")).not.toBe("true");
      expect(publishButton()?.getAttribute("aria-busy")).not.toBe("true");
      expect(document.querySelector('.emvb-site-styles-footer[role="status"]')?.textContent).toBe(
        "Style changes stay unpublished until you publish styles.",
      );
    } finally {
      await act(async () => pending.resolve());
    }
  });

  test("W-724: rapid clicks cannot queue duplicate publishes", async () => {
    const pending = Promise.withResolvers<void>();
    let calls = 0;
    try {
      await open(() => {
        calls++;
        return pending.promise;
      });
      await act(async () => {
        publishButton()?.click();
        publishButton()?.click();
      });
      expect(calls).toBe(1);
    } finally {
      await act(async () => pending.resolve());
    }
  });

  test("W-724: failed publishing retains an actionable error and allows a fresh retry", async () => {
    const pending = Promise.withResolvers<void>();
    let calls = 0;
    try {
      await open(async () => {
        if (++calls === 1) await pending.promise;
      });
      await act(async () => publishButton()?.click());
      await act(async () => pending.reject(new Error("Connection lost. Try again.")));
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Connection lost. Try again.",
      );
      expect(publishButton()?.disabled).toBe(false);
      expect(document.querySelector('.emvb-site-styles-footer[role="status"]')?.textContent).toBe(
        "Style changes stay unpublished until you publish styles.",
      );

      await act(async () => publishButton()?.click());
      expect(calls).toBe(2);
      expect(document.querySelector('[role="alert"]')?.textContent ?? null).toBeNull();
      expect(publishButton()?.disabled).toBe(false);
    } finally {
      await act(async () => pending.resolve());
    }
  });
});

describe("SiteStylesDrawer managers (W-071)", () => {
  test("shows Variables Manager label and CSS tokens", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "brand", name: "Brand", value: "#112233" }],
      },
    };
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-manager-label]")?.textContent).toContain(
      "Variables Manager",
    );
    const row = document.querySelector(
      '[data-emvb-var-id="brand"] .emvb-site-item-main',
    ) as HTMLButtonElement | null;
    expect(row?.title).toBe("Brand · var(--emvb-c-brand)");
    await act(async () => row?.click());
    expect(document.querySelector('[data-emvb-var-id="brand"]')?.textContent).toContain(
      "var(--emvb-c-brand)",
    );
    expect(document.querySelector("[data-emvb-var-swatch]") !== null).toBe(true);
  });

  test("Classes Manager shows cascade help, token, and duplicate", async () => {
    let design: DesignSystem = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: { color: "#112233" } }],
    };
    const saves: DesignSystem[] = [];
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async (next) => {
          design = next;
          saves.push(next);
        }}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const classesTab = [...document.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "Classes",
    ) as HTMLElement | undefined;
    await act(async () => classesTab?.click());
    expect(document.querySelector("[data-emvb-manager-label]")?.textContent).toContain(
      "Classes Manager",
    );
    expect(document.querySelector("[data-emvb-cascade-help]")?.textContent).toMatch(
      /lower in this list wins/,
    );
    expect(document.querySelector('[data-emvb-class-def="card"]')?.textContent).toContain(
      "emvb-k-card",
    );
    const menu = document.querySelector(
      '[data-emvb-class-def="card"] button[aria-label="Actions for Card"]',
    ) as HTMLButtonElement | null;
    await act(async () => menu?.click());
    await settle();
    const dup = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === "Duplicate",
    ) as HTMLElement | undefined;
    expect(dup?.textContent ?? null).toBe("Duplicate");
    await act(async () => dup?.click());
    expect(saves.at(-1)?.classes?.length).toBe(2);
  });
});

describe("SiteStylesDrawer keyboard (W-087)", () => {
  test("keys pressed inside the drawer don't reach the editor's window shortcuts", async () => {
    const seen: string[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.key);
    window.addEventListener("keydown", listener);
    try {
      await mount(
        <SiteStylesDrawer
          design={{ ...emptyDesign(), classes: [{ id: "card", name: "Card", style: {} }] }}
          layout={layout}
          onDesignChange={async () => undefined}
          onLayoutChange={() => undefined}
          onClose={() => undefined}
        />,
      );
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (t) => t.textContent === "Classes",
      ) as HTMLElement | undefined;
      await act(async () => tab?.click());
      const row = document.querySelector(".emvb-site-item-main") as HTMLElement | null;
      for (const key of ["Delete", "Backspace", "Enter", "ArrowDown", "Escape"]) {
        // oxlint-disable-next-line no-await-in-loop -- one key at a time
        await act(async () => {
          row?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        });
      }
      await act(async () => {
        row?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }),
        );
      });
      expect(seen).toEqual(["s"]);
    } finally {
      window.removeEventListener("keydown", listener);
    }
  });
});

describe("deleting a variable from Site styles", () => {
  test("the dialog counts page and class uses, and Delete clears both", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "brand", name: "Brand", value: "#0055ff" }],
      },
      classes: [
        { id: "card", name: "Card", style: { backgroundColor: { var: "brand" }, opacity: 0.5 } },
        { id: "tint", name: "Tint", style: { color: { var: "brand" } } },
      ],
    };
    const page: Layout = {
      schemaVersion: 16,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          {
            id: "head0001",
            type: "heading",
            props: { text: "A", level: 1 },
            style: { color: { var: "brand" } },
          },
        ],
      },
    };
    const saves: DesignSystem[] = [];
    const layouts: Layout[] = [];
    const deletions: Deletion[] = [];
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={page}
        onDesignChange={async (next) => {
          saves.push(next);
        }}
        onLayoutChange={(next) => layouts.push(next)}
        onDeleted={(deletion) => deletions.push(deletion)}
        onClose={() => undefined}
      />,
    );
    const button = (match: (b: HTMLButtonElement) => boolean) =>
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(match);
    await act(async () =>
      button((b) => b.getAttribute("aria-label") === "Actions for Brand")?.click(),
    );
    await settle();
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent === "Delete",
    );
    expect(item?.textContent ?? null).toBe("Delete");
    await act(async () => item?.click());
    await settle();
    const dialog = document.querySelector("[data-emvb-site-confirm]");
    expect(dialog?.textContent ?? "").toContain(
      "In use in 1 place on this page and 2 classes. Deleting drops those bindings.",
    );
    // W-251: other pages and theme parts aren't checked, and the dialog says so.
    expect(dialog?.textContent ?? "").toContain(
      "Other pages and theme parts aren't checked; any that use it lose that styling.",
    );
    await act(async () =>
      [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((b) => b.textContent === "Delete variable")
        ?.click(),
    );
    await settle();
    expect(saves.at(-1)?.variables.colors).toEqual([]);
    // W-252: the drawer reports what it removed and the page it started from, for undo.
    expect(deletions).toHaveLength(1);
    expect(deletions[0]).toMatchObject({ kind: "variable", variableKind: "color", index: 0 });
    expect(deletions[0]?.before).toBe(page);
    expect(saves.at(-1)?.classes).toEqual([
      { id: "card", name: "Card", style: { opacity: 0.5 } },
      { id: "tint", name: "Tint", style: {} },
    ]);
    expect(layouts.at(-1)?.root.children[0]?.style).toBeUndefined();
  });
});

describe("deleting what this page doesn't use (W-251)", () => {
  test("an unused variable's dialog says other pages and theme parts aren't checked", async () => {
    const design: DesignSystem = {
      ...emptyDesign(),
      variables: {
        ...emptyDesign().variables,
        colors: [{ id: "brand", name: "Brand", value: "#0055ff" }],
      },
    };
    const page: Layout = {
      schemaVersion: 16,
      root: { id: "root0001", type: "container", props: {}, children: [] },
    };
    await mount(
      <SiteStylesDrawer
        design={design}
        layout={page}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.getAttribute("aria-label") === "Actions for Brand")
        ?.click(),
    );
    await settle();
    await act(async () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((el) => el.textContent === "Delete")
        ?.click(),
    );
    await settle();
    const text = document.querySelector("[data-emvb-site-confirm]")?.textContent ?? "";
    expect(text).toContain("Not used on this page or by any class.");
    expect(text).toContain(
      "Other pages and theme parts aren't checked; any that use it lose that styling.",
    );
  });
});

test("UX-024: unpublished changes fold under a count instead of listing every change", async () => {
  const published = emptyDesign();
  const design: DesignSystem = {
    ...published,
    variables: {
      ...published.variables,
      colors: [
        { id: "brand", name: "Brand", value: "#1d4ed8" },
        { id: "ink", name: "Ink", value: "#111827" },
      ],
    },
  };
  await mount(
    <SiteStylesDrawer
      design={design}
      published={published}
      layout={layout}
      onDesignChange={async () => undefined}
      unpublished
      onPublishStyles={async () => undefined}
      onLayoutChange={() => undefined}
      onClose={() => undefined}
    />,
  );
  const diff = document.querySelector("[data-emvb-style-diff]");
  expect(diff?.tagName ?? null).toBe("DETAILS");
  expect(diff?.hasAttribute("open") ?? true).toBe(false);
  expect(diff?.querySelector("summary")?.textContent ?? null).toBe("2 unpublished changes");
  expect(diff?.querySelectorAll("li").length ?? 0).toBe(2);
});

test("UX-058: Defaults names tags in words and puts the tag note under Tag", async () => {
  await mount(
    <SiteStylesDrawer
      design={emptyDesign()}
      layout={layout}
      onDesignChange={async () => undefined}
      onLayoutChange={() => undefined}
      onClose={() => undefined}
    />,
  );
  const defaultsTab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (t) => t.textContent === "Defaults",
  );
  await act(async () => defaultsTab?.click());
  const tag = document.querySelector('[role="combobox"][aria-label="Tag"]');
  expect(tag?.textContent?.trim() ?? "no Tag select").toBe("Paragraph (p)");
  const note = document.getElementById(tag?.getAttribute("aria-describedby") ?? "");
  expect(note?.textContent ?? "not described").toBe(
    "Elements of this tag start here. A class or a local style still wins.",
  );
});

test("UX-069: Escape closes Site styles from a tab, but not from a text field", async () => {
  let closed = 0;
  await mount(
    <SiteStylesDrawer
      design={emptyDesign()}
      layout={layout}
      onDesignChange={async () => undefined}
      onLayoutChange={() => undefined}
      onClose={() => {
        closed += 1;
      }}
    />,
  );
  const escape = (target: Element | null) =>
    act(async () => {
      target?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  await escape(document.querySelector("[data-emvb-site-styles] input"));
  expect(closed).toBe(0);
  await escape(document.querySelector('[data-emvb-site-styles] [role="tab"]'));
  expect(closed).toBe(1);
});

test("UX-070: Close gives focus back to the Site styles button", async () => {
  const opener = document.createElement("div");
  opener.setAttribute("data-emvb-editor", "");
  opener.innerHTML = '<button type="button" aria-label="Site styles">Site styles</button>';
  document.body.append(opener);
  try {
    await mount(
      <SiteStylesDrawer
        design={emptyDesign()}
        layout={layout}
        onDesignChange={async () => undefined}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const close = document.querySelector<HTMLElement>('[aria-label="Close site styles"]');
    await act(async () => close?.click());
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(document.activeElement?.getAttribute("aria-label") ?? "none").toBe("Site styles");
  } finally {
    opener.remove();
  }
});

describe("publishing keeps keyboard focus (W-829)", () => {
  const publishButton = () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Publish styles"),
    );
  const exportButton = () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Export",
    );
  const drawer = (unpublished: boolean, onPublishStyles: () => Promise<void>) => (
    <SiteStylesDrawer
      design={emptyDesign()}
      layout={layout}
      onDesignChange={async () => undefined}
      unpublished={unpublished}
      onPublishStyles={onPublishStyles}
      onLayoutChange={() => undefined}
      onClose={() => undefined}
    />
  );

  test("W-829: Publish styles stays focused while publishing and after a failure", async () => {
    const pending = Promise.withResolvers<void>();
    try {
      await mount(drawer(true, () => pending.promise));
      const button = publishButton();
      button?.focus();
      await act(async () => button?.click());
      expect(button?.disabled).toBe(false);
      expect(document.activeElement === button).toBe(true);
      await act(async () => pending.reject(new Error("Connection lost. Try again.")));
      await settle();
      expect(document.activeElement === publishButton()).toBe(true);
    } finally {
      await act(async () => pending.resolve());
    }
  });

  test("W-829: once published, focus moves from Publish styles to Export", async () => {
    const publish = async () => {
      await rerender(drawer(false, publish));
    };
    await mount(drawer(true, publish));
    publishButton()?.focus();
    await act(async () => publishButton()?.click());
    await settle();
    expect(publishButton()).toBeUndefined();
    expect(document.activeElement === exportButton()).toBe(true);
  });
});

test("W-841: deleting a class lands focus on the next row, then New; Cancel goes back to the menu", async () => {
  function Host() {
    const [design, setDesign] = useState<DesignSystem>({
      ...emptyDesign(),
      classes: [
        { id: "card", name: "Card", style: {} },
        { id: "tint", name: "Tint", style: {} },
      ],
    });
    return (
      <SiteStylesDrawer
        design={design}
        layout={layout}
        onDesignChange={async (next) => setDesign(next)}
        onLayoutChange={() => undefined}
        onClose={() => undefined}
      />
    );
  }
  await mount(<Host />);
  const frame = () =>
    act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const button = (match: (b: HTMLButtonElement) => boolean) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(match);
  await act(async () =>
    [...document.querySelectorAll<HTMLElement>('[role="tab"]')]
      .find((tab) => tab.textContent === "Classes")
      ?.click(),
  );
  const ask = async (name: string) => {
    await act(async () =>
      button((b) => b.getAttribute("aria-label") === `Actions for ${name}`)?.click(),
    );
    await settle();
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent === "Delete",
    );
    await act(async () => item?.click());
    await settle();
  };
  const answer = async (label: string) => {
    const target = button((b) => b.textContent === label);
    target?.focus();
    await act(async () => target?.click());
    await settle();
    await frame();
  };
  await ask("Card");
  await answer("Delete class");
  expect(
    document.activeElement?.closest("[data-emvb-class-def]")?.getAttribute("data-emvb-class-def"),
  ).toBe("tint");
  await ask("Tint");
  await answer("Cancel");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Actions for Tint");
  await ask("Tint");
  await answer("Delete class");
  expect(document.activeElement?.textContent).toBe("New");
});

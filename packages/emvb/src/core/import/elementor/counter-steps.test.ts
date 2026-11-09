import { describe, expect, test } from "bun:test";
import { validateLayout } from "../../validate.ts";
import { counterItems } from "./counter-steps.ts";
import { importElementor } from "./index.ts";

const step = (id: string, text: string, extra: string[] = []) => ({
  id,
  elType: "widget",
  widgetType: "e-paragraph",
  settings: {
    classes: { $$type: "classes", value: ["g-step", ...extra] },
    paragraph: { $$type: "string", value: text },
  },
  elements: [],
});

const page = (css: string, children: unknown[]) => ({
  content: [
    {
      id: "panel1",
      elType: "e-div-block",
      settings: { classes: { $$type: "classes", value: ["g-panel"] } },
      elements: children,
    },
  ],
  global_classes: {
    items: {
      "g-step": {
        id: "g-step",
        label: "acme-step",
        variants: [
          {
            meta: { breakpoint: "desktop", state: null },
            props: { "font-size": { $$type: "size", value: { size: 15, unit: "px" } } },
          },
        ],
      },
      "g-panel": { id: "g-panel", label: "acme-panel", variants: [] },
    },
    order: ["g-step", "g-panel"],
  },
  page_settings: { custom_css: css },
});

const COUNTER =
  '/* steps */ .acme-panel{counter-reset:acme} .acme-step::before{counter-increment:acme;content:counter(acme) ".";position:absolute}';

const kids = (imported: ReturnType<typeof importElementor>) => {
  if (!imported.ok) throw new Error(imported.error);
  const panel = (imported.layout.root.children ?? [])[0] as {
    children?: Record<string, unknown>[];
  };
  return panel.children ?? [];
};

describe("steps numbered by the site's CSS (W-961)", () => {
  test("consecutive paragraphs with a counter class become one numbered List", () => {
    const imported = importElementor(
      page(COUNTER, [
        {
          id: "intro1",
          elType: "widget",
          widgetType: "e-paragraph",
          settings: { paragraph: { $$type: "string", value: "Intro" } },
          elements: [],
        },
        step("s1", "Fill in the form"),
        step("s2", "Choose your options"),
        step("s3", "Hear back from us"),
        {
          id: "outro1",
          elType: "widget",
          widgetType: "e-paragraph",
          settings: { paragraph: { $$type: "string", value: "Outro" } },
          elements: [],
        },
      ]),
    );
    const children = kids(imported);
    expect(children.map((c) => c["type"])).toEqual(["text", "list", "text"]);
    const list = children[1] as {
      props: unknown;
      style?: Record<string, unknown>;
      editorLabel?: string;
    };
    expect(list.props).toEqual({
      ordered: true,
      items: ["Fill in the form", "Choose your options", "Hear back from us"],
    });
    expect(list.style).toMatchObject({ fontSize: { value: 15, unit: "px" } });
    expect(list.editorLabel).toBe("Numbered steps");
    if (!imported.ok) return;
    expect(validateLayout(imported.layout).ok).toBe(true);
    expect(imported.notes.map((n) => n.message).join("\n")).toContain("became one numbered List");
  });

  test("a counter style picks the matching marker; without counter CSS the paragraphs stay", () => {
    const roman = kids(
      importElementor(
        page(".acme-step::after{content:counter(acme, upper-roman)}", [
          step("s1", "One"),
          step("s2", "Two"),
        ]),
      ),
    );
    expect(roman[0]?.["props"]).toEqual({
      ordered: true,
      items: ["One", "Two"],
      marker: "upper-roman",
    });
    const plain = kids(
      importElementor(page(".acme-step{color:red}", [step("s1", "One"), step("s2", "Two")])),
    );
    expect(plain.map((c) => c["type"])).toEqual(["text", "text"]);
  });

  test("counter rules are read only from ::before/::after content", () => {
    expect([...counterItems(COUNTER)]).toEqual([
      ["acme-step", { counter: "acme", marker: "decimal" }],
    ]);
    expect(
      counterItems(".a::before{content:'x'} .b{content:counter(n)} .c::marker{content:counter(n)}")
        .size,
    ).toBe(0);
    expect(counterItems('.x::before,.y::after{content:counter(n) ". "}').size).toBe(2);
  });
});

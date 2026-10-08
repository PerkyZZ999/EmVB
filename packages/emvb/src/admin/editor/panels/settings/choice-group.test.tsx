import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { ChoiceGroup, LAYOUT_CHOICES } from "./ChoiceGroup.tsx";

afterEach(cleanup);

// W-247: icon choice rows are radio groups, so they take the radio keys and one Tab stop.

function Harness({ start, seen }: { start?: string; seen: string[] }) {
  const [value, setValue] = React.useState(start);
  return (
    <ChoiceGroup
      label="Direction"
      value={value}
      options={LAYOUT_CHOICES["flexDirection"] ?? []}
      onChange={(next) => {
        seen.push(next);
        setValue(next);
      }}
    />
  );
}

const radios = () => [...document.querySelectorAll<HTMLElement>('[role="radio"]')];
const stops = () =>
  radios()
    .filter((el) => el.tabIndex === 0)
    .map((el) => el.dataset["emvbChoice"]);
const focused = () => (document.activeElement as HTMLElement | null)?.dataset["emvbChoice"];

async function press(key: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("ChoiceGroup keys (W-247)", () => {
  test("with nothing set, only the first option is a Tab stop", async () => {
    await mount(<Harness seen={[]} />);
    expect(stops()).toEqual(["row"]);
  });

  test("arrows move and pick, wrapping; Home and End jump; the picked option is the Tab stop", async () => {
    const seen: string[] = [];
    await mount(<Harness start="row" seen={seen} />);
    radios()[0]?.focus();
    await press("ArrowRight");
    expect(focused()).toBe("column");
    expect(stops()).toEqual(["column"]);
    await press("ArrowDown");
    await press("End");
    expect(focused()).toBe("column-reverse");
    await press("ArrowRight");
    expect(focused()).toBe("row");
    await press("ArrowLeft");
    await press("Home");
    expect(seen).toEqual([
      "column",
      "row-reverse",
      "column-reverse",
      "row",
      "column-reverse",
      "row",
    ]);
    expect(
      radios().find((el) => el.getAttribute("aria-checked") === "true")?.dataset["emvbChoice"],
    ).toBe("row");
  });

  test("other keys are left alone", async () => {
    const seen: string[] = [];
    await mount(<Harness start="row" seen={seen} />);
    radios()[0]?.focus();
    await press("a");
    await press("Tab");
    expect(seen).toEqual([]);
  });
});

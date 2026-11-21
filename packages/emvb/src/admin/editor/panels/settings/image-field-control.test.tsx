import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { FieldControl } from "./FieldControl.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

afterEach(cleanup);

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const FIELD = {
  key: "imageField",
  kind: "text",
  label: "Image field",
  optional: true,
} as const;

const loop = (props: Record<string, unknown>) =>
  ({ id: "loop0001", type: "loop", props, children: [] }) as unknown as LayoutNode;

const schema: Fetcher = async (path) =>
  path.includes("/schema/collections/team")
    ? new Response(
        JSON.stringify({
          data: {
            item: {
              fields: [
                { slug: "name", type: "string", label: "Name" },
                { slug: "photo", type: "image", label: "Photo" },
                { slug: "banner", type: "image", label: "Banner" },
                { slug: "cv", type: "file", label: "CV" },
              ],
            },
          },
        }),
        { status: 200 },
      )
    : new Response("{}", { status: 404 });

const shown = () =>
  document.querySelector('[data-emvb-image-field="list"] button[role="combobox"]')?.textContent ??
  null;

describe("W-1090 (#32): a Loop's Image field is picked from the collection's image fields", () => {
  test("unset shows Automatic with the collection's first image field", async () => {
    const changes: LayoutNode[] = [];
    await mount(
      <FieldControl
        field={FIELD}
        node={loop({ collection: "team" })}
        fetcher={schema}
        onChange={(n) => changes.push(n)}
      />,
    );
    await flush();
    expect(shown()).toContain("Automatic (Photo)");
    expect(document.querySelector('input[data-emvb-field="imageField"]')?.outerHTML ?? null).toBe(
      null,
    );
  });

  test("an explicit field stays chosen, a name not in the list too", async () => {
    await mount(
      <FieldControl
        field={FIELD}
        node={loop({ collection: "team", imageField: "banner" })}
        fetcher={schema}
        onChange={() => undefined}
      />,
    );
    await flush();
    expect(shown()).toContain("Banner");
    await cleanup();
    await mount(
      <FieldControl
        field={FIELD}
        node={loop({ collection: "team", imageField: "headshot" })}
        fetcher={schema}
        onChange={() => undefined}
      />,
    );
    await flush();
    expect(shown()).toContain("headshot (not an image field here)");
  });

  test("without a collection, or when the schema can't be read, it is a text field", async () => {
    await mount(
      <FieldControl
        field={FIELD}
        node={loop({ collection: "secret", imageField: "photo" })}
        fetcher={schema}
        onChange={() => undefined}
      />,
    );
    await flush();
    expect(shown()).toBeNull();
    expect((document.querySelector("input") as HTMLInputElement | null)?.value).toBe("photo");
    await cleanup();
    await mount(
      <FieldControl field={FIELD} node={loop({})} fetcher={schema} onChange={() => undefined} />,
    );
    await flush();
    expect(shown()).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { s1Page } from "../fixtures/layouts.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// The 1.2 widgets: agents list, add and change the 1.2 widgets like any element.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
  await t.agentSettings();
});
afterEach(async () => {
  await t.dispose();
});

type Result = { success: boolean; data?: unknown; error?: { code: string; message: string } };
const call = async <T>(tool: string, input: unknown) =>
  (await t.mcp(tool, input, userWithRole(ROLES.editor))) as Result & { data: T };
const newPage = async () =>
  ((await t.savePage({ title: "Home", layout: s1Page() })) as { data: { item: { id: string } } })
    .data.item.id;
type Element = { type: string; name: string; props: { properties?: Record<string, unknown> } };
const catalogue = async () =>
  new Map(
    (await call<{ elements: Element[] }>("list_element_types", {})).data.elements.map((e) => [
      e.type,
      e,
    ]),
  );

describe("Star rating over MCP (W-1023)", () => {
  test("list_element_types describes it", async () => {
    const rating = (await catalogue()).get("rating");
    expect(rating?.name).toBe("Star rating");
    expect(Object.keys(rating?.props.properties ?? {}).toSorted()).toEqual([
      "label",
      "max",
      "size",
      "value",
    ]);
  });

  test("add_element adds one; an out-of-range value is refused with the reason", async () => {
    const pageId = await newPage();
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "rating", props: { value: 4.5 } },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "rating", props: { value: 12 } },
    });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error)).toContain("value");
  });
});

describe("Alert over MCP (W-1025)", () => {
  test("add_element adds a dismissible warning; an unknown kind is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("alert")?.name).toBe("Alert");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "alert",
        props: { variant: "warning", text: "Maintenance tonight.", dismissible: true },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "alert", props: { variant: "error", text: "x" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Icon box over MCP (W-1020)", () => {
  test("add_element adds a linked icon box; an empty icon id is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("icon-box")?.name).toBe("Icon box");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "icon-box",
        props: { iconId: "star", title: "Fast", text: "Quick.", href: "/features" },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "icon-box", props: { iconId: "", title: "Fast", text: "Quick." } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Image box over MCP (W-1021)", () => {
  test("add_element adds one with alt text; one without alt is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("image-box")?.name).toBe("Image box");
    const element = (alt: string) => ({
      type: "image-box",
      props: { src: "/_emdash/api/media/file/a.jpg", alt, title: "People", text: "Us." },
    });
    expect(
      (await call("add_element", { pageId, parentId: "root0001", element: element("Our team") }))
        .success,
    ).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: element(""),
    });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error)).toContain("Alt text is required");
  });
});

describe("Testimonial over MCP (W-1022)", () => {
  test("add_element adds a rated testimonial; a rating above 10 is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("testimonial")?.name).toBe("Testimonial");
    const element = (rating: number) => ({
      type: "testimonial",
      props: { quote: "It works.", name: "Ada", rating },
    });
    expect(
      (await call("add_element", { pageId, parentId: "root0001", element: element(5) })).success,
    ).toBe(true);
    expect(
      (await call("add_element", { pageId, parentId: "root0001", element: element(11) })).success,
    ).toBe(false);
  });
});

describe("Social icons over MCP (W-1024)", () => {
  test("Social links are allowed only in Social icons; add_element adds a list with links", async () => {
    const types = await catalogue();
    expect(types.get("social-icons")?.name).toBe("Social icons");
    expect(
      (types.get("social-link") as { allowedParents?: string[] } | undefined)?.allowedParents,
    ).toEqual(["social-icons"]);
    const pageId = await newPage();
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "social-icons",
        props: { shape: "circle" },
        children: [
          { type: "social-link", props: { network: "github", href: "https://github.com/emvb" } },
        ],
      },
    });
    expect(added.success).toBe(true);
    const stray = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "social-link", props: { network: "github", href: "https://github.com/x" } },
    });
    expect(stray.success).toBe(false);
  });
});

describe("Gallery over MCP (W-1019)", () => {
  test("add_element adds a lightbox gallery with pictures; a picture alone is refused", async () => {
    expect((await catalogue()).get("gallery")?.name).toBe("Gallery");
    const pageId = await newPage();
    const added = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "gallery",
        props: { lightbox: true, columns: 2 },
        children: [
          { type: "gallery-image", props: { src: "/_emdash/api/media/file/a.jpg", alt: "A" } },
          { type: "gallery-image", props: { src: "/_emdash/api/media/file/b.jpg", alt: "B" } },
        ],
      },
    });
    expect(added.success).toBe(true);
    const stray = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "gallery-image", props: { src: "/a.jpg", alt: "A" } },
    });
    expect(stray.success).toBe(false);
  });
});

describe("Carousel over MCP (W-1018)", () => {
  test("add_element adds a carousel of slides holding elements; a slide alone is refused", async () => {
    expect((await catalogue()).get("carousel")?.name).toBe("Carousel");
    const pageId = await newPage();
    const added = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "carousel",
        props: { arrows: true, dots: true },
        children: [
          {
            type: "carousel-slide",
            props: {},
            children: [{ type: "heading", props: { text: "One", level: 3 } }],
          },
          { type: "carousel-slide", props: { label: "Two" }, children: [] },
        ],
      },
    });
    expect(added.success).toBe(true);
    const stray = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "carousel-slide", props: {}, children: [] },
    });
    expect(stray.success).toBe(false);
  });
});

describe("Counter over MCP (W-1038)", () => {
  test("add_element adds a counting Counter; a count-up over 5 seconds is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("counter")?.name).toBe("Counter");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "counter",
        props: { value: 500, suffix: "+", title: "Sites", countUp: true },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "counter", props: { value: 5, duration: 9000 } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Progress bar over MCP (W-1039)", () => {
  test("add_element adds a progress bar; a max of 0 is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("progress")?.name).toBe("Progress bar");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "progress",
        props: { value: 3, max: 4, label: "Setup", kind: "progressbar" },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "progress", props: { value: 3, max: 0 } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Countdown over MCP (W-1040)", () => {
  test("add_element adds a ticking Countdown; a target without a UTC offset is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("countdown")?.name).toBe("Countdown");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "countdown",
        props: { target: "2027-01-01T00:00+01:00", ticking: true, expired: "hide" },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "countdown", props: { target: "2027-01-01T00:00" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Map over MCP (W-1041)", () => {
  test("add_element adds a Map that loads on request; a latitude off the globe is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("map")?.name).toBe("Map");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "map", props: { address: "Main St", lat: 45.5, lng: -73.56, embed: true } },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "map", props: { address: "Main St", lat: 95 } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Price table over MCP (W-1042)", () => {
  test("add_element adds a plan on sale; a price over 20 characters is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("price-table")?.name).toBe("Price table");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "price-table",
        props: { title: "Team", price: "19", regularPrice: "29", features: ["5 seats"] },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "price-table", props: { title: "Team", price: "x".repeat(21) } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Price list over MCP (W-1043)", () => {
  test("add_element adds a price list with rows; a row outside a price list is refused", async () => {
    const pageId = await newPage();
    const types = await catalogue();
    expect(types.get("price-list")?.name).toBe("Price list");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "price-list",
        props: { label: "Drinks" },
        children: [{ type: "price-list-item", props: { title: "Tea", price: "$2" } }],
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "price-list-item", props: { title: "Tea", price: "$2" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Call to action over MCP (W-1044)", () => {
  test("add_element adds a linked Call to action; an unknown layout is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("cta")?.name).toBe("Call to action");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "cta", props: { title: "Join", href: "/join", buttonText: "Join now" } },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "cta", props: { title: "Join", layout: "under" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Flip box over MCP (W-1045)", () => {
  test("add_element adds a Flip box; an unknown direction is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("flip-box")?.name).toBe("Flip box");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "flip-box",
        props: { frontTitle: "Our team", backTitle: "Meet us", direction: "up" },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "flip-box", props: { frontTitle: "x", direction: "around" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Animated headline over MCP (W-1046)", () => {
  test("add_element adds a rotating headline; empty highlighted words are refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("headline")?.name).toBe("Animated headline");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "headline",
        props: { highlight: "fast", rotate: ["safe"], rotating: true, mark: "circle" },
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: { type: "headline", props: { highlight: "" } },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Share buttons over MCP (W-1047)", () => {
  test("add_element adds Share buttons with links; an unknown service is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("share-buttons")?.name).toBe("Share buttons");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "share-buttons",
        props: { shape: "rounded" },
        children: [{ type: "share-link", props: { network: "bluesky" } }],
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "share-buttons",
        props: {},
        children: [{ type: "share-link", props: { network: "myspace" } }],
      },
    });
    expect(refused.success).toBe(false);
  });
});

describe("Hotspots over MCP (W-1048)", () => {
  test("add_element adds a picture with a marker; a marker off the picture is refused", async () => {
    const pageId = await newPage();
    expect((await catalogue()).get("hotspots")?.name).toBe("Hotspots");
    const added = await call<{ changed: string[] }>("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "hotspots",
        props: { src: "/media/car.jpg", alt: "A car" },
        children: [{ type: "hotspot", props: { title: "Wheel", x: 20, y: 70 } }],
      },
    });
    expect(added.success).toBe(true);
    const refused = await call("add_element", {
      pageId,
      parentId: "root0001",
      element: {
        type: "hotspots",
        props: { src: "/media/car.jpg", alt: "A car" },
        children: [{ type: "hotspot", props: { title: "Wheel", x: 120, y: 70 } }],
      },
    });
    expect(refused.success).toBe(false);
  });
});

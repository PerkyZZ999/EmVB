import { describe, expect, test } from "bun:test";
import type { Layout } from "../../core/index.ts";
import { ApiError } from "../api.ts";
import {
  publishFailureMessage,
  saveFailure,
  slugTakenMessage,
  type SaveStatus,
} from "./useSave.ts";

const layout: Layout = {
  schemaVersion: 12,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text: "A", level: 1 } }],
  },
};
const page = { slug: "about", layout };
const fix: SaveStatus = {
  kind: "error",
  message: "Couldn't save. Fix the highlighted setting and save again.",
  retry: false,
};
const offline: SaveStatus = {
  kind: "error",
  message: "Couldn't save. Check your connection and try again.",
  retry: true,
};

describe("save failures (R-006)", () => {
  test("network errors and 5xx are retryable connection errors", () => {
    expect(saveFailure(new TypeError("fetch failed"), page)).toEqual({ status: offline });
    expect(saveFailure(new ApiError(503, "UNAVAILABLE", "down"), page)).toEqual({
      status: offline,
    });
  });

  test("a 500 is a retryable connection error and a 499 is not (W-091)", () => {
    expect(saveFailure(new ApiError(500, "ERR", "boom"), page)).toEqual({ status: offline });
    expect(saveFailure(new ApiError(499, "ERR", "closed"), page).status).toEqual({
      kind: "error",
      message: "Couldn't save. closed",
      retry: false,
    });
  });

  test("a rejection path with a two-digit index selects that element (W-091)", () => {
    const children = Array.from({ length: 12 }, (_, i) => ({
      id: `head${String(i).padStart(4, "0")}`,
      type: "heading",
      props: { text: "A", level: 1 },
    }));
    const wide: Layout = { schemaVersion: 12, root: { ...layout.root, children } };
    const message = "The page layout is invalid. root.children[11].props.level: too big";
    expect(
      saveFailure(new ApiError(422, "SAVE_REJECTED", message), { ...page, layout: wide }),
    ).toEqual({
      status: fix,
      rejection: message,
      select: "head0011",
    });
  });

  test("a taken slug shows the Slug error and opens page settings", () => {
    expect(saveFailure(new ApiError(409, "SLUG_CONFLICT", "taken"), page)).toEqual({
      status: fix,
      slugError: slugTakenMessage("about"),
      select: null,
    });
  });

  test("any other 409 is an edit conflict", () => {
    expect(saveFailure(new ApiError(409, "CONFLICT", "stale"), page)).toEqual({
      status: {
        kind: "error" as const,
        message: "Couldn't save. This page was changed somewhere else.",
        retry: false,
      },
      conflict: true,
    });
  });

  test("a 400 or 422 selects the element named in the message and shows the rejection", () => {
    const message = "The page layout is invalid. root.children[0].props.level: too big";
    expect(saveFailure(new ApiError(422, "SAVE_REJECTED", message), page)).toEqual({
      status: fix,
      rejection: message,
      select: "head0001",
    });
    expect(saveFailure(new ApiError(400, "BAD", "no path here"), page)).toEqual({
      status: fix,
      rejection: "no path here",
    });
    expect(
      saveFailure(new ApiError(422, "SAVE_REJECTED", "root.children[0]"), {
        ...page,
        layout: null,
      }),
    ).toEqual({ status: fix, rejection: "root.children[0]" });
  });

  test("other client errors show the server's message", () => {
    expect(saveFailure(new ApiError(403, "FORBIDDEN", "Not allowed."), page)).toEqual({
      status: { kind: "error" as const, message: "Couldn't save. Not allowed.", retry: false },
    });
  });

  test("publish failures name the role, a conflict, or the connection", () => {
    expect(publishFailureMessage(new ApiError(403, "FORBIDDEN", "x"))).toBe(
      "Couldn't publish. Your role can't publish pages.",
    );
    expect(publishFailureMessage(new ApiError(409, "CONFLICT", "x"))).toBe(
      "Couldn't publish. This page was changed somewhere else.",
    );
    // W-298: a 404 is the page gone, not a dropped connection.
    expect(publishFailureMessage(new ApiError(404, "NOT_FOUND", "Content item not found"))).toBe(
      "Couldn't publish. This was moved to Trash or deleted: restore it from the Trash, then publish.",
    );
    expect(publishFailureMessage(new ApiError(500, "ERR", "x"))).toBe(
      "Couldn't publish. Check your connection and try again.",
    );
    expect(publishFailureMessage(new Error("offline"))).toBe(
      "Couldn't publish. Check your connection and try again.",
    );
  });
});

describe("signed out mid-edit (W-205)", () => {
  test("a 401 save says to sign in again and offers Retry; a 401 publish says so too", () => {
    const signedOut = new ApiError(401, "UNAUTHORIZED", "Not authenticated");
    expect(saveFailure(signedOut, { slug: "a", layout: null })).toEqual({
      status: {
        kind: "error",
        message: "Couldn't save. You're signed out: sign in again in another tab, then Retry.",
        retry: true,
      },
    });
    expect(publishFailureMessage(signedOut)).toContain("signed out");
  });
});

describe("deleted while open (W-206)", () => {
  test("a 404 save points to the Trash and offers Retry", () => {
    const gone = new ApiError(404, "NOT_FOUND", "Content item not found: 01X");
    const failure = saveFailure(gone, { slug: "a", layout: null });
    expect(failure.status).toMatchObject({ kind: "error", retry: true });
    expect(failure.status.kind === "error" ? failure.status.message : "").toContain("Trash");
  });
});

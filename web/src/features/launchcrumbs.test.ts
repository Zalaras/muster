import { describe, expect, it } from "vitest";
import { splitCrumbs } from "./crumbs";

// splitCrumbs is the pure half of the breadcrumb model (plan new-session-dialog, REQ-5/
// REQ-6/W2) — the DOM half (renderCrumbs) is Playwright's job (docs/conventions.md: no
// jsdom is configured here, rendering is out of scope for this suite).

describe("splitCrumbs", () => {
  it("splits the filesystem root into a single crumb", () => {
    expect(splitCrumbs("/")).toEqual([{ name: "/", path: "/" }]);
  });

  it("splits a single path component", () => {
    expect(splitCrumbs("/a")).toEqual([
      { name: "/", path: "/" },
      { name: "a", path: "/a" },
    ]);
  });

  it("splits a nested path into its full ancestor chain, root first", () => {
    expect(splitCrumbs("/a/b/c")).toEqual([
      { name: "/", path: "/" },
      { name: "a", path: "/a" },
      { name: "b", path: "/a/b" },
      { name: "c", path: "/a/b/c" },
    ]);
  });

  it("tolerates a trailing slash (edge case 6 / W2)", () => {
    expect(splitCrumbs("/a/b/")).toEqual(splitCrumbs("/a/b"));
  });

  it("tolerates a trailing slash on a single-component path", () => {
    expect(splitCrumbs("/a/")).toEqual(splitCrumbs("/a"));
  });

  it("does not collapse the root's own trailing slash into an empty chain", () => {
    // "/" is the one path whose trailing slash IS the whole string — must still yield the
    // root crumb, not an empty array.
    expect(splitCrumbs("/")).toHaveLength(1);
  });

  it("passes a path component with spaces through as a text node untouched (edge case 6)", () => {
    expect(splitCrumbs("/Users/bob/my project/sub dir")).toEqual([
      { name: "/", path: "/" },
      { name: "Users", path: "/Users" },
      { name: "bob", path: "/Users/bob" },
      { name: "my project", path: "/Users/bob/my project" },
      { name: "sub dir", path: "/Users/bob/my project/sub dir" },
    ]);
  });

  it("passes a unicode path component through untouched (edge case 6)", () => {
    expect(splitCrumbs("/repos/café/日本語")).toEqual([
      { name: "/", path: "/" },
      { name: "repos", path: "/repos" },
      { name: "café", path: "/repos/café" },
      { name: "日本語", path: "/repos/café/日本語" },
    ]);
  });

  it("splits only on '/', never re-parsing or escaping a component", () => {
    // A component containing characters that would be meaningful if re-escaped (e.g. a
    // literal backslash) must still come through as plain text, split on '/' only.
    expect(splitCrumbs("/a/b\\c/d")).toEqual([
      { name: "/", path: "/" },
      { name: "a", path: "/a" },
      { name: "b\\c", path: "/a/b\\c" },
      { name: "d", path: "/a/b\\c/d" },
    ]);
  });
});

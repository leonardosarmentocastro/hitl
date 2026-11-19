// scripts/__tests__/changelog.test.ts
import { describe, expect, it } from "vitest";
import { changelogSections, notesBetween } from "../../installer/lib.mjs";

const TEXT = `# Changelog\n\nintro\n\n## Unreleased\n\n- u\n\n## 0.5.0\n\n- five\n\n## 0.4.0\n\n- four a\n- four b\n\n## 0.3.0\n\n- three\n`;

describe("changelogSections and notesBetween", () => {
  it("splits on ## headings and ignores the preamble", () => {
    expect(changelogSections(TEXT).map((s) => s.version)).toEqual([
      "Unreleased",
      "0.5.0",
      "0.4.0",
      "0.3.0",
    ]);
    expect(changelogSections(TEXT)[2].text).toBe("- four a\n- four b");
  });
  it("returns the sections after recorded up to latest, newest first", () => {
    expect(notesBetween(changelogSections(TEXT), "0.3.0", "0.5.0")).toEqual([
      { version: "0.5.0", text: "- five" },
      { version: "0.4.0", text: "- four a\n- four b" },
    ]);
  });
  it("leaves out Unreleased and anything newer than latest", () => {
    expect(notesBetween(changelogSections(TEXT), "0.3.0", "0.4.0").map((s) => s.version)).toEqual([
      "0.4.0",
    ]);
  });
  it("is empty at the same version, for an empty text and for a heading that is no version", () => {
    expect(notesBetween(changelogSections(TEXT), "0.5.0", "0.5.0")).toEqual([]);
    expect(changelogSections("")).toEqual([]);
    expect(notesBetween(changelogSections("## v0.4.0\n\n- x\n"), "0.3.0", "0.4.0")).toEqual([]);
  });
  it("orders by version, not by position in the file", () => {
    const s = changelogSections("## 0.4.0\n\n- a\n\n## 0.10.0\n\n- b\n");
    expect(notesBetween(s, "0.3.0", "0.10.0").map((x) => x.version)).toEqual(["0.10.0", "0.4.0"]);
  });
});

// scripts/__tests__/changelog.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  changelogSections,
  compareVersions,
  notesBetween,
  pluginVersion,
} from "../../installer/lib.mjs";

const ROOT = process.cwd();

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

describe("this repository's CHANGELOG.md", () => {
  const sections = () => changelogSections(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"));
  const released = () => sections().slice(1);

  it("starts with Unreleased, then versions newest first", () => {
    expect(sections()[0].version).toBe("Unreleased");
    const versions = released().map((s) => s.version);
    for (const v of versions) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    for (let i = 1; i < versions.length; i++)
      expect(compareVersions(versions[i - 1], versions[i])).toBe(1);
  });
  it("has a 0.3.0 section", () => {
    expect(released().map((s) => s.version)).toContain("0.3.0");
  });
  it("carries the note that elaborate changed meaning, in exactly one section", () => {
    const hits = sections().filter(
      (s) =>
        s.text.includes("`elaborate` no longer includes the security review") &&
        s.text.includes("`complete`"),
    );
    expect(hits).toHaveLength(1);
  });
  it("while Unreleased holds a note, the plugin version is still the newest released section", () => {
    if (sections()[0].text !== "") expect(pluginVersion(ROOT)).toBe(released()[0].version);
  });
  it("the two version files agree", () => {
    const mkt = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));
    expect(mkt.plugins[0].version).toBe(pluginVersion(ROOT));
  });
});

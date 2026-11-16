// scripts/__tests__/old-paths.test.ts
// hitl's own files live in `.hitl/` since 0.3.0. Nothing hitl installs, and none of the plugin's
// hand-written commands (which the drift tests cannot see), may still name the old places.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHOICES,
  TESTING_ORDER,
  pluginFiles,
  readmeBlock,
  renderAll,
} from "../../installer/lib.mjs";

const ROOT = process.cwd();
const BARE_DOCTRINE = /(?<!\.hitl\/)(?<!doctrine\/)HITL\.md/;
const OLD = [".claude/review-context.md", ".claude/hitl.json"];
// Exact sentences a hand-written command may carry although they name an old path: the source
// of a move, or the test for the old layout. Stripped before the scan; the rest of the file is
// still checked. Slices 2, 3 and 4 add their own sentences.
const MOVE_SOURCE_ALLOWED: Record<string, string[]> = {};

describe("nothing installed names an old path", () => {
  const rendered = renderAll(ROOT, { ...DEFAULT_CHOICES, testing: [...TESTING_ORDER] });
  for (const [path, { content }] of rendered)
    it(path, () => {
      expect(content).not.toMatch(BARE_DOCTRINE);
      for (const o of OLD) expect(content).not.toContain(o);
    });
  it("the README block", () => {
    expect(readmeBlock("0.3.0")).not.toMatch(BARE_DOCTRINE);
  });
});

describe("no hand-written plugin command names an old path", () => {
  const rendered = new Set(
    pluginFiles()
      .map((f) => f.pluginPath)
      .filter((p) => p.startsWith("commands/"))
      .map((p) => p.slice("commands/".length)),
  );
  const handWritten = readdirSync(join(ROOT, "commands")).filter(
    (f) => f.endsWith(".md") && !rendered.has(f),
  );

  it("finds the hand-written commands", () => {
    expect(handWritten).toEqual(expect.arrayContaining(["init.md", "diff.md", "customize.md"]));
  });

  for (const file of handWritten)
    it(file, () => {
      let text = readFileSync(join(ROOT, "commands", file), "utf8");
      for (const allowed of MOVE_SOURCE_ALLOWED[file] ?? []) {
        expect(text).toContain(allowed); // a stale allowance is a failure too
        text = text.replace(allowed, "");
      }
      expect(text).not.toMatch(BARE_DOCTRINE);
      for (const o of OLD) expect(text).not.toContain(o);
    });
});

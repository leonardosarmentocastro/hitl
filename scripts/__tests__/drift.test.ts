// scripts/__tests__/drift.test.ts
// This repository is the first consumer of its own templates: every owned file here must be
// byte-for-byte what /hitl:init renders with this repository's choices. review-context.md is
// repo-specific by definition and is the one exception.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THIS_REPO_CHOICES, renderAll } from "../../installer/lib.mjs";

const ROOT = process.cwd();
const EXCEPT = new Set([".claude/review-context.md"]);

describe("this repository equals its own render", () => {
  const rendered = renderAll(ROOT, THIS_REPO_CHOICES);

  for (const [repoPath, { content, executable }] of rendered) {
    if (EXCEPT.has(repoPath)) continue;
    it(`${repoPath} matches its template`, () => {
      expect(readFileSync(join(ROOT, repoPath), "utf8")).toBe(content);
    });
    if (executable) {
      it(`${repoPath} is executable`, () => {
        expect(statSync(join(ROOT, repoPath)).mode & 0o111).not.toBe(0);
      });
    }
  }

  it(".claude/settings.json carries the Stop hook entry from its template", () => {
    const hookEntry = JSON.parse(
      readFileSync(join(ROOT, "templates/claude/settings.hook.json"), "utf8"),
    );
    const settings = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8"));
    const entries = (settings.hooks?.Stop ?? []).flatMap((s: { hooks: unknown[] }) => s.hooks);
    expect(entries).toContainEqual(hookEntry);
  });

  it("renders the workflow for this repository (ci: github-actions)", () => {
    expect(rendered.has(".github/workflows/wipe-superpowers-docs.yml")).toBe(true);
  });
});

import { agentsBlock } from "../../installer/lib.mjs";

describe("this repository's AGENTS.md carries the hitl block", () => {
  const text = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  it("holds exactly the rendered gates block between the markers", () => {
    const expected = `<!-- hitl:start -->\n${agentsBlock(THIS_REPO_CHOICES.gates, THIS_REPO_CHOICES.testing)}\n<!-- hitl:end -->\n`;
    expect(text).toContain(expected);
    expect(text.split("<!-- hitl:start -->")).toHaveLength(2);
  });
});

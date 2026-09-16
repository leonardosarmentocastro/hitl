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

  it("renders the workflow for this repository (ci: github-actions)", () => {
    expect(rendered.has(".github/workflows/wipe-superpowers-docs.yml")).toBe(true);
  });
});

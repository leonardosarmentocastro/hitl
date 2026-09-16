// scripts/__tests__/self-manifest.test.ts
// This repository is adopted: its manifest records the template hashes for its choices.
// The manifest compares to the render, not to the working tree, so review-context.md's
// local edits do not matter here (the drift test owns that exception).
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  THIS_REPO_CHOICES,
  pluginVersion,
  readManifest,
  renderAll,
  sha256,
} from "../../installer/lib.mjs";

const ROOT = process.cwd();
const REFRESH =
  "a template changed: regenerate .claude/hitl.json — see AGENTS.md, 'Refreshing this repository's manifest'";

describe("this repository's manifest", () => {
  const manifest = readManifest(ROOT);
  const rendered = renderAll(ROOT, THIS_REPO_CHOICES);

  it("exists and records the plugin's own version and choices", () => {
    expect(manifest).not.toBeNull();
    expect(manifest.version).toBe(pluginVersion(ROOT));
    expect(manifest.provider).toBe("github");
    expect(manifest.ci).toBe("github-actions");
    expect(manifest.testing).toEqual([]);
  });

  it("hashes exactly the owned files", () => {
    expect(Object.keys(manifest.files).sort(), REFRESH).toEqual([...rendered.keys()].sort());
  });

  for (const [path, { content }] of renderAll(ROOT, THIS_REPO_CHOICES)) {
    it(`${path} hash equals its render`, () => {
      expect(manifest.files[path], REFRESH).toBe(sha256(content));
    });
  }

  // Acceptance criterion 6, as a test: diff.mjs on this repository, same version, reports
  // every owned file unchanged except the repo-specific review context.
  it("diff.mjs reports every file unchanged except review-context.md", () => {
    const r = spawnSync(
      "node",
      [
        join(ROOT, "installer/diff.mjs"),
        "--repo",
        ROOT,
        "--plugin-root",
        ROOT,
        "--marketplace",
        ROOT,
      ],
      { encoding: "utf8" },
    );
    expect(r.status, `${r.stdout}${r.stderr}\n${REFRESH}`).toBe(0);
    const files: { path: string; state: string }[] = JSON.parse(r.stdout).files;
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.state]));
    expect(byPath[".claude/review-context.md"]).toBe("locally edited");
    for (const f of files) {
      if (f.path === ".claude/review-context.md") continue;
      expect(f.state, `${f.path}: ${REFRESH}`).toBe("unchanged");
    }
  });
});

// scripts/__tests__/brainstorming-command.test.ts
// /hitl:brainstorming is a prompt, validated by a dry run; this pins only what the scripts and
// the later slices depend on.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("/hitl:brainstorming", () => {
  const text = readFileSync(join(ROOT, "commands/brainstorming.md"), "utf8");

  it("is a command with a description", () => {
    expect(text).toMatch(/^---\ndescription: /);
  });

  it("runs the plugin's scripts from the plugin root", () => {
    for (const s of [
      "runtime/context.mjs",
      "runtime/session.mjs",
      "runtime/memory.mjs",
      "installer/discover.mjs",
    ])
      expect(text).toContain(`\${CLAUDE_PLUGIN_ROOT}/${s}`);
  });

  it("carries the fixed copy", () => {
    expect(text).toContain("hitl is installed here — following this repository's rules.");
    expect(text).toContain("issues/19");
    expect(text).toContain("Remember this for this project?");
  });

  it("leaves the worktree procedure to the doctrine", () => {
    expect(text).not.toMatch(/git worktree add/);
  });
});

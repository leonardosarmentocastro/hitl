// scripts/__tests__/lib.test.ts
import { describe, expect, it } from "vitest";
import { ownedFiles, pluginVersion, sha256 } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("installer/lib primitives", () => {
  it("reads the plugin version from .claude-plugin/plugin.json", () => {
    expect(pluginVersion(ROOT)).toBe("0.1.0");
  });

  it("hashes with sha256 hex", () => {
    expect(sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("owns the workflow only when ci is github-actions", () => {
    const withCi = ownedFiles({ provider: "github", ci: "github-actions", testing: [], gates: [] });
    const without = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] });
    const paths = (list: { repoPath: string }[]) => list.map((f) => f.repoPath);
    expect(paths(withCi)).toContain(".github/workflows/wipe-superpowers-docs.yml");
    expect(paths(without)).not.toContain(".github/workflows/wipe-superpowers-docs.yml");
  });

  it("lists every agent, command, the hook, review-context, fixtures and the wipe script", () => {
    const paths = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] }).map(
      (f) => f.repoPath,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "HITL.md",
        ".claude/agents/spec-reviewer.md",
        ".claude/agents/plan-reviewer.md",
        ".claude/agents/slice-reviewer.md",
        ".claude/agents/implementer.md",
        ".claude/agents/fixer.md",
        ".claude/agents/handover.md",
        ".claude/commands/review-spec.md",
        ".claude/commands/review-plan.md",
        ".claude/commands/review-slice.md",
        ".claude/commands/handover.md",
        ".claude/commands/implement-stack.md",
        ".claude/commands/umbrella-pr.md",
        ".claude/hooks/unreviewed-artifact.sh",
        ".claude/review-context.md",
        ".claude/fixtures/spec-fixture-design.md",
        ".claude/fixtures/plans/2026-09-06-spec-fixture-slice-1-schema.md",
        ".claude/fixtures/plans/2026-09-06-spec-fixture-slice-2-api.md",
        "scripts/hitl/wipe-superpowers-docs.sh",
      ]),
    );
    expect(paths).toHaveLength(19);
  });

  it("marks the shell scripts executable and HITL.md as composed", () => {
    const list = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] });
    const byPath = Object.fromEntries(list.map((f) => [f.repoPath, f]));
    expect(byPath[".claude/hooks/unreviewed-artifact.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/wipe-superpowers-docs.sh"].executable).toBe(true);
    expect(byPath["HITL.md"].template).toBeNull();
    expect(byPath[".claude/agents/fixer.md"].template).toBe("claude/agents/fixer.md");
  });
});

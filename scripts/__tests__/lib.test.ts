// scripts/__tests__/lib.test.ts
import { describe, expect, it } from "vitest";
import { ownedFiles, pluginVersion, sha256 } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("installer/lib primitives", () => {
  it("reads the plugin version from .claude-plugin/plugin.json", () => {
    expect(pluginVersion(ROOT)).toBe("0.1.0");
  });

  it("hashes with sha256 hex", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
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
        "scripts/hitl/pr.sh",
        "scripts/hitl/backend.sh",
      ]),
    );
    expect(paths).toHaveLength(21);
  });

  it("marks the shell scripts executable and HITL.md as composed", () => {
    const list = ownedFiles({ provider: "github", ci: "none", testing: [], gates: [] });
    const byPath = Object.fromEntries(list.map((f) => [f.repoPath, f]));
    expect(byPath[".claude/hooks/unreviewed-artifact.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/wipe-superpowers-docs.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/pr.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/backend.sh"].template).toBe("scripts/backends/github.sh");
    expect(byPath["HITL.md"].template).toBeNull();
    expect(byPath[".claude/agents/fixer.md"].template).toBe("claude/agents/fixer.md");
  });
});

import { DEFAULT_CHOICES, parseArgs } from "../../installer/lib.mjs";

describe("parseArgs", () => {
  it("reads --key value pairs", () => {
    expect(parseArgs(["--repo", "/r", "--mode", "check"])).toEqual({ repo: "/r", mode: "check" });
  });
  it("returns null on a dangling flag or a non-flag token", () => {
    expect(parseArgs(["--repo"])).toBeNull();
    expect(parseArgs(["repo", "/r"])).toBeNull();
  });
  it("exposes the default choices used by check mode", () => {
    expect(DEFAULT_CHOICES).toEqual({
      provider: "github",
      ci: "github-actions",
      testing: [],
      gates: [],
    });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TESTING_ORDER, composeHitl } from "../../installer/lib.mjs";

describe("composeHitl", () => {
  const core = readFileSync(join(ROOT, "templates/HITL.md"), "utf8");

  it("returns the core unchanged when nothing is chosen", () => {
    const out = composeHitl(ROOT, []);
    expect(out).toBe(core);
    expect(out).not.toContain("## Testing and gates");
  });

  it("appends one heading and the chosen fragments in TESTING_ORDER, whatever the input order", () => {
    const out = composeHitl(ROOT, ["hooks", "e2e", "ci"]);
    expect(out.startsWith(core.trimEnd())).toBe(true);
    expect(out.split("## Testing and gates")).toHaveLength(2);
    const at = (h: string) => out.indexOf(h);
    expect(at("### End-to-end tests")).toBeLessThan(at("### Continuous integration"));
    expect(at("### Continuous integration")).toBeLessThan(at("### Commit hooks"));
    expect(out).not.toContain("### Test tiers");
    expect(out).not.toContain("### Effective-date regimes");
  });

  it("has a fragment file for every id in TESTING_ORDER, each with one ### heading", () => {
    for (const id of TESTING_ORDER) {
      const text = readFileSync(join(ROOT, `templates/testing/${id}.md`), "utf8");
      expect(text.match(/^### /gm), id).toHaveLength(1);
      expect(text.endsWith("\n"), id).toBe(true);
    }
  });

  it("ends with exactly one newline", () => {
    const out = composeHitl(ROOT, TESTING_ORDER);
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});

import { agentsBlock } from "../../installer/lib.mjs";

describe("agentsBlock", () => {
  it("lists one bullet per gate", () => {
    expect(agentsBlock(["pnpm test", "pnpm lint"])).toBe(
      "<!-- hitl:knob local-gates -->\n## Local gates\n\n- `pnpm test`\n- `pnpm lint`",
    );
  });
  it("writes the none-yet line when there is no gate", () => {
    expect(agentsBlock([])).toBe(
      "<!-- hitl:knob local-gates -->\n## Local gates\n\nnone yet — the first TDD task adds the harness and names its command here",
    );
  });
  it("adds the pilots section only when effective-date is chosen", () => {
    expect(agentsBlock(["pnpm test"], ["e2e"])).not.toContain("## Effective-date pilots");
    expect(agentsBlock(["pnpm test"], ["effective-date"])).toBe(
      "<!-- hitl:knob local-gates -->\n## Local gates\n\n- `pnpm test`\n\n<!-- hitl:knob effective-date-pilots -->\n## Effective-date pilots\n\n- (none yet — name the area a new rule applies to first, one per line)",
    );
  });
});

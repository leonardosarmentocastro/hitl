// scripts/__tests__/lib.test.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  manifestFor,
  ownedFiles,
  readmeBlock,
  pluginFiles,
  pluginVersion,
  renderMode,
  sha256,
} from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("installer/lib primitives", () => {
  it("reads the plugin version from .claude-plugin/plugin.json", () => {
    const root = mkdtempSync(join(tmpdir(), "hitl-version-"));
    mkdirSync(join(root, ".claude-plugin"));
    writeFileSync(join(root, ".claude-plugin/plugin.json"), JSON.stringify({ version: "1.2.3" }));
    expect(pluginVersion(root)).toBe("1.2.3");
  });

  it("hashes with sha256 hex", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("owns neither the wipe workflow nor the wipe script, whatever ci says", () => {
    for (const ci of ["github-actions", "none", undefined]) {
      const paths = ownedFiles({ provider: "github", ci, testing: [], gates: [] }).map(
        (f) => f.repoPath,
      );
      expect(paths, String(ci)).not.toContain(".github/workflows/wipe-superpowers-docs.yml");
      expect(paths, String(ci)).not.toContain("scripts/hitl/wipe-superpowers-docs.sh");
    }
  });

  it("records no ci key in the manifest", () => {
    const m = manifestFor(
      "1.0.0",
      { provider: "github", ci: "github-actions", testing: [] },
      new Map(),
    );
    expect(m).toEqual({ version: "1.0.0", provider: "github", testing: [], files: {} });
  });

  it("lists every agent, command, the hook, review-context, fixtures and the scripts", () => {
    const paths = ownedFiles({ provider: "github", testing: [], gates: [] }).map((f) => f.repoPath);
    expect(paths).toEqual(
      expect.arrayContaining([
        ".hitl/HITL.md",
        ".claude/agents/spec-reviewer.md",
        ".claude/agents/plan-reviewer.md",
        ".claude/agents/slice-reviewer.md",
        ".claude/agents/implementer.md",
        ".claude/agents/fixer.md",
        ".claude/agents/handover.md",
        ".claude/agents/adversarial-reviewer.md",
        ".claude/agents/security-reviewer.md",
        ".claude/commands/review-spec.md",
        ".claude/commands/review-plan.md",
        ".claude/commands/review-slice.md",
        ".claude/commands/handover.md",
        ".claude/commands/implement-stack.md",
        ".claude/commands/umbrella-pr.md",
        ".claude/hooks/unreviewed-artifact.sh",
        ".hitl/review-context.md",
        ".claude/fixtures/spec-fixture-design.md",
        ".claude/fixtures/spec-fixture-elaborate-design.md",
        ".claude/fixtures/spec-fixture-complete-design.md",
        ".claude/fixtures/plans/2026-09-06-spec-fixture-slice-1-schema.md",
        ".claude/fixtures/plans/2026-09-06-spec-fixture-slice-2-api.md",
        ".claude/fixtures/slice/slice-fixture.patch",
        ".claude/fixtures/slice/2026-09-06-slice-fixture-slice-1-tag-export.md",
        "scripts/hitl/pr.sh",
        "scripts/hitl/review-mode.sh",
        "scripts/hitl/ticket.sh",
        "scripts/hitl/backend.sh",
        "scripts/hitl/wipe.mjs",
      ]),
    );
    expect(paths).toHaveLength(28);
  });

  it("owns review-mode.sh in both forms", () => {
    expect(ownedFiles({ provider: "github", testing: [], gates: [] })).toContainEqual({
      repoPath: "scripts/hitl/review-mode.sh",
      template: "scripts/review-mode.sh",
      executable: true,
    });
    expect(pluginFiles()).toContainEqual({
      pluginPath: "runtime/review-mode.sh",
      template: "scripts/review-mode.sh",
      executable: true,
    });
  });

  it("marks the shell scripts executable and the doctrine as composed", () => {
    const list = ownedFiles({ provider: "github", testing: [], gates: [] });
    const byPath = Object.fromEntries(list.map((f) => [f.repoPath, f]));
    expect(byPath[".claude/hooks/unreviewed-artifact.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/wipe.mjs"].executable).toBe(true);
    expect(byPath["scripts/hitl/pr.sh"].executable).toBe(true);
    expect(byPath["scripts/hitl/backend.sh"].template).toBe("scripts/backends/github.sh");
    expect(byPath[".hitl/HITL.md"].template).toBeNull();
    expect(byPath[".claude/agents/fixer.md"].template).toBe("claude/agents/fixer.md");
  });

  it("owns the GitLab wrapper, its Node module and the host rule for provider gitlab only", () => {
    const gitlab = ownedFiles({ provider: "gitlab", testing: [], gates: [] });
    expect(gitlab).toContainEqual({
      repoPath: "scripts/hitl/backend.sh",
      template: "scripts/backends/gitlab.sh",
      executable: true,
    });
    expect(gitlab).toContainEqual({
      repoPath: "scripts/hitl/gitlab.mjs",
      template: "scripts/backends/gitlab.mjs",
      executable: true,
    });
    expect(gitlab).toContainEqual({
      repoPath: "scripts/hitl/host.mjs",
      template: "scripts/host.mjs",
      executable: false,
    });
    const github = ownedFiles({ provider: "github", testing: [], gates: [] }).map(
      (f) => f.repoPath,
    );
    expect(github).not.toContain("scripts/hitl/gitlab.mjs");
    expect(github).not.toContain("scripts/hitl/host.mjs");
  });

  it("lists the providers that have a backend", () => {
    expect(PROVIDERS).toEqual(["github", "gitlab"]);
  });

  it("names the host's prerequisite in the README block", () => {
    expect(readmeBlock("1.0.0")).toContain("`gh`");
    expect(readmeBlock("1.0.0", "github")).toContain("`gh`");
    const gitlab = readmeBlock("1.0.0", "gitlab");
    expect(gitlab).toContain("a `GITLAB_TOKEN` with the `api` scope");
    expect(gitlab).toContain("`GITLAB_URL` for a self-hosted GitLab");
    expect(gitlab).not.toContain("`gh`");
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

describe("renderMode", () => {
  const T =
    "a\n<!-- hitl:mode installed -->\nI\n<!-- hitl:mode no-install -->\nN\n<!-- hitl:mode end -->\nz\n";

  it("keeps the branch for the mode and drops the markers", () => {
    expect(renderMode(T, "installed")).toBe("a\nI\nz\n");
    expect(renderMode(T, "no-install")).toBe("a\nN\nz\n");
  });

  it("allows either branch to be absent", () => {
    expect(
      renderMode("x\n<!-- hitl:mode no-install -->\nN\n<!-- hitl:mode end -->\n", "installed"),
    ).toBe("x\n");
  });

  it("fails loudly on an unclosed or nested block", () => {
    expect(() => renderMode("<!-- hitl:mode installed -->\nI\n", "installed")).toThrow(/hitl:mode/);
    expect(() =>
      renderMode(
        "<!-- hitl:mode installed -->\n<!-- hitl:mode installed -->\n<!-- hitl:mode end -->\n",
        "installed",
      ),
    ).toThrow(/hitl:mode/);
  });

  it("prefixes workflow command and agent names in no-install mode only", () => {
    expect(renderMode("run `/review-spec` now", "no-install")).toBe("run `/hitl:review-spec` now");
    expect(renderMode("docs/superpowers/handover/x.md", "no-install")).toBe(
      "docs/superpowers/handover/x.md",
    );
    expect(renderMode("`/hitl:review-spec` and /hitl:init", "no-install")).toBe(
      "`/hitl:review-spec` and /hitl:init",
    );
    expect(renderMode("Spawn `implementer`", "no-install")).toBe("Spawn `hitl:implementer`");
    expect(renderMode("run `/review-spec`, spawn `fixer`", "installed")).toBe(
      "run `/review-spec`, spawn `fixer`",
    );
  });

  it("prefixes the adversarial and security reviewers in no-install mode", () => {
    expect(renderMode("`adversarial-reviewer` and `security-reviewer`", "no-install")).toBe(
      "`hitl:adversarial-reviewer` and `hitl:security-reviewer`",
    );
  });
});

import {
  MANIFEST_PATH,
  collisions,
  withClaudeLine,
  ownedFiles as ownedFilesForLayout,
} from "../../installer/lib.mjs";

describe("the .hitl/ layout", () => {
  it("owns the doctrine and the reviewer context under .hitl/", () => {
    const paths = ownedFilesForLayout(DEFAULT_CHOICES).map((f) => f.repoPath);
    expect(paths).toContain(".hitl/HITL.md");
    expect(paths).toContain(".hitl/review-context.md");
    expect(paths).not.toContain("HITL.md");
    expect(paths).not.toContain(".claude/review-context.md");
    expect(MANIFEST_PATH).toBe(".hitl/manifest.json");
  });

  it("appends the .hitl import line once", () => {
    expect(withClaudeLine(null)).toEqual({ text: "@.hitl/HITL.md\n", changed: true });
    expect(withClaudeLine("# x\n\n@.hitl/HITL.md\n").changed).toBe(false);
  });

  it("names the doctrine by its new path in the README block", () => {
    const block = readmeBlock("0.3.0");
    expect(block).toContain("`.hitl/HITL.md`");
    expect(block).not.toMatch(/(?<!\.hitl\/)HITL\.md/);
  });

  it("counts a file at an old path as a collision", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-old-"));
    writeFileSync(join(repo, "HITL.md"), "mine\n");
    expect(collisions(repo, DEFAULT_CHOICES)).toEqual(["HITL.md"]);
  });
});

import { layoutOf, readManifestOf } from "../../installer/lib.mjs";

describe("layoutOf", () => {
  it("tells the three layouts apart, current winning when both manifests exist", () => {
    const manifest = JSON.stringify({ version: "0.2.0", files: {} });
    const empty = mkdtempSync(join(tmpdir(), "hitl-layout-none-"));
    const withOldManifest = mkdtempSync(join(tmpdir(), "hitl-layout-old-"));
    mkdirSync(join(withOldManifest, ".claude"));
    writeFileSync(join(withOldManifest, ".claude/hitl.json"), manifest);
    const withBoth = mkdtempSync(join(tmpdir(), "hitl-layout-both-"));
    mkdirSync(join(withBoth, ".claude"));
    mkdirSync(join(withBoth, ".hitl"));
    writeFileSync(join(withBoth, ".claude/hitl.json"), manifest);
    writeFileSync(join(withBoth, ".hitl/manifest.json"), manifest);
    expect(layoutOf(empty)).toBe("none");
    expect(layoutOf(withOldManifest)).toBe("old");
    expect(layoutOf(withBoth)).toBe("current");
    expect(readManifestOf(withOldManifest)?.path).toBe(".claude/hitl.json");
    expect(readManifestOf(withOldManifest)?.layout).toBe("old");
    expect(readManifestOf(withOldManifest)?.manifest.version).toBe("0.2.0");
    expect(readManifestOf(withBoth)?.path).toBe(".hitl/manifest.json");
    expect(readManifestOf(empty)).toBeNull();
  });
});

import { rewriteClaudeLine, rewriteReadmeBlockPaths } from "../../installer/lib.mjs";

describe("moving the doctrine's references", () => {
  it("rewrites the import line, drops a duplicate, and adds nothing", () => {
    expect(rewriteClaudeLine("@HITL.md\n@AGENTS.md\n")).toEqual({
      text: "@.hitl/HITL.md\n@AGENTS.md\n",
      state: "rewritten",
    });
    expect(rewriteClaudeLine("@HITL.md\n@.hitl/HITL.md\n")).toEqual({
      text: "@.hitl/HITL.md\n",
      state: "rewritten",
    });
    expect(rewriteClaudeLine("@.hitl/HITL.md\n").state).toBe("current");
    expect(rewriteClaudeLine("# notes about @HITL.md here\n")).toEqual({
      text: "# notes about @HITL.md here\n",
      state: "absent",
    });
    expect(rewriteClaudeLine(null)).toEqual({ text: null, state: "absent" });
  });

  it("reads a CRLF CLAUDE.md and keeps its line endings", () => {
    expect(rewriteClaudeLine("@HITL.md\r\n@AGENTS.md\r\n")).toEqual({
      text: "@.hitl/HITL.md\r\n@AGENTS.md\r\n",
      state: "rewritten",
    });
    expect(rewriteClaudeLine("@HITL.md\r\n@.hitl/HITL.md\r\n")).toEqual({
      text: "@.hitl/HITL.md\r\n",
      state: "rewritten",
    });
    expect(rewriteClaudeLine("@.hitl/HITL.md\r\n").state).toBe("current");
  });

  it("rewrites the doctrine path in a README block exactly once", () => {
    const once = rewriteReadmeBlockPaths("The doctrine is `HITL.md`. `.claude/` and `HITL.md` are");
    expect(once).toBe("The doctrine is `.hitl/HITL.md`. `.claude/` and `.hitl/HITL.md` are");
    expect(rewriteReadmeBlockPaths(once)).toBe(once);
  });
});

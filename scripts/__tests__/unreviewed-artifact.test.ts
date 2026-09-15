import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const HOOK = join(process.cwd(), ".claude/hooks/unreviewed-artifact.sh");

function repoWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "hook-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

function runHook(root: string, stdin = "{}", cwd = root) {
  return spawnSync("bash", [HOOK], {
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    input: stdin,
    encoding: "utf8",
  });
}

const REVIEWED = "# A spec\n\n**Reviewed:** round 1 (2026-09-06).\n\n## Goal\n";
const UNREVIEWED = "# A spec\n\n**Status:** draft.\n\n## Goal\n";

describe("unreviewed-artifact Stop hook", () => {
  it("refuses with exit 2 and names the unreviewed plan", () => {
    const root = repoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md": REVIEWED,
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED,
    });
    const r = runHook(root);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("docs/superpowers/plans/2026-09-06-x-slice-1-a.md");
    expect(r.stderr).not.toContain("x-design.md");
  });

  it("keeps refusing when stop_hook_active is true", () => {
    const root = repoWith({ "docs/superpowers/specs/2026-09-06-x-design.md": UNREVIEWED });
    const r = runHook(root, JSON.stringify({ hook_event_name: "Stop", stop_hook_active: true }));
    expect(r.status).toBe(2);
  });

  it("exits 0 when every artefact carries a Reviewed line", () => {
    const root = repoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md": REVIEWED,
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": REVIEWED,
    });
    expect(runHook(root).status).toBe(0);
  });

  it("accepts a failed or grandfathered line", () => {
    const root = repoWith({
      "docs/superpowers/specs/2026-09-06-x-design.md":
        "# A\n\n**Reviewed:** round 1 failed (2026-09-06) — reviewer returned nothing.\n",
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md":
        "# B\n\n**Reviewed:** grandfathered (2026-09-06).\n",
    });
    expect(runHook(root).status).toBe(0);
  });

  it("ignores a Reviewed line quoted in the body — only the header block counts", () => {
    const root = repoWith({
      "docs/superpowers/plans/2026-09-06-x-slice-1-a.md":
        "# A plan\n\n**Owns:** x.\n\n## Task 1\n\n```\n**Reviewed:** round 1 (2026-09-06).\n```\n",
    });
    const r = runHook(root);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("x-slice-1-a.md");
  });

  it("reads CLAUDE_PROJECT_DIR, not the cwd it was invoked from", () => {
    const root = repoWith({ "docs/superpowers/plans/2026-09-06-x-slice-1-a.md": UNREVIEWED });
    const elsewhere = mkdtempSync(join(tmpdir(), "cwd-"));
    const r = runHook(root, "{}", elsewhere);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("docs/superpowers/plans/2026-09-06-x-slice-1-a.md");
  });

  it("exits 0 when there are no artefacts at all", () => {
    const root = repoWith({ "README.md": "hi\n" });
    expect(runHook(root).status).toBe(0);
  });

  it("is executable", () => {
    const root = repoWith({});
    expect(() =>
      execFileSync(HOOK, [], {
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        encoding: "utf8",
      }),
    ).not.toThrow();
  });
});

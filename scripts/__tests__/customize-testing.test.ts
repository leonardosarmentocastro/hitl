// scripts/__tests__/customize-testing.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLUGIN_ROOT = process.cwd();
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");
const SCRIPT = join(PLUGIN_ROOT, "installer/customize-testing.mjs");
const WORKFLOW = ".github/workflows/wipe-superpowers-docs.yml";

function installedRepo(ci: "github-actions" | "none" = "none", testing: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-custom-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  const answers = join(dir, "..", `answers-${Date.now()}-${Math.random()}.json`);
  writeFileSync(answers, JSON.stringify({ provider: "github", ci, testing, gates: ["pnpm test"] }));
  execFileSync("node", [RENDER, "--repo", dir, "--plugin-root", PLUGIN_ROOT, "--answers", answers]);
  return dir;
}

function customize(repo: string, testing: string, ci: string) {
  const r = spawnSync(
    "node",
    [SCRIPT, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--testing", testing, "--ci", ci],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

const manifestOf = (repo: string) =>
  JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
const hitlOf = (repo: string) => readFileSync(join(repo, "HITL.md"), "utf8");

describe("customize-testing.mjs", () => {
  it("adds fragments and the workflow, and updates the manifest", () => {
    const repo = installedRepo("none", []);
    const r = customize(repo, "tiers,e2e", "github-actions");
    expect(r.status).toBe(0);
    const hitl = hitlOf(repo);
    expect(hitl).toContain("<!-- hitl:knob testing-rules -->\n## Testing and gates\n");
    expect(hitl.indexOf("critical happy path")).toBeLessThan(
      hitl.indexOf("unit > component > e2e"),
    );
    expect(existsSync(join(repo, WORKFLOW))).toBe(true);
    const m = manifestOf(repo);
    expect(m.testing).toEqual(["e2e", "tiers"]);
    expect(m.ci).toBe("github-actions");
    expect(m.files["HITL.md"]).toBeDefined();
    expect(m.files[WORKFLOW]).toBeDefined();
    expect(r.json.wrote).toEqual(expect.arrayContaining(["HITL.md", WORKFLOW]));
  });

  it("removes every fragment and the workflow when asked for none", () => {
    const repo = installedRepo("github-actions", ["e2e"]);
    const r = customize(repo, "", "none");
    expect(r.status).toBe(0);
    expect(hitlOf(repo)).not.toContain("## Testing and gates");
    expect(existsSync(join(repo, WORKFLOW))).toBe(false);
    const m = manifestOf(repo);
    expect(m.testing).toEqual([]);
    expect(m.ci).toBe("none");
    expect(m.files).not.toHaveProperty(WORKFLOW);
    expect(r.json.removed).toEqual([WORKFLOW]);
  });

  it("refuses when HITL.md was edited by hand", () => {
    const repo = installedRepo();
    writeFileSync(join(repo, "HITL.md"), hitlOf(repo) + "\nlocal rule\n");
    const before = hitlOf(repo);
    const r = customize(repo, "e2e", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "hitl-locally-edited" });
    expect(hitlOf(repo)).toBe(before);
  });

  it("refuses when the manifest is behind the plugin", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, version: "0.0.1" }));
    const r = customize(repo, "e2e", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "behind", recorded: "0.0.1", plugin: "0.1.0" });
  });

  it("refuses when the manifest is ahead of the plugin (stale plugin cache)", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, version: "9.9.9" }));
    const r = customize(repo, "e2e", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "ahead", recorded: "9.9.9", plugin: "0.1.0" });
  });

  it("keeps a locally edited workflow instead of deleting it", () => {
    const repo = installedRepo("github-actions", []);
    writeFileSync(join(repo, WORKFLOW), "name: mine\n");
    const r = customize(repo, "", "none");
    expect(r.status).toBe(0);
    expect(existsSync(join(repo, WORKFLOW))).toBe(true);
    expect(r.json.kept).toEqual([WORKFLOW]);
    expect(manifestOf(repo).ci).toBe("none");
  });

  it("refuses an unknown fragment id", () => {
    const repo = installedRepo();
    const r = customize(repo, "stories", "none");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "unknown-fragment", id: "stories" });
  });
});

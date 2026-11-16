// scripts/__tests__/customize-testing.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pluginVersion } from "../../installer/lib.mjs";

const PLUGIN_ROOT = process.cwd();
const CURRENT = pluginVersion(PLUGIN_ROOT);
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");
const SCRIPT = join(PLUGIN_ROOT, "installer/customize-testing.mjs");
const WORKFLOW = ".github/workflows/wipe-superpowers-docs.yml";

function installedRepo(testing: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-custom-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  const answers = join(dir, "..", `answers-${Date.now()}-${Math.random()}.json`);
  writeFileSync(answers, JSON.stringify({ provider: "github", testing, gates: ["pnpm test"] }));
  execFileSync("node", [RENDER, "--repo", dir, "--plugin-root", PLUGIN_ROOT, "--answers", answers]);
  return dir;
}

function customize(repo: string, testing: string, extra: string[] = []) {
  const r = spawnSync(
    "node",
    [SCRIPT, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--testing", testing, ...extra],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

const manifestOf = (repo: string) =>
  JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
const hitlOf = (repo: string) => readFileSync(join(repo, "HITL.md"), "utf8");
const agentsOf = (repo: string) => readFileSync(join(repo, "AGENTS.md"), "utf8");

describe("customize-testing.mjs", () => {
  it("adds fragments and updates the manifest", () => {
    const repo = installedRepo([]);
    const r = customize(repo, "tiers,e2e");
    expect(r.status).toBe(0);
    const hitl = hitlOf(repo);
    expect(hitl).toContain("<!-- hitl:knob testing-rules -->\n## Testing and gates\n");
    expect(hitl.indexOf("critical happy path")).toBeLessThan(
      hitl.indexOf("unit > component > e2e"),
    );
    const m = manifestOf(repo);
    expect(m.testing).toEqual(["e2e", "tiers"]);
    expect(m).not.toHaveProperty("ci");
    expect(m.files["HITL.md"]).toBeDefined();
    expect(r.json.wrote).toEqual(["HITL.md"]);
  });

  it("removes every fragment when asked for none", () => {
    const repo = installedRepo(["e2e"]);
    const r = customize(repo, "");
    expect(r.status).toBe(0);
    expect(hitlOf(repo)).not.toContain("## Testing and gates");
    expect(manifestOf(repo).testing).toEqual([]);
  });

  it("refuses a --ci argument as a usage error", () => {
    const repo = installedRepo();
    const r = customize(repo, "e2e", ["--ci", "none"]);
    expect(r.status).toBe(1);
  });

  it("drops a recorded ci and leaves an existing workflow file untouched", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, ci: "github-actions" }));
    mkdirSync(join(repo, ".github/workflows"), { recursive: true });
    writeFileSync(join(repo, WORKFLOW), "name: old\n");
    const r = customize(repo, "e2e");
    expect(r.status).toBe(0);
    expect(manifestOf(repo)).not.toHaveProperty("ci");
    expect(readFileSync(join(repo, WORKFLOW), "utf8")).toBe("name: old\n");
    expect(r.json.wrote).toEqual(["HITL.md"]);
    expect(r.json.kept).toEqual([]);
  });

  it("refuses when HITL.md was edited by hand", () => {
    const repo = installedRepo();
    writeFileSync(join(repo, "HITL.md"), hitlOf(repo) + "\nlocal rule\n");
    const before = hitlOf(repo);
    const r = customize(repo, "e2e");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "hitl-locally-edited" });
    expect(hitlOf(repo)).toBe(before);
  });

  it("refuses when the manifest is behind the plugin", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, version: "0.0.1" }));
    const r = customize(repo, "e2e");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "behind", recorded: "0.0.1", plugin: CURRENT });
  });

  it("refuses when the manifest is ahead of the plugin (stale plugin cache)", () => {
    const repo = installedRepo();
    const m = manifestOf(repo);
    writeFileSync(join(repo, ".claude/hitl.json"), JSON.stringify({ ...m, version: "9.9.9" }));
    const r = customize(repo, "e2e");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "ahead", recorded: "9.9.9", plugin: CURRENT });
  });

  it("refuses an unknown fragment id", () => {
    const repo = installedRepo();
    const r = customize(repo, "stories");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "unknown-fragment", id: "stories" });
  });

  it("adds the effective-date pilots section inside the AGENTS.md hitl block", () => {
    const repo = installedRepo(["e2e"]);
    expect(agentsOf(repo)).not.toContain("hitl:knob effective-date-pilots");
    const r = customize(repo, "e2e,effective-date");
    expect(r.status).toBe(0);
    const agents = agentsOf(repo);
    expect(agents.indexOf("<!-- hitl:knob effective-date-pilots -->")).toBeGreaterThan(-1);
    expect(agents.indexOf("<!-- hitl:knob effective-date-pilots -->")).toBeLessThan(
      agents.indexOf("<!-- hitl:end -->"),
    );
    const block = (text: string) => text.slice(text.indexOf("<!-- hitl:start -->"));
    expect(block(agents)).toBe(block(agentsOf(installedRepo(["e2e", "effective-date"]))));
    expect(r.json.wrote).toEqual(expect.arrayContaining(["HITL.md", "AGENTS.md"]));
  });

  it("does not add the pilots section twice", () => {
    const repo = installedRepo(["effective-date"]);
    const before = agentsOf(repo);
    const r = customize(repo, "e2e,effective-date");
    expect(r.status).toBe(0);
    expect(agentsOf(repo)).toBe(before);
    expect(r.json.wrote).not.toContain("AGENTS.md");
    expect(r.json.kept).not.toContain("AGENTS.md");
  });

  it("keeps the pilots section when effective-date is removed and reports it", () => {
    const repo = installedRepo(["effective-date"]);
    const before = agentsOf(repo);
    const r = customize(repo, "");
    expect(r.status).toBe(0);
    expect(agentsOf(repo)).toBe(before);
    expect(r.json.kept).toEqual(["AGENTS.md"]);
  });

  it("refuses when the repository has no manifest", () => {
    const repo = installedRepo();
    rmSync(join(repo, ".claude/hitl.json"));
    const before = hitlOf(repo);
    const r = customize(repo, "e2e");
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "no-manifest" });
    expect(hitlOf(repo)).toBe(before);
  });
});

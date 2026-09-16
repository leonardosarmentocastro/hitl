// scripts/__tests__/adopt.test.ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAll, sha256 } from "../../installer/lib.mjs";

const PLUGIN_ROOT = process.cwd();
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");
const ADOPT = join(PLUGIN_ROOT, "installer/adopt.mjs");
const ANSWERS = { provider: "github", ci: "github-actions", testing: [], gates: [] };

function answersFile(answers: object) {
  const p = join(mkdtempSync(join(tmpdir(), "hitl-answers-")), "answers.json");
  writeFileSync(p, JSON.stringify(answers));
  return p;
}

function run(script: string, repo: string, answers: object = ANSWERS) {
  const r = spawnSync(
    "node",
    [script, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answersFile(answers)],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

/** A repository that was ejected by hand: a full render, its manifest removed, one file edited. */
function ejectedRepo() {
  const repo = mkdtempSync(join(tmpdir(), "hitl-ejected-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  expect(run(RENDER, repo).status).toBe(0);
  rmSync(join(repo, ".claude/hitl.json"));
  writeFileSync(join(repo, ".claude/agents/handover.md"), "# edited by hand\n");
  return repo;
}

function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => p !== ".git" && !p.startsWith(".git/"))
    .sort();
}

describe("adopt.mjs", () => {
  it("writes only the manifest, with the template's hash even where the repo file was edited", () => {
    const repo = ejectedRepo();
    const before = tree(repo);
    const editedHash = sha256(readFileSync(join(repo, ".claude/agents/handover.md"), "utf8"));
    const templateHash = sha256(
      renderAll(PLUGIN_ROOT, ANSWERS).get(".claude/agents/handover.md")!.content,
    );

    const r = run(ADOPT, repo);
    expect(r.status).toBe(0);
    expect(r.json.wrote).toEqual([".claude/hitl.json"]);
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.ci).toBe("github-actions");
    expect(manifest.files[".claude/agents/handover.md"]).toBe(templateHash);
    expect(manifest.files[".claude/agents/handover.md"]).not.toBe(editedHash);
    expect(readFileSync(join(repo, ".claude/agents/handover.md"), "utf8")).toBe(
      "# edited by hand\n",
    );
    expect(tree(repo)).toEqual([...before, ".claude/hitl.json"].sort());
  });

  it("refuses when a manifest is present", () => {
    const repo = ejectedRepo();
    run(ADOPT, repo);
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-present", version: "0.1.0" });
  });

  it("refuses when nothing owned exists", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-empty-"));
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "nothing-to-adopt" });
    expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
  });

  it("exits 1 on a missing flag", () => {
    const r = spawnSync("node", [ADOPT, "--repo"], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

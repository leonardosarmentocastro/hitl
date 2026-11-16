// scripts/__tests__/adopt.test.ts
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST_PATH, pluginVersion, renderAll, sha256 } from "../../installer/lib.mjs";

const PLUGIN_ROOT = process.cwd();
const CURRENT = pluginVersion(PLUGIN_ROOT);
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");
const ADOPT = join(PLUGIN_ROOT, "installer/adopt.mjs");
const ANSWERS = { provider: "github", testing: [], gates: [] };

/** A repository installed before 0.3.0: the manifest at its old path, no `.hitl/`. */
const OLD_INSTALL = {
  ".claude/hitl.json": JSON.stringify({
    version: "0.2.1",
    provider: "github",
    testing: [],
    files: {},
  }),
  ".claude/agents/fixer.md": "x\n",
  "HITL.md": "# HITL\n",
  ".claude/review-context.md": "context\n",
};

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
  rmSync(join(repo, MANIFEST_PATH));
  writeFileSync(join(repo, ".claude/agents/handover.md"), "# edited by hand\n");
  return repo;
}

/** A repository holding exactly these files; a value of null makes a directory instead. */
function repoWith(files: Record<string, string | null>) {
  const repo = mkdtempSync(join(tmpdir(), "hitl-adopt-"));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) {
      mkdirSync(join(repo, rel), { recursive: true });
      continue;
    }
    mkdirSync(join(repo, rel, ".."), { recursive: true });
    writeFileSync(join(repo, rel), content);
  }
  return repo;
}

function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => p !== ".git" && !p.startsWith(".git/"))
    .sort();
}

describe("adopt.mjs", () => {
  it("writes only the manifest when nothing needs moving, with the template's hash even where the repo file was edited", () => {
    const repo = ejectedRepo();
    const before = tree(repo);
    const editedHash = sha256(readFileSync(join(repo, ".claude/agents/handover.md"), "utf8"));
    const templateHash = sha256(
      renderAll(PLUGIN_ROOT, ANSWERS).get(".claude/agents/handover.md")!.content,
    );

    const r = run(ADOPT, repo);
    expect(r.status).toBe(0);
    expect(r.json.wrote).toEqual([MANIFEST_PATH]);
    expect(r.json.moved).toEqual([]);
    const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
    expect(manifest.version).toBe(CURRENT);
    expect(manifest).not.toHaveProperty("ci");
    expect(manifest.files[".claude/agents/handover.md"]).toBe(templateHash);
    expect(manifest.files[".claude/agents/handover.md"]).not.toBe(editedHash);
    expect(readFileSync(join(repo, ".claude/agents/handover.md"), "utf8")).toBe(
      "# edited by hand\n",
    );
    expect(tree(repo)).toEqual([...before, MANIFEST_PATH].sort());
  });

  it("refuses when a manifest is present", () => {
    const repo = ejectedRepo();
    run(ADOPT, repo);
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-present", version: CURRENT, layout: "current" });
  });

  it("refuses an old-layout install instead of stamping a second manifest", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-old-"));
    for (const [rel, content] of Object.entries(OLD_INSTALL)) {
      mkdirSync(join(repo, rel, ".."), { recursive: true });
      writeFileSync(join(repo, rel), content);
    }
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toMatchObject({ refused: "manifest-present", layout: "old" });
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(false);
  });

  it("ignores a ci key in the answers, whatever its value or absence", () => {
    for (const answers of [{ ...ANSWERS, ci: "jenkins" }, ANSWERS]) {
      const repo = ejectedRepo();
      const r = run(ADOPT, repo, answers);
      expect(r.status).toBe(0);
      const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
      expect(manifest).not.toHaveProperty("ci");
      expect(Object.keys(manifest.files)).not.toContain(
        ".github/workflows/wipe-superpowers-docs.yml",
      );
      expect(existsSync(join(repo, ".github/workflows/wipe-superpowers-docs.yml"))).toBe(false);
    }
  });

  it("refuses an unknown provider before writing anything", () => {
    const repo = ejectedRepo();
    const before = tree(repo);
    const r = run(ADOPT, repo, { provider: "bitbucket", testing: [], gates: [] });
    expect(r.status).toBe(3);
    expect(r.json).toEqual({
      refused: "unknown-provider",
      provider: "bitbucket",
      allowed: ["github", "gitlab"],
    });
    expect(tree(repo)).toEqual(before);
  });

  it("adopts a tree carrying the GitLab backend with provider gitlab", () => {
    const gitlab = { provider: "gitlab", testing: [], gates: [] };
    const repo = mkdtempSync(join(tmpdir(), "hitl-ejected-gitlab-"));
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    expect(run(RENDER, repo, gitlab).status).toBe(0);
    rmSync(join(repo, MANIFEST_PATH));
    const r = run(ADOPT, repo, gitlab);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
    expect(manifest.provider).toBe("gitlab");
    for (const p of [
      "scripts/hitl/backend.sh",
      "scripts/hitl/gitlab.mjs",
      "scripts/hitl/host.mjs",
    ]) {
      expect(manifest.files[p], p).toBe(sha256(readFileSync(join(repo, p), "utf8")));
    }
  });

  it("refuses when nothing owned exists", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-empty-"));
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "nothing-to-adopt" });
    expect(existsSync(join(repo, MANIFEST_PATH))).toBe(false);
  });

  it("moves a root doctrine and the reviewer context, rewrites the import line, then records", () => {
    const repo = repoWith({
      "HITL.md": "mine\n",
      ".claude/review-context.md": "ctx\n",
      ".claude/agents/fixer.md": "x\n",
      "CLAUDE.md": "@HITL.md\n",
    });
    const r = run(ADOPT, repo);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.moved).toEqual([
      { from: "HITL.md", to: ".hitl/HITL.md" },
      { from: ".claude/review-context.md", to: ".hitl/review-context.md" },
    ]);
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe("mine\n");
    expect(readFileSync(join(repo, ".hitl/review-context.md"), "utf8")).toBe("ctx\n");
    expect(existsSync(join(repo, "HITL.md"))).toBe(false);
    expect(existsSync(join(repo, ".claude/review-context.md"))).toBe(false);
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@.hitl/HITL.md\n");
    expect(readFileSync(join(repo, ".claude/agents/fixer.md"), "utf8")).toBe("x\n");
    expect(r.json.claudeLine).toBe("rewritten");
    expect(r.json.wrote).toEqual([".hitl/manifest.json"]);
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(true);
  });

  it("adopts a repository whose only hitl file is a root HITL.md", () => {
    const repo = repoWith({ "HITL.md": "mine\n" });
    const r = run(ADOPT, repo);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.moved).toEqual([{ from: "HITL.md", to: ".hitl/HITL.md" }]);
    expect(r.json.claudeLine).toBe("absent");
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe("mine\n");
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(true);
  });

  it("refuses when a file exists at both the old and the new path, touching nothing", () => {
    const repo = repoWith({
      "HITL.md": "old\n",
      ".hitl/HITL.md": "new\n",
      ".claude/review-context.md": "ctx\n",
      "CLAUDE.md": "@HITL.md\n",
    });
    const before = tree(repo);
    const r = run(ADOPT, repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "move-collision", paths: ["HITL.md", ".hitl/HITL.md"] });
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(false);
    expect(readFileSync(join(repo, "HITL.md"), "utf8")).toBe("old\n");
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe("new\n");
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@HITL.md\n");
    expect(tree(repo)).toEqual(before);
  });

  it("moves nothing in a repository already on the new paths", () => {
    const repo = ejectedRepo();
    writeFileSync(join(repo, "CLAUDE.md"), "@.hitl/HITL.md\n");
    const r = run(ADOPT, repo);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.moved).toEqual([]);
    expect(r.json.claudeLine).toBe("current");
    expect(r.json.wrote).toEqual([MANIFEST_PATH]);
  });

  it("names what already moved when a later step fails", () => {
    const repo = repoWith({
      "HITL.md": "mine\n",
      ".claude/agents/fixer.md": "x\n",
      "CLAUDE.md": null,
    });
    const r = run(ADOPT, repo);
    expect(r.status).toBe(2);
    expect(r.json.error).toBeTruthy();
    expect(r.json.moved).toEqual([{ from: "HITL.md", to: ".hitl/HITL.md" }]);
    expect(r.json.claudeLine).toBeNull();
    expect(r.json.manifest).toBe("untouched");
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe("mine\n");
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(false);
  });

  it("exits 1 on a missing flag", () => {
    const r = spawnSync("node", [ADOPT, "--repo"], { encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});

// scripts/__tests__/render.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLUGIN_ROOT = process.cwd();
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");

function tempRepo(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-render-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const ANSWERS = { provider: "github", ci: "github-actions", testing: [], gates: ["pnpm test"] };

function render(repo: string, answers: object = ANSWERS) {
  const answersPath = join(repo, "..", `answers-${Date.now()}-${Math.random()}.json`);
  writeFileSync(answersPath, JSON.stringify(answers));
  const r = spawnSync(
    "node",
    [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answersPath],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("render.mjs on an empty repository", () => {
  it("writes every owned file, executable where needed", () => {
    const repo = tempRepo();
    const r = render(repo);
    expect(r.status).toBe(0);
    for (const p of [
      "HITL.md",
      ".claude/agents/fixer.md",
      ".claude/commands/implement-stack.md",
      ".claude/hooks/unreviewed-artifact.sh",
      ".claude/review-context.md",
      ".claude/fixtures/spec-fixture-design.md",
      "scripts/hitl/wipe-superpowers-docs.sh",
      ".github/workflows/wipe-superpowers-docs.yml",
    ]) {
      expect(existsSync(join(repo, p)), p).toBe(true);
    }
    expect(statSync(join(repo, ".claude/hooks/unreviewed-artifact.sh")).mode & 0o111).not.toBe(0);
    expect(r.json.wrote).toContain("HITL.md");
  });

  it("creates CLAUDE.md with the @HITL.md line and appends it to an existing one", () => {
    const fresh = tempRepo();
    render(fresh);
    expect(readFileSync(join(fresh, "CLAUDE.md"), "utf8")).toBe("@HITL.md\n");

    const existing = tempRepo({ "CLAUDE.md": "# Mine\n\nRules.\n" });
    render(existing);
    expect(readFileSync(join(existing, "CLAUDE.md"), "utf8")).toBe(
      "# Mine\n\nRules.\n\n@HITL.md\n",
    );
  });

  it("appends marked blocks to README.md and .gitignore, creating them if absent", () => {
    const repo = tempRepo({ "README.md": "# app\n" });
    const r = render(repo);
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(readme.startsWith("# app\n")).toBe(true);
    expect(readme).toContain("<!-- hitl:start -->");
    expect(readme).toContain("## How changes land here");
    expect(readme).toContain("hitl 0.1.0");
    expect(readme).toContain("<!-- hitl:end -->");
    const ignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(ignore).toContain(".claude/reviews/");
    expect(ignore).toContain(".claude/fixtures/scratch/");
    expect(ignore).toContain(".claude/settings.local.json");
    expect(r.json.appended).toEqual(
      expect.arrayContaining(["CLAUDE.md", "README.md", ".gitignore"]),
    );
  });

  it("merges the Stop hook into settings.json and keeps other hooks", () => {
    const repo = tempRepo({
      ".claude/settings.json": JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "echo hi" }] }] },
        permissions: { allow: ["Bash(ls)"] },
      }),
    });
    const r = render(repo);
    const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf8"));
    expect(settings.permissions.allow).toEqual(["Bash(ls)"]);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(JSON.stringify(settings.hooks.Stop)).toContain("unreviewed-artifact.sh");
    expect(r.json.settings).toBe("added");
  });

  it("writes the manifest with the version, the choices and a hash per owned file", () => {
    const repo = tempRepo();
    render(repo);
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.provider).toBe("github");
    expect(manifest.ci).toBe("github-actions");
    expect(manifest.testing).toEqual([]);
    expect(manifest).not.toHaveProperty("gates");
    expect(Object.keys(manifest.files)).toHaveLength(20);
    expect(manifest.files["HITL.md"]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest.files)).toEqual([...Object.keys(manifest.files)].sort());
  });

  it("omits the workflow when ci is none", () => {
    const repo = tempRepo();
    render(repo, { ...ANSWERS, ci: "none" });
    expect(existsSync(join(repo, ".github/workflows/wipe-superpowers-docs.yml"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(repo, ".claude/hitl.json"), "utf8"));
    expect(manifest.ci).toBe("none");
    expect(Object.keys(manifest.files)).toHaveLength(19);
  });
});

function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => !p.startsWith(".git/") && p !== ".git")
    .sort();
}

describe("render.mjs refusals", () => {
  it("refuses a second run with the installed version and writes nothing", () => {
    const repo = tempRepo();
    render(repo);
    const before = tree(repo);
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-present", version: "0.1.0" });
    expect(tree(repo)).toEqual(before);
  });

  it("refuses on an owned filename inside .claude/commands but not on a foreign one", () => {
    const foreign = tempRepo({ ".claude/commands/deploy.md": "mine\n" });
    const ok = render(foreign);
    expect(ok.status).toBe(0);
    expect(ok.json.foreign).toEqual([".claude/commands/deploy.md"]);
    expect(readFileSync(join(foreign, ".claude/commands/deploy.md"), "utf8")).toBe("mine\n");

    const owned = tempRepo({ ".claude/commands/review-spec.md": "old\n" });
    const r = render(owned);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "collision", paths: [".claude/commands/review-spec.md"] });
    expect(existsSync(join(owned, "HITL.md"))).toBe(false);
  });

  it("refuses on scripts/hitl/ and .claude/fixtures/ as directories", () => {
    const repo = tempRepo({ "scripts/hitl/other.sh": "", ".claude/fixtures/mine.md": "" });
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json.refused).toBe("collision");
    expect(r.json.paths).toEqual(expect.arrayContaining(["scripts/hitl", ".claude/fixtures"]));
  });

  it("refuses on HITL.md, review-context.md and the workflow as files", () => {
    for (const p of [
      "HITL.md",
      ".claude/review-context.md",
      ".github/workflows/wipe-superpowers-docs.yml",
    ]) {
      const repo = tempRepo({ [p]: "x\n" });
      const r = render(repo);
      expect(r.status, p).toBe(3);
      expect(r.json.paths, p).toEqual([p]);
    }
  });

  it("refuses an unparsable settings.json before writing anything", () => {
    const repo = tempRepo({ ".claude/settings.json": "{ not json" });
    const before = tree(repo);
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json.refused).toBe("settings-unparsable");
    expect(tree(repo)).toEqual(before);
  });

  // Root ignores directory modes, so this cannot go red under root (some CI images).
  it.skipIf(process.getuid?.() === 0)(
    "reports the files written before a mid-write failure",
    () => {
      const repo = tempRepo();
      mkdirSync(join(repo, "scripts"));
      chmodSync(join(repo, "scripts"), 0o555); // scripts/hitl/ cannot be created
      const r = render(repo);
      expect(r.status).toBe(2);
      expect(r.json.error).toMatch(/EACCES|permission/i);
      expect(r.json.wrote).toContain("HITL.md");
      expect(r.json.wrote).not.toContain("scripts/hitl/wipe-superpowers-docs.sh");
      expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
      chmodSync(join(repo, "scripts"), 0o755);
    },
  );
});

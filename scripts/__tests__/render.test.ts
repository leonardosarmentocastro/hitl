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
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST_PATH, pluginVersion, renderPlugin } from "../../installer/lib.mjs";

const PLUGIN_ROOT = process.cwd();
const CURRENT = pluginVersion(PLUGIN_ROOT);
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

const ANSWERS = { provider: "github", testing: [], gates: ["pnpm test"] };

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
      ".hitl/HITL.md",
      ".claude/agents/fixer.md",
      ".claude/commands/implement-stack.md",
      ".claude/hooks/unreviewed-artifact.sh",
      ".hitl/review-context.md",
      ".claude/fixtures/spec-fixture-design.md",
      "scripts/hitl/pr.sh",
      "scripts/hitl/backend.sh",
    ]) {
      expect(existsSync(join(repo, p)), p).toBe(true);
    }
    expect(statSync(join(repo, ".claude/hooks/unreviewed-artifact.sh")).mode & 0o111).not.toBe(0);
    expect(r.json.wrote).toContain(".hitl/HITL.md");
  });

  it("installs the wipe builder as scripts/hitl/wipe.mjs, executable, byte-equal to its template", () => {
    const repo = tempRepo();
    expect(render(repo).status).toBe(0);
    const installed = join(repo, "scripts/hitl/wipe.mjs");
    expect(existsSync(installed)).toBe(true);
    expect(statSync(installed).mode & 0o111).not.toBe(0);
    expect(readFileSync(installed)).toEqual(
      readFileSync(join(PLUGIN_ROOT, "templates/scripts/wipe-core.mjs")),
    );
  });

  it("renders the installed commands with the wipe step and its report lines", () => {
    const repo = tempRepo();
    expect(render(repo).status).toBe(0);
    const umbrella = readFileSync(join(repo, ".claude/commands/umbrella-pr.md"), "utf8");
    expect(umbrella).toContain(
      'node scripts/hitl/wipe.mjs build --repo "$PWD" --feature-branch "<feature-branch>" --parent "<parent>" --base origin/main --shim scripts/hitl/pr.sh',
    );
    expect(umbrella).not.toContain("archived");
    expect(umbrella).toContain(
      "Required before merge: <ref> removes the transient docs — merge it last.",
    );
    const implement = readFileSync(join(repo, ".claude/commands/implement-stack.md"), "utf8");
    expect(implement).toContain("The wipe PR <ref> is generated; merge it last.");
    expect(implement).toContain("only the wipe builder pushes it");
  });

  it("names PRs by their ref in everything posted or reported; the stack table keeps #<number>", () => {
    const repo = tempRepo();
    expect(render(repo).status).toBe(0);
    const read = (p: string) => readFileSync(join(repo, p), "utf8");
    const implement = read(".claude/commands/implement-stack.md");
    expect(implement).toContain("docs(handover): slice <N> open <ref>");
    expect(implement).toContain("slice N — <branch> — PR <ref>");
    expect(implement).toContain("The wipe PR <ref> is generated; merge it last.");
    expect(implement).toContain("status `open #<number>`");
    const umbrella = read(".claude/commands/umbrella-pr.md");
    for (const s of [
      "created: <ref> (draft)",
      "updated: <ref>",
      "Required before merge: <ref> removes the transient docs",
      "Transient docs removed by <ref>.",
      "refused: <ref> has a hand-written body",
    ])
      expect(umbrella).toContain(s);
    const handover = read(".claude/agents/handover.md");
    const allowed = new Set(["open #<number>", "merged #<number>", "open #K", "merged #K"]);
    for (const text of [implement, umbrella, handover]) {
      for (const m of text.matchAll(/(?:\w+ )?#(?:<[^>]*>|[KN]\b)/g)) {
        expect(allowed, `found "${m[0]}"`).toContain(m[0]);
      }
    }
    // The no-install copies the plugin ships hold the same rule.
    for (const [path, { content }] of renderPlugin(PLUGIN_ROOT)) {
      if (!/^(?:commands|agents)\//.test(path)) continue;
      for (const m of content.matchAll(/(?:\w+ )?#(?:<[^>]*>|[KN]\b)/g)) {
        expect(allowed, `found "${m[0]}" in ${path}`).toContain(m[0]);
      }
    }
  });

  it("creates CLAUDE.md with the @.hitl/HITL.md line and appends it to an existing one", () => {
    const fresh = tempRepo();
    render(fresh);
    expect(readFileSync(join(fresh, "CLAUDE.md"), "utf8")).toBe("@.hitl/HITL.md\n");

    const existing = tempRepo({ "CLAUDE.md": "# Mine\n\nRules.\n" });
    render(existing);
    expect(readFileSync(join(existing, "CLAUDE.md"), "utf8")).toBe(
      "# Mine\n\nRules.\n\n@.hitl/HITL.md\n",
    );
  });

  it("appends marked blocks to README.md and .gitignore, creating them if absent", () => {
    const repo = tempRepo({ "README.md": "# app\n" });
    const r = render(repo);
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(readme.startsWith("# app\n")).toBe(true);
    expect(readme).toContain("<!-- hitl:start -->");
    expect(readme).toContain("## How changes land here");
    expect(readme).toContain(`hitl ${CURRENT}`);
    expect(readme).toContain("<!-- hitl:end -->");
    const ignore = readFileSync(join(repo, ".gitignore"), "utf8");
    expect(ignore).toContain(".claude/reviews/");
    expect(ignore).toContain(".claude/worktrees/");
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
    const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
    expect(manifest.version).toBe(CURRENT);
    expect(manifest.provider).toBe("github");
    expect(manifest).not.toHaveProperty("ci");
    expect(manifest.testing).toEqual([]);
    expect(manifest).not.toHaveProperty("gates");
    expect(Object.keys(manifest.files)).toHaveLength(29);
    expect(manifest.files[".hitl/HITL.md"]).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(manifest.files)).toEqual([...Object.keys(manifest.files)].sort());
  });

  it("ignores a ci key in the answers, whatever its value or absence", () => {
    for (const answers of [{ ...ANSWERS, ci: "jenkins" }, ANSWERS]) {
      const repo = tempRepo();
      const r = render(repo, answers);
      expect(r.status).toBe(0);
      expect(existsSync(join(repo, ".github/workflows/wipe-superpowers-docs.yml"))).toBe(false);
      expect(existsSync(join(repo, "scripts/hitl/wipe-superpowers-docs.sh"))).toBe(false);
      const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
      expect(manifest).not.toHaveProperty("ci");
    }
  });
});

function tree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((p) => !p.startsWith(".git/") && p !== ".git")
    .sort();
}

describe("render.mjs for provider gitlab", () => {
  it("writes the GitLab backend byte for byte, hashes it and names GITLAB_TOKEN in the README", () => {
    const repo = tempRepo();
    const r = render(repo, { provider: "gitlab", testing: [], gates: [] });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const pairs: [string, string][] = [
      ["scripts/hitl/backend.sh", "templates/scripts/backends/gitlab.sh"],
      ["scripts/hitl/gitlab.mjs", "templates/scripts/backends/gitlab.mjs"],
      ["scripts/hitl/host.mjs", "templates/scripts/host.mjs"],
    ];
    const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
    expect(manifest.provider).toBe("gitlab");
    for (const [installed, template] of pairs) {
      expect(readFileSync(join(repo, installed)), installed).toEqual(
        readFileSync(join(PLUGIN_ROOT, template)),
      );
      expect(manifest.files[installed], installed).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(statSync(join(repo, "scripts/hitl/gitlab.mjs")).mode & 0o111).not.toBe(0);
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(readme).toContain("GITLAB_TOKEN");
    expect(readme).not.toContain("`gh`");
  });
});

describe("render.mjs refusals", () => {
  it("refuses an unknown provider before writing anything", () => {
    const repo = tempRepo();
    const before = tree(repo);
    const r = render(repo, { provider: "bitbucket", testing: [], gates: [] });
    expect(r.status).toBe(3);
    expect(r.json).toEqual({
      refused: "unknown-provider",
      provider: "bitbucket",
      allowed: ["github", "gitlab"],
    });
    expect(tree(repo)).toEqual(before);
  });

  it("refuses a second run with the installed version and writes nothing", () => {
    const repo = tempRepo();
    render(repo);
    const before = tree(repo);
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-present", version: CURRENT, layout: "current" });
    expect(tree(repo)).toEqual(before);
  });

  it("refuses an old-layout repository as manifest-present, layout old", () => {
    const repo = tempRepo(OLD_INSTALL);
    const before = tree(repo);
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json).toMatchObject({ refused: "manifest-present", version: "0.2.1", layout: "old" });
    expect(tree(repo)).toEqual(before);
    const c = check(repo);
    expect(c.status).toBe(3);
    expect(c.json).toMatchObject({ refused: "manifest-present", version: "0.2.1", layout: "old" });
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
    expect(existsSync(join(owned, ".hitl/HITL.md"))).toBe(false);
  });

  it("refuses on scripts/hitl/ and .claude/fixtures/ as directories", () => {
    const repo = tempRepo({ "scripts/hitl/other.sh": "", ".claude/fixtures/mine.md": "" });
    const r = render(repo);
    expect(r.status).toBe(3);
    expect(r.json.refused).toBe("collision");
    expect(r.json.paths).toEqual(expect.arrayContaining(["scripts/hitl", ".claude/fixtures"]));
  });

  it("refuses on the doctrine and review-context.md as files, at their new and old paths", () => {
    for (const p of [
      ".hitl/HITL.md",
      ".hitl/review-context.md",
      "HITL.md",
      ".claude/review-context.md",
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
      expect(r.json.wrote).toContain(".hitl/HITL.md");
      expect(r.json.wrote).not.toContain("scripts/hitl/pr.sh");
      expect(existsSync(join(repo, MANIFEST_PATH))).toBe(false);
      chmodSync(join(repo, "scripts"), 0o755);
    },
  );

  it.skipIf(process.getuid?.() === 0)(
    "reports appended files apart from created ones when a later write fails",
    () => {
      const repo = tempRepo({
        "README.md": "# app\n",
        ".claude/settings.json": JSON.stringify({ permissions: { allow: [] } }),
      });
      chmodSync(join(repo, ".claude/settings.json"), 0o444); // the settings write fails
      const r = render(repo);
      expect(r.status).toBe(2);
      expect(r.json.wrote).toContain(".hitl/HITL.md");
      expect(r.json.wrote).not.toContain("README.md");
      expect(r.json.appended).toEqual(
        expect.arrayContaining(["CLAUDE.md", "README.md", ".gitignore"]),
      );
      expect(r.json.settings).toBe("untouched");
      expect(existsSync(join(repo, MANIFEST_PATH))).toBe(false);
      chmodSync(join(repo, ".claude/settings.json"), 0o644);
    },
  );

  it("reports settings as added when only the manifest write fails", () => {
    const repo = tempRepo();
    mkdirSync(join(repo, ".hitl"));
    // A dangling link reads as absent, and writing through it fails.
    symlinkSync(join(repo, "missing-dir", "hitl.json"), join(repo, MANIFEST_PATH));
    const r = render(repo);
    expect(r.status).toBe(2);
    expect(r.json.settings).toBe("added");
    expect(r.json.wrote).not.toContain(MANIFEST_PATH);
  });
});

function check(repo: string) {
  const r = spawnSync(
    "node",
    [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--mode", "check"],
    {
      encoding: "utf8",
    },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("render.mjs --mode check", () => {
  it("reports ok on a clean repository and writes nothing", () => {
    const repo = tempRepo({ "README.md": "# app\n" });
    const before = tree(repo);
    const r = check(repo);
    expect(r.status).toBe(0);
    expect(r.json).toEqual({ ok: true });
    expect(tree(repo)).toEqual(before);
  });

  it("refuses on a collision with the same JSON as a write would, and writes nothing", () => {
    const repo = tempRepo({ "HITL.md": "x\n" });
    const r = check(repo);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "collision", paths: ["HITL.md"] });
    expect(tree(repo)).toEqual(["HITL.md"]);
  });

  it("refuses on a present manifest", () => {
    const repo = tempRepo();
    render(repo);
    expect(check(repo).json).toEqual({
      refused: "manifest-present",
      version: CURRENT,
      layout: "current",
    });
  });
});

describe("render.mjs and AGENTS.md", () => {
  it("creates AGENTS.md as a stub plus the gates block when absent", () => {
    const repo = tempRepo();
    const r = render(repo, { ...ANSWERS, gates: ["pnpm test", "pnpm lint"] });
    const text = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(text.startsWith(`# ${repo.split("/").pop()} — agent working agreements\n`)).toBe(true);
    expect(text).toContain(
      "<!-- hitl:start -->\n<!-- hitl:knob local-gates -->\n## Local gates\n\n- `pnpm test`\n- `pnpm lint`\n<!-- hitl:end -->\n",
    );
    expect(r.json.appended).toContain("AGENTS.md");
    expect(r.json.wrote).not.toContain("AGENTS.md");
  });

  it("keeps an existing AGENTS.md above the block", () => {
    const repo = tempRepo({ "AGENTS.md": "# app\n\nOurs.\n" });
    render(repo);
    const text = readFileSync(join(repo, "AGENTS.md"), "utf8");
    expect(text.startsWith("# app\n\nOurs.\n\n<!-- hitl:start -->")).toBe(true);
  });

  it("writes the none-yet line when gates is empty", () => {
    const repo = tempRepo();
    render(repo, { ...ANSWERS, gates: [] });
    expect(readFileSync(join(repo, "AGENTS.md"), "utf8")).toContain(
      "none yet — the first TDD task adds the harness and names its command here",
    );
  });

  it("never records gates in the manifest", () => {
    const repo = tempRepo();
    render(repo, { ...ANSWERS, gates: ["pnpm test"] });
    const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
    expect(manifest).not.toHaveProperty("gates");
  });
});

describe("the installed HITL.md states the one wipe rule", () => {
  it("names the generated wipe PR, merged last, and no CI job", () => {
    const repo = tempRepo();
    expect(render(repo).status).toBe(0);
    const hitl = readFileSync(join(repo, ".hitl/HITL.md"), "utf8");
    expect(hitl).toContain("<feature branch>-wipe");
    expect(hitl).toContain("merged last");
    for (const s of ["a workflow deletes them", "the wipe script", "never empty"])
      expect(hitl, s).not.toContain(s);
  });
});

describe("render.mjs and the .hitl/ layout", () => {
  it("writes the three hitl files under .hitl/ and nothing of its own at the root", () => {
    const repo = tempRepo();
    const r = render(repo);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(existsSync(join(repo, ".hitl/HITL.md"))).toBe(true);
    expect(existsSync(join(repo, ".hitl/review-context.md"))).toBe(true);
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(true);
    expect(existsSync(join(repo, "HITL.md"))).toBe(false);
    expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
    expect(existsSync(join(repo, ".claude/review-context.md"))).toBe(false);
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@.hitl/HITL.md\n");
  });

  it("refuses when a root HITL.md exists and no manifest does", () => {
    const repo = tempRepo({ "HITL.md": "mine\n" });
    const out = check(repo).json;
    expect(out).toEqual({ refused: "collision", paths: ["HITL.md"] });
    expect(existsSync(join(repo, ".hitl"))).toBe(false);
  });

  it("installs into a repository whose .hitl/ holds unrelated files", () => {
    const repo = tempRepo({ ".hitl/notes.txt": "ours\n" });
    const r = render(repo);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(readFileSync(join(repo, ".hitl/notes.txt"), "utf8")).toBe("ours\n");
    expect(existsSync(join(repo, ".hitl/HITL.md"))).toBe(true);
  });
});

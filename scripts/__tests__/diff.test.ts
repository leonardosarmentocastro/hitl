// scripts/__tests__/diff.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIFF = join(ROOT, "installer/diff.mjs");
const ANSWERS = { provider: "github", ci: "github-actions", testing: [], gates: [] };

function git(cwd: string, args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function copyPlugin(dest: string) {
  for (const d of ["templates", "installer", ".claude-plugin"]) {
    cpSync(join(ROOT, d), join(dest, d), { recursive: true });
  }
}

/**
 * A marketplace clone whose only tag, v0.1.0, is this repository's templates and installer;
 * and a plugin root at 0.2.0 whose fixer agent gained one line at the end.
 */
function fixtureMarketplace() {
  const mk = mkdtempSync(join(tmpdir(), "hitl-mk-"));
  copyPlugin(mk);
  git(mk, ["init", "-q", "-b", "main"]);
  git(mk, ["config", "user.email", "t@example.com"]);
  git(mk, ["config", "user.name", "t"]);
  git(mk, ["add", "-A"]);
  git(mk, ["commit", "-q", "-m", "0.1.0"]);
  git(mk, ["tag", "v0.1.0"]);

  const plugin = mkdtempSync(join(tmpdir(), "hitl-plugin-"));
  copyPlugin(plugin);
  const pj = join(plugin, ".claude-plugin/plugin.json");
  writeFileSync(
    pj,
    JSON.stringify({ ...JSON.parse(readFileSync(pj, "utf8")), version: "0.2.0" }, null, 2),
  );
  appendFileSync(
    join(plugin, "templates/claude/agents/fixer.md"),
    "\nUpstream added this line in 0.2.0.\n",
  );
  return { mk, plugin };
}

/** A repository installed by the v0.1.0 marketplace's own render.mjs. */
function installedRepo(mk: string, answers: object = ANSWERS) {
  const repo = mkdtempSync(join(tmpdir(), "hitl-repo-"));
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  const answersPath = join(repo, "..", `answers-${Math.random()}.json`);
  writeFileSync(answersPath, JSON.stringify(answers));
  const r = spawnSync(
    "node",
    [
      join(mk, "installer/render.mjs"),
      "--repo",
      repo,
      "--plugin-root",
      mk,
      "--answers",
      answersPath,
    ],
    { encoding: "utf8" },
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  return repo;
}

function diff(repo: string, plugin: string, mk: string, apply = false) {
  const args = [DIFF, "--repo", repo, "--plugin-root", plugin, "--marketplace", mk];
  if (apply) args.push("--apply");
  const r = spawnSync("node", args, { encoding: "utf8" });
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

function stateOf(json: any, path: string) {
  return json.files.find((f: any) => f.path === path);
}

function editManifest(repo: string, edit: (m: any) => void) {
  const p = join(repo, ".claude/hitl.json");
  const m = JSON.parse(readFileSync(p, "utf8"));
  edit(m);
  writeFileSync(p, JSON.stringify(m, null, 2));
}

const FIXER = ".claude/agents/fixer.md";
const HANDOVER = ".claude/agents/handover.md";

let mk: string;
let plugin: string;
beforeAll(() => {
  ({ mk, plugin } = fixtureMarketplace());
});

describe("diff.mjs refusals", () => {
  it("refuses without a manifest", () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-nomanifest-"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "no-manifest" });
  });

  it("refuses when the marketplace lacks the recorded tag", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.version = "0.0.9"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "tag-missing", tag: "v0.0.9" });
  });

  it("refuses a manifest ahead of the plugin instead of proposing a downgrade", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.version = "9.9.9"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "ahead", recorded: "9.9.9", plugin: "0.2.0" });
  });

  it("refuses when the recorded render does not hash to the manifest", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.files["HITL.md"] = "0".repeat(64)));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "manifest-mismatch", paths: ["HITL.md"] });
  });
});

describe("diff.mjs across versions (recorded 0.1.0 from the tag, latest 0.2.0)", () => {
  it("reports the versions, unchanged files and the upstream change", () => {
    const repo = installedRepo(mk);
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(0);
    expect(r.json.recorded).toBe("0.1.0");
    expect(r.json.latest).toBe("0.2.0");
    expect(stateOf(r.json, HANDOVER).state).toBe("unchanged");
    expect(stateOf(r.json, "HITL.md").state).toBe("unchanged");
    expect(stateOf(r.json, FIXER).state).toBe("upstream changed");
    expect(r.json.files.filter((f: any) => f.state !== "unchanged")).toHaveLength(1);
  });

  it("reports a local edit as locally edited", () => {
    const repo = installedRepo(mk);
    appendFileSync(join(repo, HANDOVER), "\nOurs.\n");
    expect(stateOf(diff(repo, plugin, mk).json, HANDOVER).state).toBe("locally edited");
  });

  it("reports a hand-applied upstream change as already applied", () => {
    const repo = installedRepo(mk);
    cpSync(join(plugin, "templates/claude/agents/fixer.md"), join(repo, FIXER));
    expect(stateOf(diff(repo, plugin, mk).json, FIXER).state).toBe("already applied");
  });

  it("merges cleanly when the local edit and the upstream change touch different lines", () => {
    const repo = installedRepo(mk);
    const text = readFileSync(join(repo, FIXER), "utf8");
    writeFileSync(join(repo, FIXER), text.replace("# Fixer\n", "# Fixer\n\nOurs, near the top.\n"));
    const f = stateOf(diff(repo, plugin, mk).json, FIXER);
    expect(f.state).toBe("both");
    expect(f.merged).toBe("clean");
  });

  it("reports a conflict when both edit the same lines", () => {
    const repo = installedRepo(mk);
    appendFileSync(join(repo, FIXER), "\nOurs, at the end.\n");
    const f = stateOf(diff(repo, plugin, mk).json, FIXER);
    expect(f.state).toBe("both");
    expect(f.merged).toBe("conflict");
  });
});

describe("diff.mjs at the same version reads the plugin root, not the tag", () => {
  it("reports everything unchanged with a marketplace path that is not even a git repository", () => {
    const repo = installedRepo(mk);
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const r = diff(repo, mk, notAClone);
    expect(r.status).toBe(0);
    expect(r.json.recorded).toBe("0.1.0");
    expect(r.json.latest).toBe("0.1.0");
    expect(r.json.files.every((f: any) => f.state === "unchanged")).toBe(true);
  });
});

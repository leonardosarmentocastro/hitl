// scripts/__tests__/diff.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { MANIFEST_PATH, pluginVersion, renderMode, sha256 } from "../../installer/lib.mjs";

const ROOT = process.cwd();
const DIFF = join(ROOT, "installer/diff.mjs");
const ANSWERS = { provider: "github", testing: [], gates: [] };
// This repository's own version, and the next minor one that the fixture plugin is bumped to.
const CURRENT = pluginVersion(ROOT);
const NEXT = CURRENT.replace(/^(\d+)\.(\d+)\.\d+$/, (_, maj, min) => `${maj}.${Number(min) + 1}.0`);

function git(cwd: string, args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function copyPlugin(dest: string) {
  for (const d of ["templates", "installer", ".claude-plugin"]) {
    cpSync(join(ROOT, d), join(dest, d), { recursive: true });
  }
}

/**
 * A marketplace clone whose only tag, v<CURRENT>, is this repository's templates and installer;
 * and a plugin root at NEXT whose fixer agent gained one line at the end.
 */
function fixtureMarketplace() {
  const mk = mkdtempSync(join(tmpdir(), "hitl-mk-"));
  copyPlugin(mk);
  git(mk, ["init", "-q", "-b", "main"]);
  git(mk, ["config", "user.email", "t@example.com"]);
  git(mk, ["config", "user.name", "t"]);
  git(mk, ["add", "-A"]);
  git(mk, ["commit", "-q", "-m", CURRENT]);
  git(mk, ["tag", `v${CURRENT}`]);

  const plugin = mkdtempSync(join(tmpdir(), "hitl-plugin-"));
  copyPlugin(plugin);
  const pj = join(plugin, ".claude-plugin/plugin.json");
  writeFileSync(
    pj,
    JSON.stringify({ ...JSON.parse(readFileSync(pj, "utf8")), version: NEXT }, null, 2),
  );
  appendFileSync(
    join(plugin, "templates/claude/agents/fixer.md"),
    `\nUpstream added this line in ${NEXT}.\n`,
  );
  return { mk, plugin };
}

/**
 * A marketplace clone whose v<CURRENT> also owned `scripts/hitl/gone.sh`, which the NEXT plugin
 * no longer ships: a real upstream removal, rendered by the tag's own lib.mjs.
 */
function fixtureMarketplaceWithRemoval() {
  const mk = mkdtempSync(join(tmpdir(), "hitl-mk-removal-"));
  copyPlugin(mk);
  const lib = join(mk, "installer/lib.mjs");
  const anchor = `{ repoPath: "scripts/hitl/pr.sh", template: "scripts/pr.sh", executable: true },`;
  const text = readFileSync(lib, "utf8");
  expect(text).toContain(anchor);
  writeFileSync(
    lib,
    text.replace(
      anchor,
      `${anchor}\n    { repoPath: "scripts/hitl/gone.sh", template: "scripts/gone.sh", executable: true },`,
    ),
  );
  writeFileSync(join(mk, "templates/scripts/gone.sh"), "gone\n");
  git(mk, ["init", "-q", "-b", "main"]);
  git(mk, ["config", "user.email", "t@example.com"]);
  git(mk, ["config", "user.name", "t"]);
  git(mk, ["add", "-A"]);
  git(mk, ["commit", "-q", "-m", CURRENT]);
  git(mk, ["tag", `v${CURRENT}`]);
  return mk;
}

/**
 * A marketplace clone whose v<CURRENT> is what the released versions with the CI wipe job
 * owned: `scripts/hitl/wipe-superpowers-docs.sh` always, and the wipe workflow only when
 * `choices.ci === "github-actions"`; its manifest records `ci`. The NEXT plugin owns neither.
 */
function fixtureMarketplaceWithCiJob() {
  const mk = mkdtempSync(join(tmpdir(), "hitl-mk-ci-"));
  copyPlugin(mk);
  const lib = join(mk, "installer/lib.mjs");
  let text = readFileSync(lib, "utf8");
  const owned = `{ repoPath: "scripts/hitl/pr.sh", template: "scripts/pr.sh", executable: true },`;
  const ret = "  return files;\n}";
  const manifest = "    provider: choices.provider,\n";
  for (const anchor of [owned, ret, manifest]) expect(text).toContain(anchor);
  text = text
    .replace(
      owned,
      `${owned}\n    { repoPath: "scripts/hitl/wipe-superpowers-docs.sh", template: "scripts/wipe-superpowers-docs.sh", executable: true },`,
    )
    .replace(
      ret,
      `  if (choices.ci === "github-actions")\n    files.push({ repoPath: ".github/workflows/wipe-superpowers-docs.yml", template: "ci/github-actions/wipe-superpowers-docs.yml", executable: false });\n${ret}`,
    )
    .replace(manifest, `${manifest}    ci: choices.ci,\n`);
  writeFileSync(lib, text);
  writeFileSync(join(mk, "templates/scripts/wipe-superpowers-docs.sh"), "#!/bin/sh\necho wipe\n");
  mkdirSync(join(mk, "templates/ci/github-actions"), { recursive: true });
  writeFileSync(
    join(mk, "templates/ci/github-actions/wipe-superpowers-docs.yml"),
    "on:\n  push:\n    branches: [main]\n",
  );
  git(mk, ["init", "-q", "-b", "main"]);
  git(mk, ["config", "user.email", "t@example.com"]);
  git(mk, ["config", "user.name", "t"]);
  git(mk, ["add", "-A"]);
  git(mk, ["commit", "-q", "-m", CURRENT]);
  git(mk, ["tag", `v${CURRENT}`]);
  return mk;
}

/** A repository installed by the v<CURRENT> marketplace's own render.mjs. */
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
  const p = join(repo, MANIFEST_PATH);
  const m = JSON.parse(readFileSync(p, "utf8"));
  edit(m);
  writeFileSync(p, JSON.stringify(m, null, 2));
}

const FIXER = ".claude/agents/fixer.md";
const HANDOVER = ".claude/agents/handover.md";

let mk: string;
let mkRemoval: string;
let mkCi: string;
let plugin: string;
beforeAll(() => {
  ({ mk, plugin } = fixtureMarketplace());
  mkRemoval = fixtureMarketplaceWithRemoval();
  mkCi = fixtureMarketplaceWithCiJob();
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
    expect(r.json).toEqual({ refused: "tag-missing", tag: "v0.0.9", manifestPath: MANIFEST_PATH });
  });

  it("refuses a manifest ahead of the plugin instead of proposing a downgrade", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.version = "9.9.9"));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({
      refused: "ahead",
      recorded: "9.9.9",
      plugin: NEXT,
      manifestPath: MANIFEST_PATH,
    });
  });

  it("refuses a manifest path outside the repository instead of deleting it", () => {
    const repo = installedRepo(mk);
    const outside = join(repo, "..", `outside-${Math.random()}.txt`);
    writeFileSync(outside, "keep\n");
    const key = `../${outside.split("/").pop()}`;
    editManifest(repo, (m) => (m.files[key] = sha256("keep\n")));
    const r = diff(repo, plugin, mk, true);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({ refused: "unowned-path", paths: [key], manifestPath: MANIFEST_PATH });
    expect(existsSync(outside)).toBe(true);
  });

  it("refuses a manifest path hitl never owned instead of deleting it", () => {
    const repo = installedRepo(mk);
    writeFileSync(join(repo, "notes.md"), "ours\n");
    editManifest(repo, (m) => {
      m.files["notes.md"] = sha256("ours\n");
      m.files["/etc/hostname"] = "0".repeat(64);
    });
    const r = diff(repo, plugin, mk, true);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({
      refused: "unowned-path",
      paths: ["/etc/hostname", "notes.md"],
      manifestPath: MANIFEST_PATH,
    });
    expect(readFileSync(join(repo, "notes.md"), "utf8")).toBe("ours\n");
  });

  it("refuses when the recorded render does not hash to the manifest", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => (m.files[".hitl/HITL.md"] = "0".repeat(64)));
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(3);
    expect(r.json).toEqual({
      refused: "manifest-mismatch",
      paths: [".hitl/HITL.md"],
      manifestPath: MANIFEST_PATH,
    });
  });
});

describe("diff.mjs across versions (recorded from the tag, latest one minor ahead)", () => {
  it("reports the versions, unchanged files and the upstream change", () => {
    const repo = installedRepo(mk);
    const r = diff(repo, plugin, mk);
    expect(r.status).toBe(0);
    expect(r.json.recorded).toBe(CURRENT);
    expect(r.json.latest).toBe(NEXT);
    expect(stateOf(r.json, HANDOVER).state).toBe("unchanged");
    expect(stateOf(r.json, ".hitl/HITL.md").state).toBe("unchanged");
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
    writeFileSync(
      join(repo, FIXER),
      renderMode(
        readFileSync(join(plugin, "templates/claude/agents/fixer.md"), "utf8"),
        "installed",
      ),
    );
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

describe("diff.mjs temp files", () => {
  it("removes the recorded-version snapshot it extracts", () => {
    const repo = installedRepo(mk);
    const tmp = mkdtempSync(join(tmpdir(), "hitl-tmpdir-"));
    const r = spawnSync(
      "node",
      [DIFF, "--repo", repo, "--plugin-root", plugin, "--marketplace", mk],
      { encoding: "utf8", env: { ...process.env, TMPDIR: tmp } },
    );
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(readdirSync(tmp)).toEqual([]);
  });
});

describe("diff.mjs at the same version reads the plugin root, not the tag", () => {
  it("reports everything unchanged with a marketplace path that is not even a git repository", () => {
    const repo = installedRepo(mk);
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const r = diff(repo, mk, notAClone);
    expect(r.status).toBe(0);
    expect(r.json.recorded).toBe(CURRENT);
    expect(r.json.latest).toBe(CURRENT);
    expect(r.json.files.every((f: any) => f.state === "unchanged")).toBe(true);
  });
});

describe("diff.mjs release notes", () => {
  const CHANGELOG = `# Changelog\n\n## Unreleased\n\n- later\n\n## ${NEXT}\n\n- next\n\n## ${CURRENT}\n\n- current\n`;
  // Its own fixture, so the changelog written into it never reaches the shared plugin root.
  let notesMk: string;
  let notesPlugin: string;
  beforeAll(() => {
    ({ mk: notesMk, plugin: notesPlugin } = fixtureMarketplace());
  });

  it("reports no notes without a changelog", () => {
    const repo = installedRepo(notesMk);
    const r = diff(repo, notesPlugin, notesMk);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.notes).toEqual([]);
    expect(r.json.latest).toBe(NEXT);
  });

  it("reports the notes for the versions being skipped", () => {
    writeFileSync(join(notesPlugin, "CHANGELOG.md"), CHANGELOG);
    const repo = installedRepo(notesMk);
    const r = diff(repo, notesPlugin, notesMk);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.notes).toEqual([{ version: NEXT, text: "- next" }]);
  });

  it("--apply reports the notes too", () => {
    writeFileSync(join(notesPlugin, "CHANGELOG.md"), CHANGELOG);
    const repo = installedRepo(notesMk);
    const r = diff(repo, notesPlugin, notesMk, true);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.applied).toBe(true);
    expect(r.json.notes).toEqual([{ version: NEXT, text: "- next" }]);
  });

  it("reports no notes at the same version", () => {
    const copy = mkdtempSync(join(tmpdir(), "hitl-samever-"));
    cpSync(mk, copy, { recursive: true });
    writeFileSync(join(copy, "CHANGELOG.md"), CHANGELOG);
    const repo = installedRepo(mk);
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const r = diff(repo, copy, notAClone);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.latest).toBe(CURRENT);
    expect(r.json.notes).toEqual([]);
  });
});

describe("diff.mjs and the GitLab backend", () => {
  const GITLAB_FILES = [
    "scripts/hitl/backend.sh",
    "scripts/hitl/gitlab.mjs",
    "scripts/hitl/host.mjs",
  ];

  it("diffs a provider gitlab install clean at the same version", () => {
    const repo = installedRepo(mk, { provider: "gitlab", testing: [], gates: [] });
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const r = diff(repo, mk, notAClone);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const p of GITLAB_FILES) expect(stateOf(r.json, p)?.state, p).toBe("unchanged");
    expect(r.json.files.filter((f: any) => f.state === "removed upstream")).toEqual([]);
  });

  it("never adds the GitLab files when a github install is upgraded", () => {
    const repo = installedRepo(mk);
    const r = diff(repo, plugin, mk, true);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const p of ["scripts/hitl/gitlab.mjs", "scripts/hitl/host.mjs"]) {
      expect(stateOf(r.json, p), p).toBeUndefined();
      expect(existsSync(join(repo, p)), p).toBe(false);
    }
  });
});

describe("diff.mjs absent cases", () => {
  it("reports a deleted owned file as missing locally", () => {
    const repo = installedRepo(mk);
    rmSync(join(repo, ".claude/commands/handover.md"));
    expect(stateOf(diff(repo, plugin, mk).json, ".claude/commands/handover.md").state).toBe(
      "missing locally",
    );
  });

  it("reports a file the manifest never recorded as new upstream", () => {
    const repo = installedRepo(mk);
    editManifest(repo, (m) => delete m.files[".claude/commands/handover.md"]);
    expect(stateOf(diff(repo, plugin, mk).json, ".claude/commands/handover.md").state).toBe(
      "new upstream",
    );
  });

  it("reports a recorded file with no template at latest as removed upstream, same or edited", () => {
    const repo = installedRepo(mkRemoval);
    let f = stateOf(diff(repo, plugin, mkRemoval).json, "scripts/hitl/gone.sh");
    expect(f.state).toBe("removed upstream");
    expect(f.local).toBe("same");
    appendFileSync(join(repo, "scripts/hitl/gone.sh"), "ours\n");
    f = stateOf(diff(repo, plugin, mkRemoval).json, "scripts/hitl/gone.sh");
    expect(f.local).toBe("edited");
    rmSync(join(repo, "scripts/hitl/gone.sh"));
    expect(stateOf(diff(repo, plugin, mkRemoval).json, "scripts/hitl/gone.sh").local).toBe(
      "absent",
    );
  });
});

describe("diff.mjs --apply", () => {
  it("writes the upstream change, bumps the manifest and the README version, deletes what was removed", () => {
    const repo = installedRepo(mkRemoval);
    appendFileSync(join(repo, HANDOVER), "\nOurs.\n");

    const r = diff(repo, plugin, mkRemoval, true);
    expect(r.status).toBe(0);
    expect(r.json.applied).toBe(true);
    expect(r.json.written).toEqual([FIXER]);
    expect(r.json.deleted).toEqual(["scripts/hitl/gone.sh"]);

    expect(readFileSync(join(repo, FIXER), "utf8")).toContain(
      `Upstream added this line in ${NEXT}.`,
    );
    expect(existsSync(join(repo, "scripts/hitl/gone.sh"))).toBe(false);
    expect(readFileSync(join(repo, HANDOVER), "utf8")).toContain("Ours."); // locally edited: kept

    const manifest = JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));
    expect(manifest.version).toBe(NEXT);
    expect(manifest.files).not.toHaveProperty("scripts/hitl/gone.sh");
    expect(manifest.files[FIXER]).toBe(
      sha256(
        renderMode(
          readFileSync(join(plugin, "templates/claude/agents/fixer.md"), "utf8"),
          "installed",
        ),
      ),
    );
    // The manifest records the template's installed render, never the local edit.
    expect(manifest.files[HANDOVER]).toBe(
      sha256(
        renderMode(
          readFileSync(join(plugin, "templates/claude/agents/handover.md"), "utf8"),
          "installed",
        ),
      ),
    );

    expect(r.json.readmeBumped).toBe(true);
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(readme).toContain(`Installed by hitl ${NEXT}`);
    expect(readme).not.toContain(`Installed by hitl ${CURRENT}`);

    // A second diff now sees only the local edit.
    const again = diff(repo, plugin, mkRemoval).json;
    expect(again.recorded).toBe(NEXT);
    expect(stateOf(again, FIXER).state).toBe("unchanged");
    expect(stateOf(again, HANDOVER).state).toBe("locally edited");
  });

  it("says the README was not bumped when the repository has none", () => {
    const repo = installedRepo(mk);
    rmSync(join(repo, "README.md"));
    const r = diff(repo, plugin, mk, true);
    expect(r.status).toBe(0);
    expect(r.json.readmeBumped).toBe(false);
    expect(existsSync(join(repo, "README.md"))).toBe(false);
  });

  it("--apply refreshes the hitl block in .gitignore and keeps the lines around it", () => {
    const repo = installedRepo(mk);
    const p = join(repo, ".gitignore");
    writeFileSync(
      p,
      "dist/\n\n<!-- hitl:start -->\n# old block\n.claude/reviews/\n<!-- hitl:end -->\nafter/\n",
    );
    const r = diff(repo, plugin, mk, true);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.gitignoreRefreshed).toBe(true);
    const text = readFileSync(p, "utf8");
    expect(text).toContain(".claude/worktrees/");
    expect(text).not.toContain("# old block");
    expect(text.startsWith("dist/\n\n<!-- hitl:start -->\n")).toBe(true);
    expect(text.endsWith("<!-- hitl:end -->\nafter/\n")).toBe(true);
  });

  it("--apply leaves a .gitignore without the hitl markers alone", () => {
    const repo = installedRepo(mk);
    const p = join(repo, ".gitignore");
    writeFileSync(p, "dist/\n");
    const r = diff(repo, plugin, mk, true);
    expect(r.json.gitignoreRefreshed).toBe(false);
    expect(readFileSync(p, "utf8")).toBe("dist/\n");
  });

  it("writes a conflicted file with its hunks and reports it", () => {
    const repo = installedRepo(mk);
    appendFileSync(join(repo, FIXER), "\nOurs, at the end.\n");
    const r = diff(repo, plugin, mk, true);
    expect(stateOf(r.json, FIXER).merged).toBe("conflict");
    const text = readFileSync(join(repo, FIXER), "utf8");
    expect(text).toContain("<<<<<<< this repository");
    expect(text).toContain(">>>>>>> hitl latest");
  });

  it("reports a failed write as exit 2 JSON, naming what was already written", () => {
    const repo = installedRepo(mk);
    rmSync(join(repo, "scripts/hitl/pr.sh")); // missing locally: written after the fixer agent
    chmodSync(join(repo, "scripts/hitl"), 0o555);
    try {
      const r = diff(repo, plugin, mk, true);
      expect(r.status, r.stderr).toBe(2);
      expect(typeof r.json.error).toBe("string");
      expect(r.json.written).toEqual([FIXER]);
      expect(r.json.deleted).toEqual([]);
      expect(r.json.manifest).toBe("untouched");
      // The manifest is written last, so it still records the old version.
      expect(JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8")).version).toBe(CURRENT);
    } finally {
      chmodSync(join(repo, "scripts/hitl"), 0o755);
    }
  });

  it("says nothing to apply at the same version with no writes", () => {
    const repo = installedRepo(mk);
    const notAClone = mkdtempSync(join(tmpdir(), "hitl-notaclone-"));
    const before = readFileSync(join(repo, MANIFEST_PATH), "utf8");
    const r = diff(repo, mk, notAClone, true);
    expect(r.status).toBe(0);
    expect(r.json.nothing).toBe(true);
    expect(readFileSync(join(repo, MANIFEST_PATH), "utf8")).toBe(before);
  });
});

describe("diff.mjs upgrading a manifest written by an older hitl with the CI wipe job", () => {
  const WORKFLOW = ".github/workflows/wipe-superpowers-docs.yml";
  const SCRIPT = "scripts/hitl/wipe-superpowers-docs.sh";
  const manifestOf = (repo: string) => JSON.parse(readFileSync(join(repo, MANIFEST_PATH), "utf8"));

  it("removes both unedited files and drops ci from the manifest", () => {
    const repo = installedRepo(mkCi, { ...ANSWERS, ci: "github-actions" });
    expect(manifestOf(repo).ci).toBe("github-actions");
    const r = diff(repo, plugin, mkCi);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const p of [WORKFLOW, SCRIPT]) {
      expect(stateOf(r.json, p), p).toEqual({ path: p, state: "removed upstream", local: "same" });
    }
    const a = diff(repo, plugin, mkCi, true);
    expect(a.status, a.stdout + a.stderr).toBe(0);
    expect(a.json.deleted).toEqual([WORKFLOW, SCRIPT]);
    expect(a.json.keptRemoved).toEqual([]);
    expect(existsSync(join(repo, WORKFLOW))).toBe(false);
    expect(existsSync(join(repo, SCRIPT))).toBe(false);
    expect(manifestOf(repo)).not.toHaveProperty("ci");
  });

  it("keeps an edited workflow, deletes the script and names the kept file", () => {
    const repo = installedRepo(mkCi, { ...ANSWERS, ci: "github-actions" });
    writeFileSync(join(repo, WORKFLOW), "on:\n  push:\n    branches: [master]\n");
    const r = diff(repo, plugin, mkCi, true);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(stateOf(r.json, WORKFLOW).local).toBe("edited");
    expect(r.json.deleted).toEqual([SCRIPT]);
    expect(existsSync(join(repo, WORKFLOW))).toBe(true);
    expect(r.json.keptRemoved).toEqual([WORKFLOW]);
    expect(manifestOf(repo)).not.toHaveProperty("ci");
  });

  it("never reports the workflow for a repository that declined the job (ci: none)", () => {
    const repo = installedRepo(mkCi, { ...ANSWERS, ci: "none" });
    expect(manifestOf(repo).ci).toBe("none");
    const r = diff(repo, plugin, mkCi);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(stateOf(r.json, WORKFLOW)).toBeUndefined();
    expect(stateOf(r.json, SCRIPT)).toEqual({
      path: SCRIPT,
      state: "removed upstream",
      local: "same",
    });
    const a = diff(repo, plugin, mkCi, true);
    expect(a.status, a.stdout + a.stderr).toBe(0);
    expect(a.json.deleted).toEqual([SCRIPT]);
    expect(a.json.keptRemoved).toEqual([]);
    expect(manifestOf(repo)).not.toHaveProperty("ci");
  });
});

// ---------------------------------------------------------------------------------------------
// Upgrading an install made before 0.3.0, whose files sat at the old paths.

function runDiff(repo: string, plugin: string, mk: string, extra: string[] = []) {
  const r = spawnSync(
    "node",
    [DIFF, "--repo", repo, "--plugin-root", plugin, "--marketplace", mk, ...extra],
    {
      encoding: "utf8",
    },
  );
  if (!r.stdout) throw new Error(r.stderr);
  return { out: JSON.parse(r.stdout), status: r.status };
}

function entry(out: any, path: string) {
  return out.files.find((f: any) => f.path === path);
}

/** Replace every anchor in a file of the copy, asserting each is present first. */
function patch(file: string, pairs: [string, string][]) {
  let text = readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    expect(text, `${file}: ${from}`).toContain(from);
    text = text.split(from).join(to);
  }
  writeFileSync(file, text);
}

let oldLayout: { mk: string; plugin: string } | undefined;

/**
 * A marketplace whose tag v<CURRENT> is this repository's installer and templates patched back
 * to the layout before 0.3.0; a plugin root at NEXT; and a fresh repository installed by the
 * tag's own render.mjs (HITL.md, .claude/review-context.md, .claude/hitl.json, @HITL.md).
 */
function fixtureOldLayout(): { mk: string; plugin: string; repo: string } {
  if (!oldLayout) {
    const mk = mkdtempSync(join(tmpdir(), "hitl-mk-old-"));
    copyPlugin(mk);
    patch(join(mk, "installer/lib.mjs"), [
      [
        'export const MANIFEST_PATH = ".hitl/manifest.json";',
        'export const MANIFEST_PATH = ".claude/hitl.json";',
      ],
      ['export const DOCTRINE_PATH = ".hitl/HITL.md";', 'export const DOCTRINE_PATH = "HITL.md";'],
      ['repoPath: ".hitl/review-context.md",', 'repoPath: ".claude/review-context.md",'],
      ['export const CLAUDE_LINE = "@.hitl/HITL.md";', 'export const CLAUDE_LINE = "@HITL.md";'],
      ["The doctrine is \\`.hitl/HITL.md\\`.", "The doctrine is \\`HITL.md\\`."],
      [
        "- \\`.claude/\\` (agents, commands, hook) and \\`.hitl/\\` (the doctrine, the reviewer context) are\n  reviewed like code: change them by pull request.",
        "- \\`.claude/\\` (agents, commands, hook) and \\`HITL.md\\` are reviewed like code: change them by\n  pull request.",
      ],
    ]);
    for (const t of ["templates/HITL.md", "templates/claude/review-context.md"]) {
      let text = readFileSync(join(mk, t), "utf8");
      expect(text, t).toContain(".hitl/");
      text = text
        .split(".hitl/HITL.md")
        .join("HITL.md")
        .split(".hitl/review-context.md")
        .join(".claude/review-context.md")
        .split(".hitl/manifest.json")
        .join(".claude/hitl.json");
      writeFileSync(join(mk, t), text);
    }
    git(mk, ["init", "-q", "-b", "main"]);
    git(mk, ["config", "user.email", "t@example.com"]);
    git(mk, ["config", "user.name", "t"]);
    git(mk, ["add", "-A"]);
    git(mk, ["commit", "-q", "-m", CURRENT]);
    git(mk, ["tag", `v${CURRENT}`]);

    const plugin = mkdtempSync(join(tmpdir(), "hitl-plugin-next-"));
    copyPlugin(plugin);
    const pj = join(plugin, ".claude-plugin/plugin.json");
    writeFileSync(
      pj,
      JSON.stringify({ ...JSON.parse(readFileSync(pj, "utf8")), version: NEXT }, null, 2),
    );
    oldLayout = { mk, plugin };
  }
  const repo = installedRepo(oldLayout.mk);
  for (const p of ["HITL.md", ".claude/review-context.md", ".claude/hitl.json"]) {
    expect(existsSync(join(repo, p)), p).toBe(true);
  }
  expect(existsSync(join(repo, ".hitl"))).toBe(false);
  expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@HITL.md\n");
  const readme = readFileSync(join(repo, "README.md"), "utf8");
  expect(readme).toContain("`HITL.md`");
  expect(readme).not.toContain(".hitl/");
  return { ...oldLayout, repo };
}

describe("diff.mjs on an old-layout install", () => {
  it("finds the manifest at the old path and reports the versions", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    const { out, status } = runDiff(repo, plugin, mk);
    expect(status).toBe(0);
    expect(out.recorded).toBe(CURRENT);
    expect(out.latest).toBe(NEXT);
    expect(out.manifestPath).toBe(".claude/hitl.json");
  });

  it("refuses an old-layout manifest at the plugin's own version as unowned-path", () => {
    const { mk, repo } = fixtureOldLayout();
    // plugin root = ROOT (version CURRENT): the latest render owns no `from` path
    const { out, status } = runDiff(repo, ROOT, mk);
    expect(status).toBe(3);
    expect(out.refused).toBe("unowned-path");
    expect(out.paths).toEqual([".claude/review-context.md", "HITL.md"]);
  });
});

describe("diff.mjs reports a moved file as one entry at its new path", () => {
  it("reports an untouched doctrine as one moved entry, upstream changed", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    const { out, status } = runDiff(repo, plugin, mk);
    expect(status).toBe(0);
    const e = entry(out, ".hitl/HITL.md");
    expect(e).toMatchObject({ movedFrom: "HITL.md", state: "upstream changed" });
    expect(entry(out, "HITL.md")).toBeUndefined();
    expect(entry(out, ".claude/review-context.md")).toBeUndefined();
  });

  it("reports a customized doctrine and an edited reviewer context as both, merged clean", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    appendFileSync(join(repo, "HITL.md"), "\n## Ours\n\nA local rule.\n");
    appendFileSync(join(repo, ".claude/review-context.md"), "\n- A local anchor.\n");
    const { out } = runDiff(repo, plugin, mk);
    expect(entry(out, ".hitl/HITL.md")).toMatchObject({ state: "both", merged: "clean" });
    expect(entry(out, ".hitl/review-context.md")).toMatchObject({
      movedFrom: ".claude/review-context.md",
      state: "both",
      merged: "clean",
    });
  });

  it("classifies a doctrine moved by hand against the old record, never as new upstream", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    appendFileSync(join(repo, "HITL.md"), "\n## Ours\n\nA local rule.\n");
    mkdirSync(join(repo, ".hitl"));
    renameSync(join(repo, "HITL.md"), join(repo, ".hitl/HITL.md"));
    const { out } = runDiff(repo, plugin, mk);
    expect(entry(out, ".hitl/HITL.md")).toMatchObject({ movedFrom: "HITL.md", state: "both" });
  });

  it("refuses when both paths hold different text", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    mkdirSync(join(repo, ".hitl"));
    writeFileSync(join(repo, ".hitl/HITL.md"), "Something else entirely.\n");
    const { out, status } = runDiff(repo, plugin, mk);
    expect(status).toBe(3);
    expect(out).toMatchObject({ refused: "move-collision", paths: ["HITL.md", ".hitl/HITL.md"] });
  });

  it("reports a deleted doctrine as a moved entry, missing locally", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    rmSync(join(repo, "HITL.md"));
    const { out } = runDiff(repo, plugin, mk);
    expect(entry(out, ".hitl/HITL.md")).toMatchObject({
      movedFrom: "HITL.md",
      state: "missing locally",
    });
  });
});

/** A doctrine and a reviewer context the repository edited away from the lines upstream changed. */
function customize(repo: string) {
  appendFileSync(join(repo, "HITL.md"), "\n## Ours\n\nA local rule.\n");
  appendFileSync(join(repo, ".claude/review-context.md"), "\n- A local anchor.\n");
}

/** A doctrine edited on a line the latest template also changed. */
function conflictingEdit(repo: string) {
  const p = join(repo, "HITL.md");
  const text = readFileSync(p, "utf8");
  expect(text).toContain("`HITL.md` (this doctrine)");
  writeFileSync(p, text.replace("`HITL.md` (this doctrine)", "`HITL.md` (our own doctrine)"));
}

/**
 * The state "files moved, manifest not": a full apply, then the new manifest deleted and the
 * old one restored (a directory at .hitl/manifest.json would make the layout read "current").
 */
function filesMovedManifestNot(repo: string, plugin: string, mk: string) {
  const oldManifest = readFileSync(join(repo, ".claude/hitl.json"), "utf8");
  const first = runDiff(repo, plugin, mk, ["--apply"]);
  expect(first.status, JSON.stringify(first.out)).toBe(0);
  rmSync(join(repo, ".hitl/manifest.json"));
  writeFileSync(join(repo, ".claude/hitl.json"), oldManifest);
  return oldManifest;
}

describe("diff.mjs --apply on an old-layout install", () => {
  it("moves a customized doctrine with its edits and relocates the manifest", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    customize(repo);
    const { out, status } = runDiff(repo, plugin, mk, ["--apply"]);
    expect(status).toBe(0);
    expect(out.nothing).toBeUndefined();
    expect(readFileSync(join(repo, ".hitl/review-context.md"), "utf8")).toContain(
      "A local anchor.",
    );
    const moved = readFileSync(join(repo, ".hitl/HITL.md"), "utf8");
    expect(moved).toContain("A local rule.");
    expect(moved).toContain(".hitl/review-context.md"); // the upstream change arrived too
    expect(existsSync(join(repo, "HITL.md"))).toBe(false);
    expect(existsSync(join(repo, ".claude/review-context.md"))).toBe(false);
    expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(repo, ".hitl/manifest.json"), "utf8")).version).toBe(NEXT);
    expect(out.deleted).toEqual(
      expect.arrayContaining(["HITL.md", ".claude/review-context.md", ".claude/hitl.json"]),
    );
    // and the record still describes the template, so the edit stays visible
    const again = runDiff(repo, plugin, mk);
    expect(entry(again.out, ".hitl/HITL.md").state).toBe("locally edited");
    expect(runDiff(repo, plugin, mk, ["--apply"]).out.nothing).toBe(true);
  });

  it("writes a conflicted moved file at the new path and removes the old one", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    conflictingEdit(repo);
    const { out, status } = runDiff(repo, plugin, mk, ["--apply"]);
    expect(status).toBe(0);
    expect(entry(out, ".hitl/HITL.md")).toMatchObject({ state: "both", merged: "conflict" });
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toContain("<<<<<<< this repository");
    expect(existsSync(join(repo, "HITL.md"))).toBe(false);
  });

  it("resumes when a pair's write landed and its removal did not", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    customize(repo);
    // Learn the outcome on a copy, then land only the write in the real repository.
    const copy = mkdtempSync(join(tmpdir(), "hitl-copy-"));
    cpSync(repo, copy, { recursive: true });
    expect(runDiff(copy, plugin, mk, ["--apply"]).status).toBe(0);
    const outcomeText = readFileSync(join(copy, ".hitl/HITL.md"), "utf8");
    expect(outcomeText).toContain("A local rule.");
    mkdirSync(join(repo, ".hitl"));
    writeFileSync(join(repo, ".hitl/HITL.md"), outcomeText);
    const { out, status } = runDiff(repo, plugin, mk, ["--apply"]);
    expect(status, JSON.stringify(out)).toBe(0);
    expect(existsSync(join(repo, "HITL.md"))).toBe(false);
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe(outcomeText);
    // what the command stages: the resumed pair's new path with its old path's removal
    expect(out.written).toContain(".hitl/HITL.md");
    expect(out.deleted).toContain("HITL.md");
  });

  it("resumes when the files moved and the manifest did not", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    customize(repo);
    filesMovedManifestNot(repo, plugin, mk);
    const before = readFileSync(join(repo, ".hitl/HITL.md"), "utf8");
    expect(before).toContain("A local rule.");
    const second = runDiff(repo, plugin, mk, ["--apply"]);
    expect(second.status, JSON.stringify(second.out)).toBe(0);
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe(before);
    expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
    expect(existsSync(join(repo, ".hitl/manifest.json"))).toBe(true);
    // the first run removed the old paths; this run's output still names them for staging
    expect(second.out.written).toEqual(
      expect.arrayContaining([".hitl/HITL.md", ".hitl/review-context.md"]),
    );
    expect(second.out.deleted).toEqual(
      expect.arrayContaining(["HITL.md", ".claude/review-context.md", ".claude/hitl.json"]),
    );
  });

  it("does not merge again a moved file that still carries conflict hunks", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    conflictingEdit(repo);
    filesMovedManifestNot(repo, plugin, mk);
    const before = readFileSync(join(repo, ".hitl/HITL.md"), "utf8");
    expect(before).toContain("<<<<<<< this repository");
    const second = runDiff(repo, plugin, mk, ["--apply"]);
    expect(second.status, JSON.stringify(second.out)).toBe(0);
    expect(entry(second.out, ".hitl/HITL.md")).toMatchObject({
      state: "both",
      merged: "conflict",
    });
    expect(readFileSync(join(repo, ".hitl/HITL.md"), "utf8")).toBe(before);
  });

  it("removes a leftover old manifest on a current-layout repository", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    const oldManifest = readFileSync(join(repo, ".claude/hitl.json"), "utf8");
    expect(runDiff(repo, plugin, mk, ["--apply"]).status).toBe(0);
    writeFileSync(join(repo, ".claude/hitl.json"), oldManifest);
    const report = runDiff(repo, plugin, mk).out;
    expect(report.leftovers).toEqual([".claude/hitl.json"]);
    const applied = runDiff(repo, plugin, mk, ["--apply"]).out;
    expect(applied.nothing).toBeUndefined();
    expect(applied.deleted).toEqual(
      expect.arrayContaining([".claude/hitl.json", "HITL.md", ".claude/review-context.md"]),
    );
    expect(applied.written).toEqual(
      expect.arrayContaining([".hitl/HITL.md", ".hitl/review-context.md"]),
    );
    expect(existsSync(join(repo, ".claude/hitl.json"))).toBe(false);
  });
});

describe("diff.mjs --apply moves the doctrine's references", () => {
  const blockOf = (readme: string) =>
    readme.slice(readme.indexOf("<!-- hitl:start -->"), readme.indexOf("<!-- hitl:end -->"));

  it("rewrites the CLAUDE.md import line", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    const { out, status } = runDiff(repo, plugin, mk, ["--apply"]);
    expect(status).toBe(0);
    expect(out.claudeLine).toBe("rewritten");
    expect(readFileSync(join(repo, "CLAUDE.md"), "utf8")).toBe("@.hitl/HITL.md\n");
  });

  it("adds no CLAUDE.md when the repository has none", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    rmSync(join(repo, "CLAUDE.md"));
    const { out, status } = runDiff(repo, plugin, mk, ["--apply"]);
    expect(status).toBe(0);
    expect(out.claudeLine).toBe("absent");
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
  });

  it("rewrites the doctrine path inside the README block only", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    const p = join(repo, "README.md");
    writeFileSync(p, `${readFileSync(p, "utf8")}\nOur own note about \`HITL.md\`.\n`);
    expect(runDiff(repo, plugin, mk, ["--apply"]).status).toBe(0);
    const readme = readFileSync(p, "utf8");
    expect(blockOf(readme)).toContain("`.hitl/HITL.md`");
    expect(blockOf(readme)).not.toContain("`HITL.md`");
    expect(readme).toContain("\nOur own note about `HITL.md`.\n");
  });

  it("never doubles the README path on a resumed apply", () => {
    const { mk, plugin, repo } = fixtureOldLayout();
    customize(repo);
    filesMovedManifestNot(repo, plugin, mk);
    expect(runDiff(repo, plugin, mk, ["--apply"]).status).toBe(0);
    const readme = readFileSync(join(repo, "README.md"), "utf8");
    expect(blockOf(readme)).toContain("`.hitl/HITL.md`");
    expect(readme).not.toContain(".hitl/.hitl/");
  });
});

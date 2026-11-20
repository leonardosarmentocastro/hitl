// scripts/__tests__/release-prepare.test.ts — `scripts/release.mjs prepare`, against temporary
// git repositories.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import { changelogSections, compareVersions, pluginVersion } from "../../installer/lib.mjs";
import { nextVersion } from "../release.mjs";
import {
  type Pr,
  commit,
  git,
  initRepo,
  prsFile,
  release,
  releaseRepo,
} from "./helpers/release-repo";

function read(repo: string, path: string): string {
  return readFileSync(join(repo, path), "utf8");
}

function readAt(repo: string, ref: string, path: string): string {
  return `${git(repo, "show", `${ref}:${path}`)}\n`;
}

function pr(number: number, title: string, headRefName: string, oid: string): Pr {
  return { number, title, headRefName, mergeCommit: { oid } };
}

describe("release.mjs prepare — nothing to release", () => {
  it("releases nothing when no pull request is unreleased", () => {
    const repo = releaseRepo();
    const r = release(["prepare", "--repo", repo, "--prs", prsFile([])]);
    expect(r.status).toBe(0);
    expect(r.out).toEqual({ released: false });
    expect(git(repo, "status", "--porcelain")).toBe("");
  });
  it("ignores a pull request already contained in the current version's tag", () => {
    const repo = releaseRepo({ tag: false });
    const old = commit(repo, "old feature");
    git(repo, "tag", "v0.3.0");
    const r = release([
      "prepare",
      "--repo",
      repo,
      "--prs",
      prsFile([pr(1, "Old", "feat/old", old)]),
    ]);
    expect(r.out).toEqual({ released: false });
  });
  it("ignores a pull request whose merge commit is null or not in this checkout", () => {
    const repo = releaseRepo();
    const prs = [
      pr(2, "Unknown", "feat/a", "0".repeat(40)),
      { number: 3, title: "Null", headRefName: "feat/b", mergeCommit: null },
    ];
    expect(release(["prepare", "--repo", repo, "--prs", prsFile(prs)]).out).toEqual({
      released: false,
    });
  });
  it("ignores unreleased pull requests that are neither feat/ nor fix/", () => {
    const repo = releaseRepo();
    const sha = commit(repo, "docs");
    const prs = [
      pr(4, "Docs", "docs/readme", sha),
      pr(5, "Chore", "chore/x", sha),
      pr(6, "No slash", "feat", sha),
    ];
    expect(release(["prepare", "--repo", repo, "--prs", prsFile(prs)]).out).toEqual({
      released: false,
    });
  });
  it("runs when started through a symlinked checkout path", () => {
    const link = join(mkdtempSync(join(tmpdir(), "hitl-release-link-")), "checkout");
    symlinkSync(process.cwd(), link);
    const r = spawnSync(
      process.execPath,
      [join(link, "scripts/release.mjs"), "prepare", "--repo", releaseRepo(), "--prs", prsFile([])],
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ released: false });
  });
  it("prints usage for an unknown command or a missing argument", () => {
    expect(release(["nope"]).status).toBe(1);
    expect(release(["prepare", "--repo", releaseRepo()]).status).toBe(1);
  });
  it("ignores a pull request whose merge commit exists but is not in main's history", () => {
    const repo = releaseRepo();
    git(repo, "checkout", "-q", "-b", "side");
    const side = commit(repo, "side work");
    git(repo, "checkout", "-q", "main");
    expect(
      release(["prepare", "--repo", repo, "--prs", prsFile([pr(9, "Side", "feat/side", side)])])
        .out,
    ).toEqual({ released: false });
  });
});

describe("release.mjs prepare — a release", () => {
  it("computes the next version from the prefixes", () => {
    expect(nextVersion("0.3.0", ["docs", "feat", "fix"])).toEqual({
      version: "0.4.0",
      bump: "minor",
    });
    expect(nextVersion("0.3.2", ["feat"])).toEqual({ version: "0.4.0", bump: "minor" });
    expect(nextVersion("0.3.0", ["fix", "chore"])).toEqual({ version: "0.3.1", bump: "patch" });
    expect(nextVersion("1.2.3", ["fix"])).toEqual({ version: "1.2.4", bump: "patch" });
    expect(nextVersion("0.3.0", ["docs"])).toBeNull();
  });
  it("writes the four files for a feat pull request", () => {
    const repo = releaseRepo({ tag: false });
    const old = commit(repo, "old");
    git(repo, "tag", "v0.3.0");
    const a = commit(repo, "a");
    const b = commit(repo, "b");
    const c = commit(repo, "c");
    const prs = [
      pr(7, "Fix a thing", "fix/thing", b),
      pr(5, "  Add a thing ", "feat/thing", a),
      pr(8, "Docs", "docs/x", c),
      pr(3, "Old feature", "feat/old", old), // already released
      pr(4, "Elsewhere", "feat/elsewhere", "0".repeat(40)), // not in this checkout
      { number: 6, title: "Null", headRefName: "feat/null", mergeCommit: null },
    ];
    const r = release(["prepare", "--repo", repo, "--prs", prsFile(prs)]);
    expect(r.status).toBe(0);
    expect(r.out).toEqual({ released: true, version: "0.4.0", bump: "minor", prs: [5, 7] });
    expect(read(repo, "CHANGELOG.md")).toBe(
      "# Changelog\n\nintro\n\n## Unreleased\n\n## 0.4.0\n\n- Add a thing (#5)\n- Fix a thing (#7)\n\n## 0.3.0\n\n- three\n",
    );
    for (const f of [
      ".claude-plugin/plugin.json",
      ".claude-plugin/marketplace.json",
      ".hitl/manifest.json",
    ]) {
      expect(read(repo, f)).toBe(
        readAt(repo, "HEAD", f).replace('"version": "0.3.0"', '"version": "0.4.0"'),
      );
    }
  });
  it("cuts a patch when only fix pull requests are unreleased", () => {
    const repo = releaseRepo({ tag: false });
    const old = commit(repo, "old");
    git(repo, "tag", "v0.3.0");
    const prs = [pr(3, "Old feature", "feat/old", old), pr(9, "Fix", "fix/x", commit(repo, "x"))];
    const r = release(["prepare", "--repo", repo, "--prs", prsFile(prs)]);
    expect(r.out).toEqual({ released: true, version: "0.3.1", bump: "patch", prs: [9] });
  });
  it("carries the text under Unreleased into the new section and empties Unreleased", () => {
    const repo = releaseRepo({
      changelog: "# Changelog\n\n## Unreleased\n\n- by hand\n\n## 0.3.0\n\n- three",
    });
    release([
      "prepare",
      "--repo",
      repo,
      "--prs",
      prsFile([pr(5, "Add", "feat/x", commit(repo, "x"))]),
    ]);
    expect(read(repo, "CHANGELOG.md")).toBe(
      "# Changelog\n\n## Unreleased\n\n## 0.4.0\n\n- by hand\n\n- Add (#5)\n\n## 0.3.0\n\n- three\n",
    );
  });
});

describe("release.mjs prepare — refusals and errors", () => {
  const cases: [string, (repo: string) => void][] = [
    [
      "versions-disagree",
      (repo) => commit(repo, "x", { ".hitl/manifest.json": '{\n  "version": "0.2.0"\n}\n' }),
    ],
    [
      "bad-version",
      (repo) => {
        commit(repo, "x", {
          ".claude-plugin/plugin.json": '{\n  "name": "hitl",\n  "version": "0.3.0-rc.1"\n}\n',
          ".claude-plugin/marketplace.json":
            '{\n  "plugins": [{ "name": "hitl", "version": "0.3.0-rc.1", "source": "./" }]\n}\n',
          ".hitl/manifest.json": '{\n  "version": "0.3.0-rc.1"\n}\n',
        });
        git(repo, "tag", "v0.3.0-rc.1");
      },
    ],
    [
      "no-unreleased-section",
      (repo) => commit(repo, "x", { "CHANGELOG.md": "# Changelog\n\n## 0.3.0\n\n- three\n" }),
    ],
    // present, but not the first section
    [
      "no-unreleased-section",
      (repo) =>
        commit(repo, "x", {
          "CHANGELOG.md": "# Changelog\n\n## 0.3.0\n\n- three\n\n## Unreleased\n",
        }),
    ],
    // the version string occurs zero times in the expected `"version": "<current>"` form
    [
      "version-not-found",
      (repo) => commit(repo, "x", { ".hitl/manifest.json": '{"version":"0.3.0"}\n' }),
    ],
    [
      "section-exists",
      (repo) =>
        commit(repo, "x", {
          "CHANGELOG.md":
            "# Changelog\n\n## Unreleased\n\n## 0.4.0\n\n- early\n\n## 0.3.0\n\n- three\n",
        }),
    ],
    // the version string occurs twice
    [
      "version-not-found",
      (repo) =>
        commit(repo, "x", {
          ".claude-plugin/plugin.json":
            '{\n  "version": "0.3.0",\n  "x": { "version": "0.3.0" }\n}\n',
        }),
    ],
  ];
  for (const [i, [reason, breakIt]] of cases.entries()) {
    it(`refuses ${reason} (case ${i + 1}) and writes nothing`, () => {
      const repo = releaseRepo();
      const sha = commit(repo, "feature");
      breakIt(repo);
      expect(git(repo, "status", "--porcelain")).toBe("");
      const r = release([
        "prepare",
        "--repo",
        repo,
        "--prs",
        prsFile([pr(5, "Add", "feat/x", sha)]),
      ]);
      expect(r.status).toBe(3);
      expect(r.out.refused).toBe(reason);
      expect(git(repo, "status", "--porcelain")).toBe("");
    });
  }
  it("names the disagreeing versions, the existing section and the file without the version", () => {
    const repo = releaseRepo();
    const sha = commit(repo, "feature");
    commit(repo, "x", { ".hitl/manifest.json": '{\n  "version": "0.2.0"\n}\n' });
    const prs = prsFile([pr(5, "Add", "feat/x", sha)]);
    expect(release(["prepare", "--repo", repo, "--prs", prs]).out).toEqual({
      refused: "versions-disagree",
      versions: { plugin: "0.3.0", marketplace: "0.3.0", manifest: "0.2.0" },
    });
    commit(repo, "y", { ".hitl/manifest.json": '{"version":"0.3.0"}\n' });
    expect(release(["prepare", "--repo", repo, "--prs", prs]).out).toEqual({
      refused: "version-not-found",
      file: ".hitl/manifest.json",
    });
    commit(repo, "z", {
      ".hitl/manifest.json": '{\n  "version": "0.3.0"\n}\n',
      "CHANGELOG.md": "# Changelog\n\n## Unreleased\n\n## 0.4.0\n\n- early\n",
    });
    expect(release(["prepare", "--repo", repo, "--prs", prs]).out).toEqual({
      refused: "section-exists",
      version: "0.4.0",
    });
  });
  it("refuses while the current version has no tag", () => {
    const repo = releaseRepo({ tag: false });
    const r = release([
      "prepare",
      "--repo",
      repo,
      "--prs",
      prsFile([pr(5, "Add", "feat/x", commit(repo, "x"))]),
    ]);
    expect(r.status).toBe(3);
    expect(r.out).toEqual({ refused: "tag-missing", tag: "v0.3.0" });
    expect(git(repo, "status", "--porcelain")).toBe("");
  });
  it("refuses an untagged current version even when nothing would be released", () => {
    const repo = releaseRepo({ tag: false });
    expect(release(["prepare", "--repo", repo, "--prs", prsFile([])]).out).toEqual({
      refused: "tag-missing",
      tag: "v0.3.0",
    });
  });
  it("exits 2 when the pull request file is missing or not JSON", () => {
    const repo = releaseRepo();
    const missing = release(["prepare", "--repo", repo, "--prs", "/nonexistent.json"]);
    expect(missing.status).toBe(2);
    expect(typeof missing.out.error).toBe("string");
    const bad = join(mkdtempSync(join(tmpdir(), "hitl-prs-")), "prs.json");
    writeFileSync(bad, "not json");
    const notJson = release(["prepare", "--repo", repo, "--prs", bad]);
    expect(notJson.status).toBe(2);
    expect(typeof notJson.out.error).toBe("string");
    expect(git(repo, "status", "--porcelain")).toBe("");
  });
});

describe("release.mjs prepare — this repository's own files", () => {
  it("on a copy of this repository's own four files, keeps what the changelog and manifest tests assert", async () => {
    const repo = mkdtempSync(join(tmpdir(), "hitl-self-"));
    for (const f of [
      "CHANGELOG.md",
      ".claude-plugin/plugin.json",
      ".claude-plugin/marketplace.json",
      ".hitl/manifest.json",
    ]) {
      cpSync(join(process.cwd(), f), join(repo, f));
    }
    initRepo(repo);
    commit(repo, "the four files", {});
    git(repo, "tag", `v${pluginVersion(process.cwd())}`);
    const sha = commit(repo, "feature");
    const before = pluginVersion(repo);
    const r = release([
      "prepare",
      "--repo",
      repo,
      "--prs",
      prsFile([pr(1, "A feature", "feat/x", sha)]),
    ]);
    expect(r.out.released).toBe(true);
    const sections = changelogSections(read(repo, "CHANGELOG.md"));
    expect(sections[0]).toEqual({ version: "Unreleased", text: "" });
    const versions = sections.slice(1).map((s) => s.version);
    for (let i = 1; i < versions.length; i++)
      expect(compareVersions(versions[i - 1], versions[i])).toBe(1);
    expect(versions[0]).toBe(r.out.version);
    expect(compareVersions(r.out.version, before)).toBe(1);
    expect(pluginVersion(repo)).toBe(r.out.version);
    expect(JSON.parse(read(repo, ".claude-plugin/marketplace.json")).plugins[0].version).toBe(
      r.out.version,
    );
    expect(JSON.parse(read(repo, ".hitl/manifest.json")).version).toBe(r.out.version);
    // every section released before keeps its exact text
    const old = changelogSections(readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8")).slice(
      1,
    );
    for (const s of old) expect(sections.find((x) => x.version === s.version)?.text).toBe(s.text);
    for (const f of [
      ".claude-plugin/plugin.json",
      ".claude-plugin/marketplace.json",
      ".hitl/manifest.json",
    ]) {
      const options = await prettier.resolveConfig(join(process.cwd(), f));
      expect(await prettier.check(read(repo, f), { ...options, filepath: f }), f).toBe(true);
    }
  });
});

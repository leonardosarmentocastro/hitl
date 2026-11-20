// scripts/__tests__/release-prepare.test.ts — `scripts/release.mjs prepare`, against temporary
// git repositories.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextVersion } from "../release.mjs";
import { type Pr, commit, git, prsFile, release, releaseRepo } from "./helpers/release-repo";

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

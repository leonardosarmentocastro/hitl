// scripts/__tests__/release-prepare.test.ts — `scripts/release.mjs prepare`, against temporary
// git repositories.
import { describe, expect, it } from "vitest";
import { type Pr, commit, git, prsFile, release, releaseRepo } from "./helpers/release-repo";

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

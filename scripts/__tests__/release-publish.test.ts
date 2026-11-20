// scripts/__tests__/release-publish.test.ts — `scripts/release.mjs target` and `notes`, against
// temporary git repositories.
import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { commit, git, release, releaseRepo } from "./helpers/release-repo";

const plugin = (v: string) => ({
  ".claude-plugin/plugin.json": `{\n  "name": "hitl",\n  "version": "${v}"\n}\n`,
});

describe("release.mjs target", () => {
  it("prints the commit that set the version, not a later one", () => {
    const repo = releaseRepo();
    commit(repo, "unrelated");
    const set = commit(repo, "chore(release): 0.4.0", plugin("0.4.0"));
    commit(repo, "later", { "README.md": "x\n" });
    commit(repo, "edits plugin.json without changing the version", {
      ".claude-plugin/plugin.json":
        '{\n  "name": "hitl",\n  "description": "d",\n  "version": "0.4.0"\n}\n',
    });
    expect(release(["target", "--repo", repo, "--version", "0.4.0"])).toEqual({
      status: 0,
      out: { version: "0.4.0", commit: set },
    });
  });
  it("prints the merge commit when the version arrived through a merged branch", () => {
    const repo = releaseRepo();
    git(repo, "checkout", "-q", "-b", "chore/release");
    commit(repo, "raise", plugin("1.0.0"));
    git(repo, "checkout", "-q", "main");
    git(repo, "merge", "-q", "--no-ff", "-m", "Merge chore/release", "chore/release");
    const merge = git(repo, "rev-parse", "HEAD");
    expect(release(["target", "--repo", repo, "--version", "1.0.0"]).out.commit).toBe(merge);
  });
  it("prints the oldest commit when a version was set twice", () => {
    const repo = releaseRepo();
    const first = commit(repo, "set", plugin("0.4.0"));
    commit(repo, "revert", plugin("0.3.0"));
    commit(repo, "set again", plugin("0.4.0"));
    expect(release(["target", "--repo", repo, "--version", "0.4.0"]).out.commit).toBe(first);
  });
  it("skips commits where plugin.json is missing or not JSON", () => {
    const repo = releaseRepo();
    commit(repo, "broken", { ".claude-plugin/plugin.json": "not json" });
    const set = commit(repo, "set", plugin("0.4.0"));
    expect(release(["target", "--repo", repo, "--version", "0.4.0"]).out.commit).toBe(set);
  });
  it("refuses a version no commit on main holds", () => {
    const repo = releaseRepo();
    expect(release(["target", "--repo", repo, "--version", "9.9.9"])).toEqual({
      status: 3,
      out: { refused: "version-not-on-main", version: "9.9.9" },
    });
  });
});

describe("release.mjs notes", () => {
  const changelog =
    "# Changelog\n\n## Unreleased\n\n- later\n\n## 0.4.0\n\n- by hand\n\n- Add (#5)\n\n## 0.3.5\n\n## 0.3.0\n\n- three\n";
  it("prints the section body of the version", () => {
    const repo = releaseRepo({ changelog });
    expect(release(["notes", "--repo", repo, "--version", "0.4.0"])).toEqual({
      status: 0,
      out: { version: "0.4.0", notes: "- by hand\n\n- Add (#5)" },
    });
  });
  it("refuses a version with no section, an empty section, or no changelog", () => {
    const repo = releaseRepo({ changelog });
    for (const v of ["0.5.0", "0.3.5", "Unreleased"]) {
      const r = release(["notes", "--repo", repo, "--version", v]);
      expect(r.status, v).toBe(3);
      expect(r.out.refused, v).toBe("no-notes");
    }
    rmSync(join(repo, "CHANGELOG.md"));
    expect(release(["notes", "--repo", repo, "--version", "0.4.0"]).status).toBe(3);
  });
});

// scripts/__tests__/helpers/release-repo.ts — temporary git repositories holding the four files
// scripts/release.mjs reads, and a runner for the script itself.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const RELEASE = join(ROOT, "scripts/release.mjs");

export type Pr = {
  number: number;
  title: string;
  headRefName: string;
  mergeCommit: { oid: string } | null;
};

/** Runs `git -C <repo> …`; returns stdout trimmed, throws on a non-zero exit. */
export function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function write(repo: string, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), text);
  }
}

/** Writes the files (or nothing, for an empty commit), commits them and returns the full sha. */
export function commit(repo: string, message: string, files?: Record<string, string>): string {
  if (files) {
    write(repo, files);
    git(repo, "add", "-A");
  }
  git(repo, "commit", "-q", "--allow-empty", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

/** The four release files at version `v`. */
function releaseFiles(v: string, changelog: string): Record<string, string> {
  return {
    "CHANGELOG.md": changelog,
    ".claude-plugin/plugin.json": `{\n  "name": "hitl",\n  "version": "${v}"\n}\n`,
    ".claude-plugin/marketplace.json": `{\n  "name": "hitl",\n  "plugins": [{ "name": "hitl", "version": "${v}", "source": "./" }]\n}\n`,
    ".hitl/manifest.json": `{\n  "version": "${v}",\n  "provider": "github",\n  "testing": [],\n  "files": {}\n}\n`,
  };
}

/** A temporary repository on `main` with the four files committed and, unless `tag: false`, tagged. */
export function releaseRepo(
  opts: { version?: string; changelog?: string; tag?: boolean } = {},
): string {
  const version = opts.version ?? "0.3.0";
  const changelog =
    opts.changelog ?? "# Changelog\n\nintro\n\n## Unreleased\n\n## 0.3.0\n\n- three\n";
  const repo = mkdtempSync(join(tmpdir(), "hitl-release-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "tag.gpgsign", "false");
  commit(repo, version, releaseFiles(version, changelog));
  if (opts.tag !== false) git(repo, "tag", `v${version}`);
  return repo;
}

/** Writes the pull request list to a temporary file and returns its path. */
export function prsFile(prs: Pr[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "hitl-prs-")), "prs.json");
  writeFileSync(path, JSON.stringify(prs));
  return path;
}

/** Runs `node scripts/release.mjs …` and parses its stdout as JSON. */
export function release(args: string[]): { status: number; out: any } {
  const r = spawnSync(process.execPath, [RELEASE, ...args], { encoding: "utf8" });
  let out: any;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = { stdout: r.stdout, stderr: r.stderr };
  }
  return { status: r.status ?? -1, out };
}

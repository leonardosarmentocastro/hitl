#!/usr/bin/env node
// This repository's release chores (never rendered into a target repository). `prepare` decides
// from the pull requests merged into main whether a release is due and, if so, writes the four
// release files. Exit: 0 ok · 1 usage · 2 error · 3 refused. A refusal writes nothing.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { emit, parseArgs, pluginVersion } from "../installer/lib.mjs";

const USAGE = "usage: release.mjs prepare --repo <path> --prs <file>";

/** True when `oid` is an ancestor of `ref`; an unknown commit is never one. */
function isAncestor(repo, oid, ref) {
  const r = spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", oid, ref]);
  return r.status === 0;
}

/** The text of a branch name before the first `/`, or null when it has none. */
function prefixOf(headRefName) {
  const i = headRefName.indexOf("/");
  return i === -1 ? null : headRefName.slice(0, i);
}

/** The pull requests merged into HEAD's history and not yet in the tag v<version>. */
export function unreleasedPrs(repo, prs, version) {
  return prs.filter((pr) => {
    const oid = pr.mergeCommit?.oid;
    return oid && isAncestor(repo, oid, "HEAD") && !isAncestor(repo, oid, `v${version}`);
  });
}

const VERSION_FILES = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".hitl/manifest.json",
];

/** Any `feat` → the next minor; otherwise any `fix` → the next patch; otherwise null. */
export function nextVersion(current, prefixes) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (prefixes.includes("feat")) return { version: `${major}.${minor + 1}.0`, bump: "minor" };
  if (prefixes.includes("fix")) return { version: `${major}.${minor}.${patch + 1}`, bump: "patch" };
  return null;
}

/**
 * The changelog with a `## <version>` section between `## Unreleased` and the newest released
 * section: the old Unreleased text, then one line per pull request. Unreleased is left empty.
 */
function withSection(text, version, prs) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## "));
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end === -1) end = lines.length;
  const head = lines.slice(0, start + 1).join("\n");
  const carried = lines
    .slice(start + 1, end)
    .join("\n")
    .trim();
  const rest = lines.slice(end).join("\n").trimEnd();
  const bullets = prs.map((pr) => `- ${pr.title.trim()} (#${pr.number})`).join("\n");
  const body = carried ? `${carried}\n\n${bullets}` : bullets;
  return `${head}\n\n## ${version}\n\n${body}\n${rest ? `\n${rest}\n` : ""}`;
}

function prepare({ repo, prs: prsPath }) {
  const version = pluginVersion(repo);
  const prs = JSON.parse(readFileSync(prsPath, "utf8"));
  const listed = unreleasedPrs(repo, prs, version).filter((pr) =>
    ["feat", "fix"].includes(prefixOf(pr.headRefName)),
  );
  const next = nextVersion(
    version,
    listed.map((pr) => prefixOf(pr.headRefName)),
  );
  if (!next) return { code: 0, out: { released: false } };
  listed.sort((a, b) => a.number - b.number);

  const changelog = join(repo, "CHANGELOG.md");
  writeFileSync(changelog, withSection(readFileSync(changelog, "utf8"), next.version, listed));
  for (const f of VERSION_FILES) {
    const path = join(repo, f);
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.replace(`"version": "${version}"`, `"version": "${next.version}"`));
  }
  return { code: 0, out: { released: true, ...next, prs: listed.map((pr) => pr.number) } };
}

const COMMANDS = { prepare: { required: ["repo", "prs"], fn: prepare } };

export function run(command, args) {
  const spec = COMMANDS[command];
  if (!spec || !args || spec.required.some((k) => typeof args[k] !== "string")) {
    return { code: 1, out: { error: USAGE } };
  }
  return spec.fn(args);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  emit(run(command, parseArgs(rest)));
}

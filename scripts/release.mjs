#!/usr/bin/env node
// This repository's release chores (never rendered into a target repository). `prepare` decides
// from the pull requests merged into main whether a release is due and, if so, writes the four
// release files. Exit: 0 ok · 1 usage · 2 error · 3 refused. A refusal writes nothing.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

function prepare({ repo, prs: prsPath }) {
  const version = pluginVersion(repo);
  const prs = JSON.parse(readFileSync(prsPath, "utf8"));
  const listed = unreleasedPrs(repo, prs, version).filter((pr) =>
    ["feat", "fix"].includes(prefixOf(pr.headRefName)),
  );
  if (listed.length === 0) return { code: 0, out: { released: false } };
  return { code: 0, out: { released: false } }; // the release path arrives with nextVersion
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

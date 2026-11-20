#!/usr/bin/env node
// This repository's release chores (never rendered into a target repository). `prepare` decides
// from the pull requests merged into main whether a release is due and, if so, writes the four
// release files. Exit: 0 ok · 1 usage · 2 error · 3 refused. A refusal writes nothing.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { changelogSections, emit, parseArgs } from "../installer/lib.mjs";

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

function tagExists(repo, tag) {
  return (
    spawnSync("git", ["-C", repo, "rev-parse", "--verify", "--quiet", `refs/tags/${tag}`])
      .status === 0
  );
}

function readJson(repo, file) {
  return JSON.parse(readFileSync(join(repo, file), "utf8"));
}

const refuse = (out) => ({ code: 3, out });

function prepare({ repo, prs: prsPath }) {
  const versions = {
    plugin: readJson(repo, ".claude-plugin/plugin.json").version,
    marketplace: readJson(repo, ".claude-plugin/marketplace.json").plugins?.[0]?.version,
    manifest: readJson(repo, ".hitl/manifest.json").version,
  };
  const version = versions.plugin;
  if (versions.marketplace !== version || versions.manifest !== version) {
    return refuse({ refused: "versions-disagree", versions });
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) return refuse({ refused: "bad-version", version });
  if (!tagExists(repo, `v${version}`))
    return refuse({ refused: "tag-missing", tag: `v${version}` });
  const changelogPath = join(repo, "CHANGELOG.md");
  const changelog = readFileSync(changelogPath, "utf8");
  const sections = changelogSections(changelog);
  if (sections[0]?.version !== "Unreleased") return refuse({ refused: "no-unreleased-section" });

  let prs;
  try {
    prs = JSON.parse(readFileSync(prsPath, "utf8"));
  } catch (e) {
    return { code: 2, out: { error: `cannot read the pull request list: ${e.message}` } };
  }
  const listed = unreleasedPrs(repo, prs, version).filter((pr) =>
    ["feat", "fix"].includes(prefixOf(pr.headRefName)),
  );
  const next = nextVersion(
    version,
    listed.map((pr) => prefixOf(pr.headRefName)),
  );
  if (!next) return { code: 0, out: { released: false } };
  listed.sort((a, b) => a.number - b.number);

  if (sections.some((sec) => sec.version === next.version)) {
    return refuse({ refused: "section-exists", version: next.version });
  }
  const current = `"version": "${version}"`;
  const texts = {};
  for (const f of VERSION_FILES) {
    texts[f] = readFileSync(join(repo, f), "utf8");
    if (texts[f].split(current).length !== 2)
      return refuse({ refused: "version-not-found", file: f });
  }

  writeFileSync(changelogPath, withSection(changelog, next.version, listed));
  for (const f of VERSION_FILES) {
    writeFileSync(join(repo, f), texts[f].replace(current, `"version": "${next.version}"`));
  }
  return { code: 0, out: { released: true, ...next, prs: listed.map((pr) => pr.number) } };
}

const COMMANDS = { prepare: { required: ["repo", "prs"], fn: prepare } };

export function run(command, args) {
  const spec = COMMANDS[command];
  if (!spec || !args || spec.required.some((k) => typeof args[k] !== "string")) {
    return { code: 1, out: { error: USAGE } };
  }
  try {
    return spec.fn(args);
  } catch (e) {
    return { code: 2, out: { error: String(e.message) } };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...rest] = process.argv.slice(2);
  emit(run(command, parseArgs(rest)));
}

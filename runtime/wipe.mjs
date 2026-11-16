#!/usr/bin/env node
// The feature's documents in no-install mode: the files under docs/superpowers/ that exist at a
// tip and not at its merge-base with the record's base. `archive` copies them to
// `<memoryDir>/features/<created>-<topic>/`; `build` also rebuilds `<feature branch>-wipe` as
// exactly one commit over its parent that deletes them, force-pushes that branch (the only one
// it ever pushes) and creates or retargets its draft PR through the PR shim. The commit is made
// with a temporary index: the working tree and the checked-out branch are never touched.
// CLI: archive | build. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emit, parseArgs } from "../installer/lib.mjs";
import { memoryDir } from "./memory.mjs";
import { getRecord } from "./session.mjs";
import { buildWipe, featureDocs } from "./wipe-core.mjs";

export { featureDocs, wipeCommit, WIPE_BODY, WIPE_MESSAGE } from "./wipe-core.mjs";

const DOCS = "docs/superpowers/";

/**
 * Make `dest` hold exactly `files` as they are at `tip`, relative to docs/superpowers/. The copy
 * is written to a sibling temp folder and renamed into place, so a failure leaves `dest` as it was.
 */
export function archiveDocs(repo, tip, files, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const staging = mkdtempSync(`${dest}.tmp-`);
  try {
    for (const f of files) {
      const content = execFileSync("git", ["show", `${tip}:${f}`], {
        cwd: repo,
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      });
      const out = join(staging, f.startsWith(DOCS) ? f.slice(DOCS.length) : f);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, content);
    }
    rmSync(dest, { recursive: true, force: true });
    renameSync(staging, dest);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}

function archiveFolder(repo, record) {
  return join(memoryDir(repo), "features", `${record.created}-${record.topic}`);
}

function archive(args) {
  const record = getRecord(args.repo);
  if (!record) return { code: 3, out: { refused: "no-record" } };
  const files = featureDocs(args.repo, "HEAD", record.base);
  if (files.length === 0) return { code: 0, out: { status: "nothing-to-archive" } };
  const dest = archiveFolder(args.repo, record);
  archiveDocs(args.repo, "HEAD", files, dest);
  return { code: 0, out: { status: "archived", archive: dest, files } };
}

function build(args) {
  const { repo } = args;
  const record = getRecord(repo);
  if (!record) return { code: 3, out: { refused: "no-record" } };
  const dest = archiveFolder(repo, record);
  return buildWipe({
    repo,
    featureBranch: args["feature-branch"],
    parent: args.parent,
    base: record.base,
    shim: args.shim,
    noPush: args["no-push"] === true,
    beforePush: (parentTip, files) => {
      archiveDocs(repo, parentTip, files, dest);
      return { archive: dest };
    },
  });
}

const USAGE =
  "usage: archive --repo <worktree> | build --repo <worktree> --feature-branch <b> --parent <branch> --shim <path> [--no-push]";

export function run(verb, args) {
  const usage = { code: 1, out: { error: USAGE } };
  if (!args?.repo || !["archive", "build"].includes(verb)) return usage;
  if (verb === "build" && (!args["feature-branch"] || !args.parent || !args.shim)) return usage;
  try {
    return verb === "archive" ? archive(args) : build(args);
  } catch (e) {
    return { code: 2, out: { error: String(e?.message ?? e) } };
  }
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1].
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) emit(run(process.argv[2], parseArgs(process.argv.slice(3), ["no-push"])));

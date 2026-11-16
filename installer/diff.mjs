#!/usr/bin/env node
// /hitl:diff's engine. For every owned file it holds three versions — the render at the
// recorded version, the repository's file, the render at the plugin's version — and reports
// exactly one state per file. Read-only unless --apply; even then it writes only files under
// the repository. The only git it runs is rev-parse, archive and merge-file: branch, commit,
// push and the PR belong to the command. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { emit, parseArgs } from "./lib.mjs";
import {
  BLOCK_END,
  BLOCK_START,
  MANIFEST_PATH,
  MOVES,
  OLD_MANIFEST_PATH,
  compareVersions,
  gitignoreBlock,
  manifestFor,
  pluginVersion,
  readManifestOf,
  renderAll,
  replaceMarkerBlock,
  sha256,
} from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> --marketplace <dir> [--apply]";

/**
 * The render at the recorded version. Same version as the plugin → the plugin root, no tag
 * consulted. Older → a read-only `git archive` snapshot of templates/ and installer/ at tag
 * v<recorded>, rendered by that version's own lib.mjs so composition rules match the day
 * the files were written. Returns null when the tag is missing.
 */
export async function recordedRender(manifest, pluginRoot, marketplace, choices) {
  if (manifest.version === pluginVersion(pluginRoot)) return renderAll(pluginRoot, choices);
  const tag = `v${manifest.version}`;
  const probe = spawnSync(
    "git",
    ["-C", marketplace, "rev-parse", "-q", "--verify", `refs/tags/${tag}`],
    {
      encoding: "utf8",
    },
  );
  if (probe.status !== 0) return null;
  const snapshot = mkdtempSync(join(tmpdir(), "hitl-recorded-"));
  try {
    const tar = execFileSync("git", [
      "-C",
      marketplace,
      "archive",
      "--format=tar",
      tag,
      "templates",
      "installer",
      ".claude-plugin",
    ]);
    execFileSync("tar", ["-x", "-C", snapshot], { input: tar });
    const lib = await import(pathToFileURL(join(snapshot, "installer/lib.mjs")).href);
    // renderAll reads every template into memory, so the snapshot can go once it returns.
    return lib.renderAll(snapshot, choices);
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

/** Three-way merge of the repository's text against the recorded and latest renders. */
function mergeThree(repoText, recordedText, latestText) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-merge-"));
  const [ours, base, theirs] = ["repo", "recorded", "latest"].map((n) => join(dir, n));
  writeFileSync(ours, repoText);
  writeFileSync(base, recordedText);
  writeFileSync(theirs, latestText);
  const r = spawnSync(
    "git",
    [
      "merge-file",
      "-p",
      "-L",
      "this repository",
      "-L",
      "hitl recorded",
      "-L",
      "hitl latest",
      ours,
      base,
      theirs,
    ],
    { encoding: "utf8" },
  );
  rmSync(dir, { recursive: true, force: true });
  if (r.status === null || r.status < 0 || r.status > 127)
    throw new Error(`git merge-file failed: ${r.stderr}`);
  return { text: r.stdout, merged: r.status === 0 ? "clean" : "conflict" };
}

/** Raised by classify when the recorded render lacks the text a three-way merge needs. */
class RecordedTextMissing extends Error {}

/**
 * One owned file's state from its three versions, and the outcome: the text that should sit at
 * its path after an apply (the latest render, the repository's text, or the three-way merge).
 * Throws RecordedTextMissing, or the merge's own error.
 */
function classify(repoText, recHash, recText, latest) {
  if (repoText === null) return { state: "missing locally", content: latest.content };
  const r = sha256(repoText);
  const lat = sha256(latest.content);
  if (r === recHash && recHash === lat) return { state: "unchanged", content: latest.content };
  if (r === recHash) return { state: "upstream changed", content: latest.content };
  if (recHash === lat) return { state: "locally edited", content: repoText };
  if (r === lat) return { state: "already applied", content: repoText };
  if (recText === undefined) throw new RecordedTextMissing();
  const m = mergeThree(repoText, recText, latest.content);
  return { state: "both", merged: m.merged, content: m.text };
}

export async function run(args) {
  const { repo, "plugin-root": pluginRoot, marketplace, apply } = args;
  if (!repo || !pluginRoot || !marketplace) return { code: 1, out: { error: USAGE } };

  const found = readManifestOf(repo);
  if (!found) return { code: 3, out: { refused: "no-manifest" } };
  const { manifest, path: manifestPath, layout } = found;
  const choices = { provider: manifest.provider, testing: manifest.testing, gates: [] };
  // A manifest written before the CI wipe job was removed records `ci`: the recorded version's
  // renderer still needs it to own what it wrote. The latest render and the new manifest never do.
  const recordedChoices = "ci" in manifest ? { ...choices, ci: manifest.ci } : choices;
  const latestVersion = pluginVersion(pluginRoot);
  // A manifest newer than the plugin is a stale plugin cache; never propose a downgrade.
  if (compareVersions(manifest.version, latestVersion) > 0) {
    return {
      code: 3,
      out: { refused: "ahead", recorded: manifest.version, plugin: latestVersion, manifestPath },
    };
  }
  const latest = renderAll(pluginRoot, choices);
  const recorded = await recordedRender(manifest, pluginRoot, marketplace, recordedChoices);
  if (recorded === null)
    return { code: 3, out: { refused: "tag-missing", tag: `v${manifest.version}`, manifestPath } };

  // Trust the recorded render only if it hashes to what the manifest recorded.
  const mismatch = [...recorded.keys()]
    .filter((p) => p in manifest.files && sha256(recorded.get(p).content) !== manifest.files[p])
    .sort();
  if (mismatch.length > 0)
    return { code: 3, out: { refused: "manifest-mismatch", paths: mismatch, manifestPath } };

  // A removal deletes a manifest path, so every path must be one the recorded version owned
  // (which also keeps it relative and inside the repository): a hand-edited key never is.
  const unowned = Object.keys(manifest.files)
    .filter((p) => isAbsolute(p) || p.split(/[\\/]/).includes("..") || !recorded.has(p))
    .sort();
  if (unowned.length > 0)
    return { code: 3, out: { refused: "unowned-path", paths: unowned, manifestPath } };

  const readRepo = (p) => (existsSync(join(repo, p)) ? readFileSync(join(repo, p), "utf8") : null);
  const mergeFailed = (e) => ({
    code: 2,
    out: { error: String(e.message), written: [], deleted: [], manifest: "untouched" },
  });

  const files = [];
  const writes = []; // { path, content, executable, removeFrom?, resume? } or { path, delete: true }

  // A recorded `from` whose `to` the latest render owns is the repository's copy of `to`: one
  // entry at `to`, classified against the record of `from`, always written (the move is a change).
  const moves = MOVES.filter(
    (m) => m.from in manifest.files && latest.has(m.to) && !latest.has(m.from),
  );
  for (const { from, to } of moves) {
    const fromText = readRepo(from);
    const toText = readRepo(to);
    const lat = latest.get(to);
    let c;
    try {
      // Only `to` on disk and it still carries conflict hunks from an earlier apply: its outcome
      // is its own text, never a second merge on top of the first.
      if (fromText === null && toText !== null && /^<<<<<<< this repository/m.test(toText))
        c = { state: "both", merged: "conflict", content: toText };
      else c = classify(fromText ?? toText, manifest.files[from], recorded.get(from)?.content, lat);
    } catch (e) {
      if (e instanceof RecordedTextMissing)
        return { code: 3, out: { refused: "manifest-mismatch", paths: [from], manifestPath } };
      return mergeFailed(e);
    }
    // Both on disk: resume only when `to` already holds what this move would write there.
    const resume = fromText !== null && toText !== null;
    if (resume && toText !== c.content)
      return { code: 3, out: { refused: "move-collision", paths: [from, to], manifestPath } };
    const entry = { path: to, movedFrom: from, state: c.state };
    if (c.merged) entry.merged = c.merged;
    files.push(entry);
    const w = { path: to, content: c.content, executable: lat.executable };
    if (fromText !== null) w.removeFrom = from;
    if (resume) w.resume = true;
    writes.push(w);
  }
  const movedPaths = new Set(moves.flatMap((m) => [m.from, m.to]));

  const paths = [...new Set([...Object.keys(manifest.files), ...latest.keys()])]
    .filter((p) => !movedPaths.has(p))
    .sort();
  for (const path of paths) {
    const inRecorded = path in manifest.files;
    const inLatest = latest.has(path);
    const repoText = readRepo(path);
    const entry = { path };
    if (!inRecorded) {
      entry.state = "new upstream";
      writes.push({ path, ...latest.get(path) });
    } else if (!inLatest) {
      entry.state = "removed upstream";
      if (repoText === null) entry.local = "absent";
      else if (sha256(repoText) === manifest.files[path]) {
        entry.local = "same";
        writes.push({ path, delete: true });
      } else entry.local = "edited";
    } else {
      let c;
      try {
        c = classify(repoText, manifest.files[path], recorded.get(path)?.content, latest.get(path));
      } catch (e) {
        if (e instanceof RecordedTextMissing)
          return { code: 3, out: { refused: "manifest-mismatch", paths: [path], manifestPath } };
        return mergeFailed(e);
      }
      entry.state = c.state;
      if (c.merged) entry.merged = c.merged;
      if (["missing locally", "upstream changed", "both"].includes(c.state))
        writes.push({ path, content: c.content, executable: latest.get(path).executable });
    }
    files.push(entry);
  }

  // Files hitl no longer ships that the repository edited: kept, and named so the human deletes them.
  const keptRemoved = files
    .filter((f) => f.state === "removed upstream" && f.local === "edited")
    .map((f) => f.path)
    .sort();
  // An apply that stopped between writing the new manifest and removing the old one.
  const leftovers =
    layout === "current" && existsSync(join(repo, OLD_MANIFEST_PATH)) ? [OLD_MANIFEST_PATH] : [];
  const report = {
    recorded: manifest.version,
    latest: latestVersion,
    manifestPath,
    files,
    keptRemoved,
    leftovers,
  };
  if (!apply) return { code: 0, out: report };
  if (
    writes.length === 0 &&
    manifest.version === latestVersion &&
    layout === "current" &&
    leftovers.length === 0
  )
    return { code: 0, out: { nothing: true, ...report } };

  // Not transactional: on a failure, say exactly what already landed so the human can undo it.
  const written = [];
  const deleted = [];
  let manifestWritten = false;
  let readmeBumped = false;
  let gitignoreRefreshed = false;
  try {
    for (const w of writes) {
      const abs = join(repo, w.path);
      if (w.delete) {
        unlinkSync(abs);
        deleted.push(w.path);
        continue;
      }
      // A resumed move already holds its outcome at `to`: only `from` is left to remove.
      if (!w.resume) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, w.content);
        if (w.executable) chmodSync(abs, 0o755);
        written.push(w.path);
      }
      // A move writes `to` and removes `from` back to back, so a stop leaves at most one pair.
      if (w.removeFrom) {
        unlinkSync(join(repo, w.removeFrom));
        deleted.push(w.removeFrom);
      }
    }

    const readmePath = join(repo, "README.md");
    if (existsSync(readmePath)) {
      const readme = readFileSync(readmePath, "utf8");
      const start = readme.indexOf(BLOCK_START);
      const end = readme.indexOf(BLOCK_END);
      if (start !== -1 && end > start) {
        const block = readme
          .slice(start, end)
          .replace(`Installed by hitl ${manifest.version}`, `Installed by hitl ${latestVersion}`);
        writeFileSync(readmePath, readme.slice(0, start) + block + readme.slice(end));
        readmeBumped = true;
      }
    }

    const ignorePath = join(repo, ".gitignore");
    if (existsSync(ignorePath)) {
      const r = replaceMarkerBlock(readFileSync(ignorePath, "utf8"), gitignoreBlock());
      if (r.changed) {
        writeFileSync(ignorePath, r.text);
        gitignoreRefreshed = true;
      }
    }

    // The manifest describes the templates, never the repository's edits: a locally edited or
    // conflicted file is recorded at the latest render's hash, which is what lets the next diff
    // still classify it as locally edited rather than as unchanged. It is relocated last, so an
    // apply that stops anywhere before it leaves an old-layout repository whose re-run resumes.
    const next = manifestFor(latestVersion, choices, latest);
    mkdirSync(dirname(join(repo, MANIFEST_PATH)), { recursive: true });
    writeFileSync(join(repo, MANIFEST_PATH), `${JSON.stringify(next, null, 2)}\n`);
    manifestWritten = true;
    if (existsSync(join(repo, OLD_MANIFEST_PATH))) {
      unlinkSync(join(repo, OLD_MANIFEST_PATH));
      deleted.push(OLD_MANIFEST_PATH);
    }
  } catch (e) {
    const manifestState = manifestWritten ? "written" : "untouched";
    return {
      code: 2,
      out: { error: String(e.message), written, deleted, manifest: manifestState },
    };
  }

  return {
    code: 0,
    out: { ...report, applied: true, written, deleted, readmeBumped, gitignoreRefreshed },
  };
}

const args = parseArgs(process.argv.slice(2), ["apply"]);
emit(args ? await run(args) : { code: 1, out: { error: USAGE } });

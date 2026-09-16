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
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { emit, parseArgs } from "./lib.mjs";
import {
  BLOCK_END,
  BLOCK_START,
  MANIFEST_PATH,
  compareVersions,
  manifestFor,
  pluginVersion,
  readManifest,
  renderAll,
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
  return lib.renderAll(snapshot, choices);
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

export async function run(args) {
  const { repo, "plugin-root": pluginRoot, marketplace, apply } = args;
  if (!repo || !pluginRoot || !marketplace) return { code: 1, out: { error: USAGE } };

  const manifest = readManifest(repo);
  if (!manifest) return { code: 3, out: { refused: "no-manifest" } };
  const choices = {
    provider: manifest.provider,
    ci: manifest.ci,
    testing: manifest.testing,
    gates: [],
  };
  const latestVersion = pluginVersion(pluginRoot);
  // A manifest newer than the plugin is a stale plugin cache; never propose a downgrade.
  if (compareVersions(manifest.version, latestVersion) > 0) {
    return {
      code: 3,
      out: { refused: "ahead", recorded: manifest.version, plugin: latestVersion },
    };
  }
  const latest = renderAll(pluginRoot, choices);
  const recorded = await recordedRender(manifest, pluginRoot, marketplace, choices);
  if (recorded === null)
    return { code: 3, out: { refused: "tag-missing", tag: `v${manifest.version}` } };

  // Trust the recorded render only if it hashes to what the manifest recorded.
  const mismatch = [...recorded.keys()]
    .filter((p) => p in manifest.files && sha256(recorded.get(p).content) !== manifest.files[p])
    .sort();
  if (mismatch.length > 0)
    return { code: 3, out: { refused: "manifest-mismatch", paths: mismatch } };

  const files = [];
  const writes = []; // { path, content, executable } or { path, delete: true }
  const paths = [...latest.keys()].filter((p) => p in manifest.files).sort();
  for (const path of paths) {
    const abs = join(repo, path);
    const repoText = existsSync(abs) ? readFileSync(abs, "utf8") : null;
    const entry = { path };
    const r = repoText === null ? null : sha256(repoText);
    const rec = manifest.files[path];
    const lat = sha256(latest.get(path).content);
    if (r === rec && rec === lat) entry.state = "unchanged";
    else if (r === rec) {
      entry.state = "upstream changed";
      writes.push({ path, ...latest.get(path) });
    } else if (rec === lat) entry.state = "locally edited";
    else if (r === lat) entry.state = "already applied";
    else {
      const recordedText = recorded.get(path)?.content;
      if (recordedText === undefined)
        return { code: 3, out: { refused: "manifest-mismatch", paths: [path] } };
      const m = mergeThree(repoText, recordedText, latest.get(path).content);
      entry.state = "both";
      entry.merged = m.merged;
      writes.push({ path, content: m.text, executable: latest.get(path).executable });
    }
    files.push(entry);
  }

  const report = { recorded: manifest.version, latest: latestVersion, files };
  if (!apply) return { code: 0, out: report };
  return { code: 2, out: { error: "--apply arrives in Task 4" } };
}

const args = parseArgs(process.argv.slice(2), ["apply"]);
emit(args ? await run(args) : { code: 1, out: { error: USAGE } });

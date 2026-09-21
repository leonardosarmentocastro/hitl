#!/usr/bin/env node
// /hitl:help's reader. Says where an install stands — one of six states that partition every
// tree — plus how many owned files differ from the manifest or are missing and which prerequisites are
// present. Reads only. Exit: 0 ok · 1 usage.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { emit, parseArgs } from "./lib.mjs";
import { collisions, compareVersions, pluginVersion, readManifest, sha256 } from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> [--home <dir>]";

function probe(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return r.status === 0;
}

function superpowersEnabled(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const enabled = JSON.parse(readFileSync(settingsPath, "utf8")).enabledPlugins ?? {};
    return Object.entries(enabled).some(([k, v]) => k.startsWith("superpowers@") && v === true);
  } catch {
    return false;
  }
}

export function installState(repo, manifest, plugin) {
  if (manifest) {
    const c = compareVersions(manifest.version, plugin);
    return c < 0 ? "behind" : c > 0 ? "ahead" : "up to date";
  }
  const anyOwned =
    collisions(repo, { provider: "github", ci: "github-actions", testing: [], gates: [] }).length >
    0;
  if (!anyOwned) return "not installed";
  const ejected = existsSync(join(repo, ".claude/agents")) && existsSync(join(repo, "HITL.md"));
  return ejected ? "ejected" : "partially installed";
}

export function run(args) {
  const { repo, "plugin-root": pluginRoot, home = homedir() } = args;
  if (!repo || !pluginRoot) return { code: 1, out: { error: USAGE } };
  const plugin = pluginVersion(pluginRoot);
  const manifest = readManifest(repo);
  const state = installState(repo, manifest, plugin);

  let locallyEdited = null;
  let missing = null;
  if (manifest) {
    locallyEdited = 0;
    missing = 0;
    for (const [path, hash] of Object.entries(manifest.files)) {
      const abs = join(repo, path);
      if (!existsSync(abs)) missing += 1;
      else if (sha256(readFileSync(abs, "utf8")) !== hash) locallyEdited += 1;
    }
  }

  const prerequisites = {
    node: Number(process.versions.node.split(".")[0]) >= 20,
    git: probe("git", ["--version"]),
    gh: probe("gh", ["auth", "status"]),
    superpowers:
      superpowersEnabled(join(home, ".claude/settings.json")) ||
      superpowersEnabled(join(repo, ".claude/settings.json")),
  };

  return {
    code: 0,
    out: {
      state,
      manifestVersion: manifest ? manifest.version : null,
      pluginVersion: plugin,
      locallyEdited,
      missing,
      prerequisites,
    },
  };
}

const args = parseArgs(process.argv.slice(2));
emit(args ? run(args) : { code: 1, out: { error: USAGE } });

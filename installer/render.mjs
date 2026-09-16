#!/usr/bin/env node
// /hitl:init's writer. Refuses before its first write (manifest present, collision, bad
// settings.json); otherwise writes every owned file, the appended blocks, the merged hook
// and the manifest, and prints one JSON report. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MANIFEST_PATH,
  collisions,
  foreignFiles,
  gitignoreBlock,
  manifestFor,
  mergeSettings,
  pluginVersion,
  readManifest,
  readmeBlock,
  renderAll,
  withClaudeLine,
  withMarkerBlock,
} from "./lib.mjs";

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) return null;
    args[key.slice(2)] = value;
  }
  return args;
}

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function writeFile(repoRoot, rel, text, executable = false) {
  const abs = join(repoRoot, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  if (executable) chmodSync(abs, 0o755);
}

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  if (!repo || !pluginRoot || !answersPath) return { code: 1, out: { error: "usage: --repo <dir> --plugin-root <dir> --answers <file>" } };
  const choices = JSON.parse(readFileSync(answersPath, "utf8"));
  const version = pluginVersion(pluginRoot);

  const manifest = readManifest(repo);
  if (manifest) return { code: 3, out: { refused: "manifest-present", version: manifest.version } };
  const hits = collisions(repo, choices);
  if (hits.length > 0) return { code: 3, out: { refused: "collision", paths: hits } };
  const settingsPath = join(repo, ".claude/settings.json");
  let settings;
  try {
    const hookEntry = JSON.parse(readFileSync(join(pluginRoot, "templates/claude/settings.hook.json"), "utf8"));
    settings = mergeSettings(readIfPresent(settingsPath), hookEntry);
  } catch (e) {
    return { code: 3, out: { refused: "settings-unparsable", error: String(e.message) } };
  }
  const foreign = foreignFiles(repo, choices);

  const rendered = renderAll(pluginRoot, choices);
  const wrote = [];
  const appended = [];
  const kept = [];
  let manifestOut;
  try {
    for (const [rel, { content, executable }] of rendered) {
      writeFile(repo, rel, content, executable);
      wrote.push(rel);
    }
    const append = (rel, result) => {
      if (result.changed) {
        writeFile(repo, rel, result.text);
        appended.push(rel);
      } else kept.push(rel);
    };
    append("CLAUDE.md", withClaudeLine(readIfPresent(join(repo, "CLAUDE.md"))));
    append("README.md", withMarkerBlock(readIfPresent(join(repo, "README.md")), readmeBlock(version)));
    append(".gitignore", withMarkerBlock(readIfPresent(join(repo, ".gitignore")), gitignoreBlock()));
    if (settings.added) writeFile(repo, ".claude/settings.json", settings.text);
    manifestOut = manifestFor(version, choices, rendered);
    writeFile(repo, MANIFEST_PATH, `${JSON.stringify(manifestOut, null, 2)}\n`);
  } catch (e) {
    // Init is not transactional: say what landed so the human can remove it and re-run.
    return { code: 2, out: { error: String(e.message), wrote: [...wrote, ...appended] } };
  }

  return {
    code: 0,
    out: { wrote, appended, kept, foreign, settings: settings.added ? "added" : "present", manifest: manifestOut },
  };
}

const args = parseArgs(process.argv.slice(2));
const result = args ? run(args) : { code: 1, out: { error: "usage: --repo <dir> --plugin-root <dir> --answers <file>" } };
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exit(result.code);

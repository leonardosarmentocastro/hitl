#!/usr/bin/env node
// /hitl:init's writer (`--mode check` runs the refusals only and writes nothing). Refuses before its first write (unknown ci, manifest present,
// collision, bad settings.json); otherwise writes every owned file, the appended blocks, the
// merged hook and the manifest, and prints one JSON report. Exit: 0 ok · 1 usage · 2 error · 3 refused.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  CI_CHOICES,
  DEFAULT_CHOICES,
  MANIFEST_PATH,
  agentsBlock,
  collisions,
  foreignFiles,
  gitignoreBlock,
  manifestFor,
  mergeSettings,
  parseArgs,
  pluginVersion,
  readManifest,
  readmeBlock,
  renderAll,
  withClaudeLine,
  withMarkerBlock,
} from "./lib.mjs";

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function writeFile(repoRoot, rel, text, executable = false) {
  const abs = join(repoRoot, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  if (executable) chmodSync(abs, 0o755);
}

const USAGE = "usage: --repo <dir> --plugin-root <dir> [--mode write|check] [--answers <file>]";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  const mode = args.mode ?? "write";
  if (!repo || !pluginRoot || !["write", "check"].includes(mode))
    return { code: 1, out: { error: USAGE } };
  if (mode === "write" && !answersPath) return { code: 1, out: { error: USAGE } };
  const choices = answersPath ? JSON.parse(readFileSync(answersPath, "utf8")) : DEFAULT_CHOICES;
  const version = pluginVersion(pluginRoot);
  if (!CI_CHOICES.includes(choices.ci))
    return { code: 3, out: { refused: "unknown-ci", ci: choices.ci, allowed: CI_CHOICES } };

  const manifest = readManifest(repo);
  if (manifest) return { code: 3, out: { refused: "manifest-present", version: manifest.version } };
  const hits = collisions(repo, choices);
  if (hits.length > 0) return { code: 3, out: { refused: "collision", paths: hits } };
  const settingsPath = join(repo, ".claude/settings.json");
  let settings;
  try {
    const hookEntry = JSON.parse(
      readFileSync(join(pluginRoot, "templates/claude/settings.hook.json"), "utf8"),
    );
    settings = mergeSettings(readIfPresent(settingsPath), hookEntry);
  } catch (e) {
    return { code: 3, out: { refused: "settings-unparsable", error: String(e.message) } };
  }
  if (mode === "check") return { code: 0, out: { ok: true } };
  const foreign = foreignFiles(repo, choices);

  const rendered = renderAll(pluginRoot, choices);
  const wrote = [];
  const appended = [];
  const kept = [];
  let manifestOut;
  let settingsWritten = false;
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
    append(
      "README.md",
      withMarkerBlock(readIfPresent(join(repo, "README.md")), readmeBlock(version)),
    );
    append(
      ".gitignore",
      withMarkerBlock(readIfPresent(join(repo, ".gitignore")), gitignoreBlock()),
    );
    const agentsExisting =
      readIfPresent(join(repo, "AGENTS.md")) ?? `# ${basename(repo)} — agent working agreements\n`;
    append(
      "AGENTS.md",
      withMarkerBlock(agentsExisting, agentsBlock(choices.gates ?? [], choices.testing)),
    );
    if (settings.added) {
      writeFile(repo, ".claude/settings.json", settings.text);
      settingsWritten = true;
    }
    manifestOut = manifestFor(version, choices, rendered);
    writeFile(repo, MANIFEST_PATH, `${JSON.stringify(manifestOut, null, 2)}\n`);
  } catch (e) {
    // Init is not transactional: say what landed so the human can remove it and re-run.
    // `wrote` holds only files init created; `appended` files may be the repository's own.
    return {
      code: 2,
      out: {
        error: String(e.message),
        wrote,
        appended,
        settings: settingsWritten ? "added" : "untouched",
      },
    };
  }

  return {
    code: 0,
    out: {
      wrote,
      appended,
      kept,
      foreign,
      settings: settings.added ? "added" : "present",
      manifest: manifestOut,
    },
  };
}

const args = parseArgs(process.argv.slice(2));
const result = args ? run(args) : { code: 1, out: { error: USAGE } };
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exit(result.code);

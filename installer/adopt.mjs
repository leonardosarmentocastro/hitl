#!/usr/bin/env node
// /hitl:init --adopt's writer. Stamps an already-ejected repository with a manifest whose
// hashes are those of the templates as they would be rendered — never the repository's own
// files — so the first /hitl:diff shows every local difference. Writes nothing else.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emit, parseArgs } from "./lib.mjs";
import {
  CI_CHOICES,
  MANIFEST_PATH,
  collisions,
  manifestFor,
  pluginVersion,
  readManifest,
  renderAll,
} from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> --answers <file>";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  if (!repo || !pluginRoot || !answersPath) return { code: 1, out: { error: USAGE } };
  const choices = JSON.parse(readFileSync(answersPath, "utf8"));
  if (!CI_CHOICES.includes(choices.ci))
    return { code: 3, out: { refused: "unknown-ci", ci: choices.ci, allowed: CI_CHOICES } };

  const existing = readManifest(repo);
  if (existing) return { code: 3, out: { refused: "manifest-present", version: existing.version } };
  if (collisions(repo, choices).length === 0)
    return { code: 3, out: { refused: "nothing-to-adopt" } };

  const manifest = manifestFor(pluginVersion(pluginRoot), choices, renderAll(pluginRoot, choices));
  const abs = join(repo, MANIFEST_PATH);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`);
  return { code: 0, out: { wrote: [MANIFEST_PATH], manifest } };
}

const args = parseArgs(process.argv.slice(2));
emit(args ? run(args) : { code: 1, out: { error: USAGE } });

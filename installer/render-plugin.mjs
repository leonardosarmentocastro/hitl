#!/usr/bin/env node
// Writes the plugin's no-install files (renderPlugin) into the plugin tree. Run after a
// template changes; plugin-drift.test.ts fails until it is. Exit: 0 ok · 1 usage · 2 error.
import { chmodSync, existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emit, parseArgs, renderPlugin } from "./lib.mjs";

export function run(args) {
  const pluginRoot = args?.["plugin-root"];
  if (!pluginRoot) return { code: 1, out: { error: "usage: --plugin-root <dir>" } };
  try {
    const wrote = [];
    for (const [rel, { content, executable }] of renderPlugin(pluginRoot)) {
      const abs = join(pluginRoot, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      if (executable) chmodSync(abs, 0o755);
      wrote.push(rel);
    }
    return { code: 0, out: { wrote } };
  } catch (e) {
    return { code: 2, out: { error: String(e?.message ?? e) } };
  }
}

const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) emit(run(parseArgs(process.argv.slice(2))));

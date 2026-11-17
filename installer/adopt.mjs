#!/usr/bin/env node
// /hitl:init --adopt's writer. Stamps an already-ejected repository with a manifest whose
// hashes are those of the templates as they would be rendered — never the repository's own
// files — so the first /hitl:diff shows every local difference. Before recording, it moves a
// doctrine or reviewer context found in its pre-0.3.0 place into `.hitl/` (content untouched)
// and points CLAUDE.md's import line at it. Writes nothing else.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { emit, parseArgs } from "./lib.mjs";
import {
  MANIFEST_PATH,
  MOVES,
  PROVIDERS,
  collisions,
  manifestFor,
  pluginVersion,
  readManifestOf,
  renderAll,
  rewriteClaudeLine,
} from "./lib.mjs";

const USAGE = "usage: --repo <dir> --plugin-root <dir> --answers <file>";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, answers: answersPath } = args;
  if (!repo || !pluginRoot || !answersPath) return { code: 1, out: { error: USAGE } };
  const choices = JSON.parse(readFileSync(answersPath, "utf8"));
  if (!PROVIDERS.includes(choices.provider)) {
    return {
      code: 3,
      out: { refused: "unknown-provider", provider: choices.provider, allowed: PROVIDERS },
    };
  }

  const found = readManifestOf(repo);
  if (found)
    return {
      code: 3,
      out: { refused: "manifest-present", version: found.manifest.version, layout: found.layout },
    };
  // hitl will not choose between an old-place file and one already at its new path.
  for (const m of MOVES)
    if (existsSync(join(repo, m.from)) && existsSync(join(repo, m.to)))
      return { code: 3, out: { refused: "move-collision", paths: [m.from, m.to] } };
  if (collisions(repo, choices).length === 0)
    return { code: 3, out: { refused: "nothing-to-adopt" } };

  const moved = [];
  let claudeLine = null;
  try {
    for (const m of MOVES) {
      if (!existsSync(join(repo, m.from))) continue;
      mkdirSync(dirname(join(repo, m.to)), { recursive: true });
      renameSync(join(repo, m.from), join(repo, m.to));
      moved.push({ from: m.from, to: m.to });
    }

    // CLAUDE.md imports the doctrine at its new path; an absent import line is never added.
    const claudePath = join(repo, "CLAUDE.md");
    const claude = rewriteClaudeLine(
      existsSync(claudePath) ? readFileSync(claudePath, "utf8") : null,
    );
    if (claude.state === "rewritten") writeFileSync(claudePath, claude.text);
    claudeLine = claude.state;

    const manifest = manifestFor(
      pluginVersion(pluginRoot),
      choices,
      renderAll(pluginRoot, choices),
    );
    const abs = join(repo, MANIFEST_PATH);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`);
    return { code: 0, out: { wrote: [MANIFEST_PATH], moved, claudeLine, manifest } };
  } catch (e) {
    return {
      code: 2,
      out: { error: String(e?.message ?? e), moved, claudeLine, manifest: "untouched" },
    };
  }
}

const args = parseArgs(process.argv.slice(2));
emit(args ? run(args) : { code: 1, out: { error: USAGE } });

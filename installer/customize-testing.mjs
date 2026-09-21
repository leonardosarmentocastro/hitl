#!/usr/bin/env node
// The `testing-rules` knob of /hitl:customize: re-compose HITL.md with a new fragment set,
// add or remove the wipe workflow, and record the new choices in the manifest so /hitl:diff
// stays exact. Refuses when the manifest is behind the plugin or HITL.md was edited by
// hand. Exit: 0 ok · 1 usage · 3 refused.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  BLOCK_END,
  BLOCK_START,
  MANIFEST_PATH,
  TESTING_ORDER,
  agentsBlock,
  compareVersions,
  composeHitl,
  manifestFor,
  parseArgs,
  pluginVersion,
  readManifest,
  renderAll,
  sha256,
} from "./lib.mjs";

const WORKFLOW = ".github/workflows/wipe-superpowers-docs.yml";
const PILOTS_ANCHOR = "<!-- hitl:knob effective-date-pilots -->";
const USAGE = "usage: --repo <dir> --plugin-root <dir> --testing <a,b|''> --ci github-actions|none";

export function run(args) {
  const { repo, "plugin-root": pluginRoot, ci } = args;
  const testingArg = args.testing;
  if (
    !repo ||
    !pluginRoot ||
    testingArg === undefined ||
    !["github-actions", "none"].includes(ci)
  ) {
    return { code: 1, out: { error: USAGE } };
  }
  const testing = testingArg === "" ? [] : testingArg.split(",").map((s) => s.trim());
  for (const id of testing)
    if (!TESTING_ORDER.includes(id)) return { code: 3, out: { refused: "unknown-fragment", id } };

  const manifest = readManifest(repo);
  if (!manifest) return { code: 3, out: { refused: "no-manifest" } };
  const plugin = pluginVersion(pluginRoot);
  if (manifest.version !== plugin) {
    const refused = compareVersions(manifest.version, plugin) < 0 ? "behind" : "ahead";
    return { code: 3, out: { refused, recorded: manifest.version, plugin } };
  }

  const hitlPath = join(repo, "HITL.md");
  const current = existsSync(hitlPath) ? readFileSync(hitlPath, "utf8") : null;
  if (current !== composeHitl(pluginRoot, manifest.testing))
    return { code: 3, out: { refused: "hitl-locally-edited" } };

  const choices = {
    provider: manifest.provider,
    ci,
    testing: TESTING_ORDER.filter((t) => testing.includes(t)),
    gates: [],
  };
  const rendered = renderAll(pluginRoot, choices);
  const wrote = [];
  const removed = [];
  const kept = [];

  writeFileSync(hitlPath, rendered.get("HITL.md").content);
  wrote.push("HITL.md");

  // The effective-date fragment points at a pilots section in the AGENTS.md hitl block: add it
  // when missing; on removal leave the humans' list in place and report it.
  const agentsPath = join(repo, "AGENTS.md");
  const agents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : null;
  const hasPilots = agents !== null && agents.includes(PILOTS_ANCHOR);
  if (choices.testing.includes("effective-date") && !hasPilots) {
    const end = agents === null ? -1 : agents.indexOf(BLOCK_END);
    if (end > -1 && agents.lastIndexOf(BLOCK_START, end) > -1) {
      const block = agentsBlock([], ["effective-date"]);
      const section = block.slice(block.indexOf(PILOTS_ANCHOR));
      const before = agents.slice(0, end).replace(/\n*$/, "\n");
      writeFileSync(agentsPath, `${before}\n${section}\n${agents.slice(end)}`);
      wrote.push("AGENTS.md");
    } else kept.push("AGENTS.md");
  } else if (!choices.testing.includes("effective-date") && hasPilots) kept.push("AGENTS.md");

  const workflowPath = join(repo, WORKFLOW);
  if (ci === "github-actions") {
    if (!existsSync(workflowPath)) {
      mkdirSync(dirname(workflowPath), { recursive: true });
      writeFileSync(workflowPath, rendered.get(WORKFLOW).content);
      wrote.push(WORKFLOW);
    } else if (readFileSync(workflowPath, "utf8") !== rendered.get(WORKFLOW).content)
      kept.push(WORKFLOW);
  } else if (existsSync(workflowPath)) {
    const recordedHash = manifest.files[WORKFLOW];
    if (recordedHash && sha256(readFileSync(workflowPath, "utf8")) === recordedHash) {
      rmSync(workflowPath);
      removed.push(WORKFLOW);
    } else kept.push(WORKFLOW);
  }

  const next = manifestFor(plugin, choices, rendered);
  writeFileSync(join(repo, MANIFEST_PATH), `${JSON.stringify(next, null, 2)}\n`);
  return { code: 0, out: { wrote, removed, kept, manifest: next } };
}

const args = parseArgs(process.argv.slice(2));
const result = args ? run(args) : { code: 1, out: { error: USAGE } };
process.stdout.write(`${JSON.stringify(result.out, null, 2)}\n`);
process.exit(result.code);

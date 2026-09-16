// Shared code for every installer script. Zero dependencies; Node 20+.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TESTING_ORDER = ["e2e", "tiers", "ci", "hooks", "effective-date"];
export const OWNED_DIRS = ["scripts/hitl", ".claude/fixtures"];
export const MANIFEST_PATH = ".claude/hitl.json";

const AGENTS = [
  "spec-reviewer",
  "plan-reviewer",
  "slice-reviewer",
  "implementer",
  "fixer",
  "handover",
];
const COMMANDS = [
  "review-spec",
  "review-plan",
  "review-slice",
  "handover",
  "implement-stack",
  "umbrella-pr",
];
const FIXTURES = [
  "spec-fixture-design.md",
  "plans/2026-09-06-spec-fixture-slice-1-schema.md",
  "plans/2026-09-06-spec-fixture-slice-2-api.md",
];

/** The owned files for a set of choices. `template` is relative to templates/; null = composed. */
export function ownedFiles(choices) {
  const files = [
    { repoPath: "HITL.md", template: null, executable: false },
    ...AGENTS.map((a) => ({
      repoPath: `.claude/agents/${a}.md`,
      template: `claude/agents/${a}.md`,
      executable: false,
    })),
    ...COMMANDS.map((c) => ({
      repoPath: `.claude/commands/${c}.md`,
      template: `claude/commands/${c}.md`,
      executable: false,
    })),
    {
      repoPath: ".claude/hooks/unreviewed-artifact.sh",
      template: "claude/hooks/unreviewed-artifact.sh",
      executable: true,
    },
    {
      repoPath: ".claude/review-context.md",
      template: "claude/review-context.md",
      executable: false,
    },
    ...FIXTURES.map((f) => ({
      repoPath: `.claude/fixtures/${f}`,
      template: `claude/fixtures/${f}`,
      executable: false,
    })),
    {
      repoPath: "scripts/hitl/wipe-superpowers-docs.sh",
      template: "scripts/wipe-superpowers-docs.sh",
      executable: true,
    },
  ];
  if (choices.ci === "github-actions") {
    files.push({
      repoPath: ".github/workflows/wipe-superpowers-docs.yml",
      template: "ci/github-actions/wipe-superpowers-docs.yml",
      executable: false,
    });
  }
  return files;
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function pluginVersion(pluginRoot) {
  const p = join(pluginRoot, ".claude-plugin/plugin.json");
  return JSON.parse(readFileSync(p, "utf8")).version;
}

export function readManifest(repoRoot) {
  const p = join(repoRoot, MANIFEST_PATH);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
export const THIS_REPO_CHOICES = {
  provider: "github",
  ci: "github-actions",
  testing: [],
  gates: ["pnpm test", "pnpm format:check"],
};

/** HITL.md = the core doctrine, then "## Testing and gates" + the chosen fragments in TESTING_ORDER. */
export function composeHitl(pluginRoot, testing) {
  const core = readFileSync(join(pluginRoot, "templates/HITL.md"), "utf8");
  const chosen = TESTING_ORDER.filter((t) => testing.includes(t));
  if (chosen.length === 0) return core;
  const fragments = chosen.map((t) =>
    readFileSync(join(pluginRoot, `templates/testing/${t}.md`), "utf8").trimEnd(),
  );
  return `${core.trimEnd()}\n\n## Testing and gates\n\n${fragments.join("\n\n")}\n`;
}

/** Every owned file rendered for the choices: repoPath -> { content, executable }. */
export function renderAll(pluginRoot, choices) {
  const out = new Map();
  for (const f of ownedFiles(choices)) {
    const content =
      f.template === null
        ? composeHitl(pluginRoot, choices.testing)
        : readFileSync(join(pluginRoot, "templates", f.template), "utf8");
    out.set(f.repoPath, { content, executable: f.executable });
  }
  return out;
}

export const BLOCK_START = "<!-- hitl:start -->";
export const BLOCK_END = "<!-- hitl:end -->";

function withTrailingNewline(text) {
  return text === "" || text.endsWith("\n") ? text : `${text}\n`;
}

/** Append a marked block to a file's text; a file already carrying the markers is left alone. */
export function withMarkerBlock(existing, block) {
  if (existing !== null && existing.includes(BLOCK_START)) return { text: existing, changed: false };
  const base = existing === null ? "" : withTrailingNewline(existing);
  const gap = base === "" ? "" : "\n";
  return { text: `${base}${gap}${BLOCK_START}\n${block.trimEnd()}\n${BLOCK_END}\n`, changed: true };
}

/** Append the `@HITL.md` import line to CLAUDE.md; recognised and left alone on a re-run. */
export function withClaudeLine(existing) {
  if (existing !== null && existing.split("\n").includes("@HITL.md")) {
    return { text: existing, changed: false };
  }
  const base = existing === null ? "" : withTrailingNewline(existing);
  const gap = base === "" ? "" : "\n";
  return { text: `${base}${gap}@HITL.md\n`, changed: true };
}

/** Merge the Stop hook entry into settings.json text; other hooks and keys are kept. Throws on bad JSON. */
export function mergeSettings(existingText, hookEntry) {
  const settings = existingText === null ? {} : JSON.parse(existingText);
  settings.hooks ??= {};
  settings.hooks.Stop ??= [];
  const present = JSON.stringify(settings.hooks.Stop).includes("unreviewed-artifact.sh");
  if (!present) settings.hooks.Stop.push({ hooks: [hookEntry] });
  return { text: `${JSON.stringify(settings, null, 2)}\n`, added: !present };
}

export function readmeBlock(version) {
  return `## How changes land here

Every feature and bugfix follows a human-in-the-loop chain: brainstorm → spec → cold spec
review → plans → cold plan review → handover → stacked slice PRs, each implemented, reviewed
and fixed by subagents, with a human deciding at every gate. The doctrine is \`HITL.md\`.

- Specs and plans live under \`docs/superpowers/\` for the life of a feature branch and are
  removed from \`main\` after the feature merges. The PR description is the durable record.
- \`.claude/\` (agents, commands, hook) and \`HITL.md\` are reviewed like code: change them by
  pull request.
- Installed by hitl ${version}. \`/hitl:diff\` shows what changed upstream since;
  \`/hitl:help\` explains the state of this install.
- Prerequisites: Claude Code with the superpowers plugin, \`git\`, \`gh\`; \`/grill-me\` from
  Matt Pocock's skills is the recommended start for a feature whose shape is unclear.`;
}

export function gitignoreBlock() {
  return `# hitl: review output and dry-run scratch space are never committed.
.claude/reviews/
.claude/fixtures/scratch/
.claude/settings.local.json`;
}

/** Owned paths that already exist: directories for OWNED_DIRS, files for everything else. */
export function collisions(repoRoot, choices) {
  const hits = OWNED_DIRS.filter((d) => existsSync(join(repoRoot, d)));
  for (const f of ownedFiles(choices)) {
    const insideOwnedDir = OWNED_DIRS.some((d) => f.repoPath.startsWith(`${d}/`));
    if (!insideOwnedDir && existsSync(join(repoRoot, f.repoPath))) hits.push(f.repoPath);
  }
  return hits;
}

/** The manifest for a render: version, the recorded choices (never gates), sorted file hashes. */
export function manifestFor(version, choices, rendered) {
  const files = {};
  for (const p of [...rendered.keys()].sort()) files[p] = sha256(rendered.get(p).content);
  return { version, provider: choices.provider, ci: choices.ci, testing: [...choices.testing], files };
}

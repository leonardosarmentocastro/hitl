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

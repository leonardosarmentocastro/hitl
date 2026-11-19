// scripts/__tests__/grill-me-command.test.ts
// /hitl:grill-me is a prompt, validated by a dry run; this pins only the fixed copy, what the
// grill start depends on, and that it stays equal to /hitl:brainstorming outside its differences.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const grill = readFileSync(join(ROOT, "commands/grill-me.md"), "utf8");
const brainstorm = readFileSync(join(ROOT, "commands/brainstorming.md"), "utf8");

const MISSING_SKILL = [
  "/hitl:grill-me needs the grill-me skill from Matt Pocock's skills. Install it, then re-run /hitl:grill-me:",
  "  npx skills add mattpocock/skills",
  "Or start with /hitl:brainstorming, which needs no extra skill.",
].join("\n");

/** A block that exists only in grill-me.md, with the blank line after it. */
const ONLY = /<!-- grill-me:only -->\n[\s\S]*?<!-- grill-me:end -->\n\n?/g;

/** Sentence pins ignore line wraps: the prompt wraps at 100 columns, wherever that falls. */
const flat = (t: string) => t.replace(/\s+/g, " ");

/** The two places brainstorming.md starts the design conversation, and what grill-me.md says there. */
const REPLACED: [string, string][] = [
  [
    "invoke the\n  superpowers brainstorming skill with `$ARGUMENTS`, and follow",
    "run\n  § The design conversation below, and follow",
  ],
  [
    "Then invoke the superpowers brainstorming skill with `$ARGUMENTS`, under the doctrine.",
    "Then run § The design conversation below, under the doctrine.",
  ],
];

describe("/hitl:grill-me", () => {
  const text = grill;

  it("is a command with a description", () => {
    expect(text).toMatch(/^---\ndescription: /);
  });

  it("runs the plugin's scripts from the plugin root", () => {
    for (const s of [
      "runtime/context.mjs",
      "runtime/session.mjs",
      "runtime/memory.mjs",
      "installer/discover.mjs",
    ])
      expect(text).toContain(`\${CLAUDE_PLUGIN_ROOT}/${s}`);
  });

  it("carries the fixed copy", () => {
    expect(text).toContain("hitl is installed here — following this repository's rules.");
    expect(text).not.toContain("issues/19");
    expect(text).toContain("Remember this for this project?");
  });

  it("requires the GitLab token on GitLab and names the missing backend elsewhere", () => {
    expect(text).toContain("GITLAB_TOKEN");
    expect(text).toContain("no PR backend");
    expect(text).toContain("If the JSON also has a `hostProblem`, say it");
  });

  it("leaves the worktree procedure to the doctrine", () => {
    expect(text).not.toMatch(/git worktree add/);
  });

  it("stops on the old layout before the installed branch", () => {
    const old = text.indexOf('`layout: "old"`');
    expect(old).toBeGreaterThan(-1);
    expect(old).toBeLessThan(text.indexOf('`mode: "installed"`'));
  });

  it("reads an installed repository's doctrine at its .hitl/ path", () => {
    expect(text).toContain("Read the repository's `.hitl/HITL.md`");
  });

  it("names itself in its usage and its re-run messages", () => {
    expect(grill).toMatch(/^---\ndescription: .*Usage: \/hitl:grill-me <what to design>\n/);
    expect(grill).toMatch(/\nargument-hint: <what to design>\n---\n/);
    // only the superpowers stop message can satisfy this one
    expect(grill).toContain(
      "artefacts this workflow reviews). Install it, then re-run /hitl:grill-me:",
    );
    expect(grill).toContain("then re-run /hitl:grill-me.");
    // outside the grill-only blocks, the other command is never named
    expect(grill.replace(ONLY, "")).not.toContain("/hitl:brainstorming");
  });

  it("has exactly two grill-only blocks", () => {
    expect(grill.match(ONLY)?.length).toBe(2);
  });

  it("stops with the fixed message when no grill skill is available", () => {
    expect(grill).toContain(MISSING_SKILL);
    const prereq = grill.slice(grill.indexOf("## 1. "), grill.indexOf("## 2. "));
    expect(prereq).toContain(MISSING_SKILL); // raw: the message's own line breaks are fixed copy
    const p = flat(prereq);
    expect(p).toContain("named exactly `grilling`, or else one named exactly `grill-me`");
    expect(p).toContain("this command itself (`hitl:grill-me`) never counts");
    expect(p).toContain("A `grill-me` that only the human can trigger is not in that list.");
    expect(p.indexOf("named exactly `grilling`")).toBeGreaterThan(p.indexOf("superpowers@"));
  });

  it("sends both modes to the design conversation, never straight to the brainstorm", () => {
    const installed = grill.slice(
      grill.indexOf('`mode: "installed"`'),
      grill.indexOf('`host: "github"`'),
    );
    const step7 = grill.slice(
      grill.indexOf("## 7. Design session"),
      grill.indexOf("## The design conversation"),
    );
    for (const part of [installed, step7]) {
      expect(part).toContain("§ The design conversation");
      expect(part).not.toContain("superpowers brainstorming skill");
    }
  });

  describe("the design conversation", () => {
    const section = flat(grill.slice(grill.indexOf("## The design conversation")));

    it("grills before it hands over to the brainstorming skill", () => {
      const grillAt = section.indexOf("Invoke the grill skill found in step 1");
      const handOver = section.indexOf("Invoke the superpowers brainstorming skill");
      expect(grillAt).toBeGreaterThan(-1);
      expect(handOver).toBeGreaterThan(grillAt);
    });

    it("waits for the human to confirm the summary", () => {
      expect(section).toContain("Then stop and wait.");
      expect(section).toContain("go on only when the human confirms it");
    });

    it("hands over settled decisions and open items", () => {
      expect(section).toContain("Its decisions are settled: do not reopen them.");
      expect(section).toContain("Its open items are the brainstorm's questions.");
    });

    it("ends the session when there is nothing to build", () => {
      expect(section).toContain(
        "**Nothing to build.** The session ends here: no hand-over, no spec.",
      );
    });
  });

  describe("drift from /hitl:brainstorming", () => {
    const body = (t: string) => t.replace(/^---\n[\s\S]*?\n---\n/, "");

    it("equals brainstorming.md outside the enumerated differences", () => {
      let expected = body(brainstorm);
      for (const [from, to] of REPLACED) {
        expect(expected.split(from).length).toBe(2); // exactly one occurrence
        expected = expected.replace(from, to);
      }
      const actual = body(grill)
        .replace(ONLY, "")
        .replaceAll("/hitl:grill-me", "/hitl:brainstorming");
      expect(actual.trimEnd()).toBe(expected.trimEnd());
    });
  });
});

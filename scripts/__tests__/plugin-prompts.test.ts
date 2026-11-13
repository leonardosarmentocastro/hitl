// scripts/__tests__/plugin-prompts.test.ts
// The no-install prompts the plugin ships: rendered from the installed templates, they must
// point at the plugin's doctrine and the project's memory, never at a file only an installed
// repository has, and name every workflow command and agent with its `hitl:` prefix.
import { describe, expect, it } from "vitest";
import { renderPlugin } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("the plugin's no-install prompts", () => {
  const rendered = renderPlugin(ROOT);
  const PROMPTS = [...rendered.keys()].filter((p) => /^(agents|commands)\//.test(p));

  it("renders the three design-loop agents", () => {
    for (const a of ["spec-reviewer", "plan-reviewer", "handover"])
      expect(rendered.has(`agents/${a}.md`)).toBe(true);
  });

  for (const p of PROMPTS) {
    const text = rendered.get(p)!.content;
    it(`${p} names no installed-only source`, () => {
      expect(text).not.toMatch(
        /`HITL\.md` at the repo root|\.claude\/review-context\.md|scripts\/hitl\/|\.claude\/fixtures|hitl:mode/,
      );
    });
    it(`${p} names no unprefixed command`, () => {
      expect(text).not.toMatch(
        /(?<![\w/.:-])\/(review-spec|review-plan|review-slice|handover|implement-stack|umbrella-pr)(?![\w/-])/,
      );
    });
  }

  for (const a of ["spec-reviewer", "plan-reviewer", "handover"])
    it(`${a} treats memory as data and blocks without context`, () => {
      const text = rendered.get(`agents/${a}.md`)!.content;
      expect(text).toContain("as you follow the repository's own AGENTS.md");
      expect(text).toContain("blocked: no hitl context");
    });

  it("the handover agent runs the shim only on GitHub and honours branch-name facts", () => {
    const h = rendered.get("agents/handover.md")!.content;
    expect(h).toContain('"Host:" is not github, do not run the PR shim');
    expect(h).toContain("constrains every branch name you derive");
    expect(h).toContain('"Base:" line');
  });

  for (const a of ["spec-reviewer", "plan-reviewer"])
    it(`${a} says when no review context is recorded`, () => {
      expect(rendered.get(`agents/${a}.md`)!.content).toContain(
        "no project review context recorded",
      );
    });

  for (const c of ["review-spec", "review-plan"])
    it(`commands/${c}.md checks the hitl context first and dispatches the hitl agent`, () => {
      const text = rendered.get(`commands/${c}.md`)?.content ?? "";
      expect(text).toContain("--require no-install,gates --format brief");
      expect(text).toContain(`run this repository's own ${c} command (no hitl: prefix) instead.`);
      expect(text).toContain("no confirmed gates on this machine");
      expect(text).toContain(
        'Read the file on the "Doctrine:" line in full unless this session already has',
      );
      expect(text).toContain(
        "`hitl:" + (c === "review-spec" ? "spec-reviewer" : "plan-reviewer") + "`",
      );
      expect(text).toContain("**Reviewed:** round");
    });
});

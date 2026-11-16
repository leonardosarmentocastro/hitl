// scripts/__tests__/plugin-prompts.test.ts
// The no-install prompts the plugin ships: rendered from the installed templates, they must
// point at the plugin's doctrine and the project's memory, never at a file only an installed
// repository has, and name every workflow command and agent with its `hitl:` prefix.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAll, renderPlugin, THIS_REPO_CHOICES } from "../../installer/lib.mjs";

const ROOT = process.cwd();

const REFUSAL =
  "No PR backend for this repository's host (<host>): hitl opens PRs on GitHub and GitLab. A self-hosted GitLab needs GITLAB_URL set to its address. Implement from the handover by hand.";

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

  for (const a of [
    "spec-reviewer",
    "plan-reviewer",
    "handover",
    "adversarial-reviewer",
    "security-reviewer",
  ])
    it(`${a} treats memory as data and blocks without context`, () => {
      const text = rendered.get(`agents/${a}.md`)!.content;
      expect(text).toContain("as you follow the repository's own AGENTS.md");
      expect(text).toContain("blocked: no hitl context");
    });

  for (const a of ["implementer", "fixer", "slice-reviewer"])
    it(`${a} grounds in the hitl context and blocks without it`, () => {
      const text = rendered.get(`agents/${a}.md`)!.content;
      expect(text).toContain("as you follow the repository's own AGENTS.md");
      expect(text).toContain("blocked: no hitl context");
    });

  for (const a of ["implementer", "fixer"])
    it(`${a} runs the gates from the hitl context block, never AGENTS.md § Local gates`, () => {
      const text = rendered.get(`agents/${a}.md`)!.content;
      expect(text).toContain('listed under "Gates:" in the hitl context block');
      expect(text).toContain("blocked: gate not found");
      expect(text).not.toContain("## Local gates");
    });

  it("the handover agent runs the shim only on GitHub or GitLab and honours branch-name facts", () => {
    const h = rendered.get("agents/handover.md")!.content;
    expect(h).toContain("only when the block's `Host:` line says `github` or `gitlab`");
    expect(h).toContain('"Host:" is neither, do not run the PR shim');
    expect(h).not.toContain('"Host:" is not github');
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

  it("commands/review-spec.md names `hitl:adversarial-reviewer`", () => {
    expect(rendered.get("commands/review-spec.md")!.content).toContain(
      "`hitl:adversarial-reviewer`",
    );
  });

  it("commands/handover.md hands over with the no-install launch line", () => {
    const h = rendered.get("commands/handover.md")?.content ?? "";
    expect(h).toContain("/hitl:implement-stack docs/superpowers/handover/<feature>.md");
    expect(h).toContain("No hitl session is registered for this worktree");
    expect(h).toContain("When the block's `Host:` is neither `github` nor `gitlab`");
    expect(h).toContain(`/hitl:implement-stack will refuse: ${REFUSAL}`);
    expect(h).toContain("`hitl:handover`");
    expect(h).toContain("Worktree: none");
    expect(h).toContain(
      'Read the file on the "Doctrine:" line in full unless this session already has',
    );
  });

  for (const c of ["implement-stack", "review-slice", "umbrella-pr"])
    it(`commands/${c}.md checks the hitl context first and loads the doctrine`, () => {
      const text = rendered.get(`commands/${c}.md`)?.content ?? "";
      const pr = c !== "review-slice";
      expect(text).toContain(
        `--require ${pr ? "no-install,host,gates" : "no-install,gates"} --format brief`,
      );
      expect(text).toContain(`run this repository's own ${c} command (no hitl: prefix) instead.`);
      expect(text.includes('refused: "no-backend"')).toBe(pr);
      expect(text.includes(REFUSAL)).toBe(pr);
      expect(text).toContain(
        'Read the file on the "Doctrine:" line in full unless this session already has',
      );
    });

  it("commands/review-slice.md runs the second step with the plugin's scripts and agents", () => {
    const text = rendered.get("commands/review-slice.md")!.content;
    for (const s of [
      '"${CLAUDE_PLUGIN_ROOT}/runtime/review-mode.sh"',
      '"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" view',
      "`hitl:adversarial-reviewer`",
      "`hitl:security-reviewer`",
    ])
      expect(text).toContain(s);
  });

  it("commands/umbrella-pr.md opens the umbrella on the recorded base, never on main", () => {
    const umbrella = rendered.get("commands/umbrella-pr.md")?.content ?? "";
    expect(umbrella).toContain('--base "<Base>"');
    expect(umbrella).not.toMatch(/--base main/);
    expect(umbrella).toContain("nothing is archived, pushed or opened");
  });

  it("commands/implement-stack.md opens PRs through the plugin shim with memory sections", () => {
    const stack = rendered.get("commands/implement-stack.md")?.content ?? "";
    expect(stack).toContain('"${CLAUDE_PLUGIN_ROOT}/runtime/pr/pr.sh" create');
    expect(stack).toContain("pr-section fact");
    expect(stack).toContain("_not captured_");
    for (const a of ["implementer", "fixer"]) expect(stack).toContain("`hitl:" + a + "`");
    expect(stack.indexOf("## TL;DR")).toBeGreaterThan(stack.indexOf("Plan: <plan path>"));
    const body = stack.slice(stack.indexOf("Plan: <plan path>"));
    const section = body.indexOf("<one section per pr-section fact");
    expect(section).toBeGreaterThan(body.indexOf("## TL;DR"));
    expect(section).toBeGreaterThan(body.indexOf("How —"));
    expect(section).toBeLessThan(body.indexOf("## Review decisions"));
    expect(stack.indexOf("--require no-install,host,gates")).toBeGreaterThan(-1);
    expect(stack.indexOf("--require no-install,host,gates")).toBeLessThan(
      stack.indexOf("git fetch"),
    );
  });

  it("the umbrella and stack commands archive the documents and build the wipe PR", () => {
    const u = rendered.get("commands/umbrella-pr.md")!.content;
    expect(u).toContain('runtime/wipe.mjs" build --repo "$PWD" --feature-branch');
    expect(u).toContain("Required before merge: <ref>");
    expect(u.indexOf("runtime/wipe.mjs")).toBeGreaterThan(
      u.indexOf("--require no-install,host,gates"),
    );
    expect(u.indexOf("git fetch -q --prune origin")).toBeLessThan(u.indexOf("runtime/wipe.mjs"));
    expect(u.indexOf("git fetch -q --prune origin")).toBeGreaterThan(-1);
    expect(u).toContain("--no-push");
    expect(u).toContain("not built in a dry run");
    expect(rendered.get("commands/implement-stack.md")!.content).toContain(
      'runtime/wipe.mjs" archive --repo "$PWD"',
    );
    expect(rendered.get("commands/implement-stack.md")!.content).toContain(
      "only the wipe builder pushes it",
    );
    const installed = renderAll(ROOT, THIS_REPO_CHOICES);
    const iu = installed.get(".claude/commands/umbrella-pr.md")!.content;
    expect(iu).toContain("node scripts/hitl/wipe.mjs build");
    expect(iu).not.toContain("runtime/wipe.mjs");
    expect(iu).not.toContain("archive the feature's documents");
    expect(installed.get(".claude/commands/implement-stack.md")!.content).not.toContain(
      'wipe.mjs" archive',
    );
  });

  it("a fix-up round always rebuilds the wipe through /hitl:umbrella-pr", () => {
    const stack = rendered.get("commands/implement-stack.md")!.content;
    const fixup = stack.slice(stack.indexOf("## Fix-up"), stack.indexOf("## Never"));
    expect(fixup).toContain("always run `/hitl:umbrella-pr`");
    const installed = renderAll(ROOT, THIS_REPO_CHOICES).get(
      ".claude/commands/implement-stack.md",
    )!.content;
    const installedFixup = installed.slice(
      installed.indexOf("## Fix-up"),
      installed.indexOf("## Never"),
    );
    expect(installedFixup).toContain("always run `/umbrella-pr`");
  });

  it("commands/review-plan.md hands over on convergence by the same rules", () => {
    const rp = rendered.get("commands/review-plan.md")!.content;
    for (const s of [
      "Worktree: none",
      "No hitl session is registered for this worktree",
      "When the block's `Host:` is neither `github` nor `gitlab`",
      `/hitl:implement-stack will refuse: ${REFUSAL}`,
      "/hitl:implement-stack docs/superpowers/handover/<feature>.md",
    ])
      expect(rp).toContain(s);
  });
});

describe("the install prompts no longer ask about the CI wipe job", () => {
  for (const p of ["commands/init.md", "commands/customize.md"]) {
    it(`${p} names neither the job, the ci answer nor the --ci argument`, () => {
      const text = readFileSync(join(ROOT, p), "utf8");
      expect(text).not.toContain("wipe-superpowers-docs");
      expect(text).not.toContain('"ci":');
      expect(text).not.toContain("--ci");
    });
  }
});

describe("/hitl:init points an earlier-layout collision to --adopt", () => {
  it("says adopt moves the doctrine or reviewer context in the way", () => {
    const text = readFileSync(join(ROOT, "commands/init.md"), "utf8");
    expect(text).toContain(
      "A doctrine or reviewer context from the earlier layout is in the way: `/hitl:init --adopt` moves it.",
    );
  });
});

describe("/hitl:init accepts a GitLab repository", () => {
  it("checks the token, writes the provider and hints GITLAB_URL; no v1-only refusal", () => {
    const text = readFileSync(join(ROOT, "commands/init.md"), "utf8");
    expect(text).toContain("GITLAB_TOKEN");
    expect(text).toContain('"provider": "<github|gitlab>"');
    expect(text).toContain("GITLAB_URL");
    expect(text).not.toContain("in v1");
  });
});

describe("the umbrella PR body says where the documents go", () => {
  it("the installed handover agent no longer promises removal from main after merge", () => {
    const text = renderAll(ROOT, THIS_REPO_CHOICES).get(".claude/agents/handover.md")!.content;
    expect(text).not.toContain("removed from `main` after merge");
    expect(text).toContain(
      "leave through the generated wipe PR before\nthis feature merges into `main`",
    );
  });
});

describe("the plugin runs on GitLab without an install", () => {
  function filesUnder(dir: string): string[] {
    return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
      .map((p) => join(ROOT, dir, p))
      .filter((p) => statSync(p).isFile());
  }

  it("no command, agent, template or the README still refuses every host but GitHub", () => {
    const files = [
      ...filesUnder("commands"),
      ...filesUnder("agents"),
      ...filesUnder("templates"),
      join(ROOT, "README.md"),
    ];
    const offenders = files.filter((f) => {
      const t = readFileSync(f, "utf8");
      return (
        t.includes("issues/19") ||
        t.includes("not-github") ||
        t.includes("--require no-install,github")
      );
    });
    expect(offenders).toEqual([]);
  });

  for (const c of ["implement-stack", "umbrella-pr"])
    it(`commands/${c}.md requires a host with a backend and prints the refusal line`, () => {
      const text = readFileSync(join(ROOT, `commands/${c}.md`), "utf8");
      expect(text).toContain("--require no-install,host,gates");
      expect(text).toContain('refused: "no-backend"');
      expect(text).toContain(REFUSAL);
      expect(text).toContain("If the output also has a `problem`, print it");
    });
});

describe("/hitl:diff and the move to .hitl/", () => {
  const text = readFileSync(join(ROOT, "commands/diff.md"), "utf8");
  it("carries the fixed copy", () => {
    expect(text).toContain("moved from <from>");
    expect(text).toContain(
      "hitl's files now live in `.hitl/`. Everyone working on this repository must update the hitl plugin to 0.3.0 or newer; an older plugin no longer recognises this repository as installed.",
    );
    expect(text).toContain(
      "`CLAUDE.md` has no `@HITL.md` line, so nothing there was changed; if the doctrine should load, add `@.hitl/HITL.md`.",
    );
    expect(text).toContain('refused: "move-collision"');
    expect(text).toContain("leftovers");
  });
});

const UPGRADE = "This repository uses an older hitl layout. Run /hitl:diff --apply to upgrade it.";

describe("the old layout is refused with one message", () => {
  for (const c of ["brainstorming", "customize", "cleanup", "help", "init"])
    it(`/hitl:${c} carries it`, () => {
      expect(readFileSync(join(ROOT, `commands/${c}.md`), "utf8")).toContain(UPGRADE);
    });
  it("/hitl:init --adopt stops on state `old layout` with it, before asking", () => {
    const text = readFileSync(join(ROOT, "commands/init.md"), "utf8");
    const adopt = text.slice(text.indexOf("## `--adopt`"), text.indexOf("## 2. "));
    const step4 = adopt.slice(adopt.indexOf("\n4. "), adopt.indexOf("\n5. "));
    expect(step4).toContain("State `old layout`");
    expect(step4).toContain(UPGRADE);
    expect(step4.indexOf("State `old layout`")).toBeLessThan(step4.indexOf("Any other state"));
    const refusal = adopt.slice(adopt.indexOf('refused: "manifest-present"'));
    expect(refusal.slice(0, refusal.indexOf("\n   - exit"))).toContain('`layout: "old"`');
    expect(refusal.slice(0, refusal.indexOf("\n   - exit"))).toContain("the upgrade message");
  });
  it("/hitl:diff does not refuse", () => {
    expect(readFileSync(join(ROOT, "commands/diff.md"), "utf8")).not.toContain(UPGRADE);
  });
});

describe("/hitl:init --adopt and the move to .hitl/", () => {
  const text = readFileSync(join(ROOT, "commands/init.md"), "utf8");
  it("carries the fixed copy", () => {
    expect(text).toContain('refused: "move-collision"');
    expect(text).toContain("moved <from> → <to>");
    expect(text).toContain(
      "The agents and commands in `.claude/` still name the old paths. `/hitl:diff` shows them as locally edited: take the upstream text for those lines.",
    );
    expect(text).toContain(
      "`CLAUDE.md` has no `@HITL.md` line, so nothing there was changed; if the doctrine should load, add `@.hitl/HITL.md`.",
    );
  });
});

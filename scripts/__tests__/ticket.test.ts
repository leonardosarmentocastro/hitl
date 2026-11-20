// scripts/__tests__/ticket.test.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAll, renderPlugin, THIS_REPO_CHOICES } from "../../installer/lib.mjs";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "templates/scripts/ticket.sh");
const DIR = mkdtempSync(join(tmpdir(), "ticket-"));
let n = 0;

function spec(header: string, body = "body"): string {
  n += 1;
  const p = join(DIR, `spec-${n}.md`);
  writeFileSync(p, `# T\n\n${header}\n\n## Goal\n\n${body}\n`);
  return p;
}

function run(...paths: string[]) {
  return spawnSync("sh", [SCRIPT, ...paths], { encoding: "utf8" });
}

const L = "[PROJ-1: Short TL;DR](https://acme.atlassian.net/browse/PROJ-1)";

function expectOk(r: ReturnType<typeof run>, out: string) {
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe(out);
  expect(r.stderr).toBe("");
}

function expectRefused(r: ReturnType<typeof run>, message: string, out = "") {
  expect(r.status).toBe(2);
  expect(r.stdout.trim()).toBe(out);
  expect(r.stderr).toContain(message);
  expect(r.stderr.trim().split("\n")).toHaveLength(1);
}

describe("ticket.sh", () => {
  it("reads a link", () => {
    expectOk(run(spec(`**Ticket:** ${L}`)), L);
  });

  it("reads none", () => {
    expectOk(run(spec("**Ticket:** none")), "none");
  });

  it("none ignores case, spaces and one period", () => {
    expectOk(run(spec("**Ticket:**   None. ")), "none");
  });

  it("no line is none", () => {
    expectOk(run(spec("**Review mode:** simple")), "none");
  });

  it("a line below the first ## is ignored", () => {
    expectOk(run(spec("**Owns:** x", `**Ticket:** ${L}`)), "none");
  });

  it("the first line in the header wins", () => {
    expectOk(run(spec(`**Ticket:** ${L}\n**Ticket:** none`)), L);
  });

  it("two specs, two tickets, in order", () => {
    const b = "[B](https://b.example/2)";
    expectOk(run(spec(`**Ticket:** ${L}`), spec(`**Ticket:** ${b}`)), `${L}\n${b}`);
  });

  it("the same URL twice: the first label wins", () => {
    expectOk(
      run(
        spec(`**Ticket:** ${L}`),
        spec("**Ticket:** [other](https://acme.atlassian.net/browse/PROJ-1)"),
      ),
      L,
    );
  });

  it("a ticket and a none", () => {
    expectOk(run(spec(`**Ticket:** ${L}`), spec("**Ticket:** none")), L);
  });

  it("refuses free text", () => {
    expectRefused(run(spec("**Ticket:** PROJ-1")), "invalid value 'PROJ-1'");
  });

  it("refuses an empty value", () => {
    expectRefused(run(spec("**Ticket:**")), "invalid value ''");
  });

  it("refuses a non-http URL", () => {
    for (const v of ["[x](ftp://a/b)", "[x](javascript:alert(1))"])
      expectRefused(run(spec(`**Ticket:** ${v}`)), "invalid value");
  });

  it("refuses a URL with a space or a )", () => {
    for (const v of ["[x](https://a/b c)", "[x](https://a/b)c)"])
      expectRefused(run(spec(`**Ticket:** ${v}`)), "invalid value");
  });

  it("refuses ], @ or a backtick in the label", () => {
    for (const v of ["[a]b](https://a/b)", "[hi @sam](https://a/b)", "[a`b](https://a/b)"])
      expectRefused(run(spec(`**Ticket:** ${v}`)), "invalid value");
  });

  it("refuses an empty label, and trailing text", () => {
    for (const v of ["[](https://a/b)", `${L} extra`])
      expectRefused(run(spec(`**Ticket:** ${v}`)), "invalid value");
  });

  it("one bad spec keeps the good one", () => {
    const bad = spec("**Ticket:** nope");
    expectRefused(run(spec(`**Ticket:** ${L}`), bad), `ticket: ${bad}: invalid value 'nope'`, L);
  });

  it("refuses a missing file", () => {
    const missing = join(DIR, "does-not-exist.md");
    expectRefused(run(missing), `ticket: ${missing}: no such file`);
  });

  it("refuses no arguments", () => {
    expectRefused(run(), "ticket: usage: ticket.sh <spec>...");
  });
});

describe("the ticket in the prompts", () => {
  it("/review-spec asks for the ticket once and checks the answer before writing", () => {
    const installed = renderAll(ROOT, THIS_REPO_CHOICES).get(
      ".claude/commands/review-spec.md",
    )!.content;
    const plugin = renderPlugin(ROOT).get("commands/review-spec.md")!.content;
    for (const t of [installed, plugin]) {
      // The template wraps at 100 columns: compare with whitespace collapsed.
      const s = t.slice(t.indexOf("### Ticket")).replace(/\s+/g, " ");
      expect(t.indexOf("### Ticket")).toBeGreaterThan(t.indexOf("### Mode"));
      expect(s).toContain(
        "Is there a ticket for this? Paste its link — and its title, if you want it shown — or say none.",
      );
      expect(s).toContain("already gave a ticket link in this session");
      expect(s).toContain('git commit -m "docs(spec): record ticket" -- "$SPEC"');
      expect(s).toContain("ask again");
      expect(s).toContain("capital letters and digits, a dash, digits");
      expect(s).toContain("`@` and backticks are dropped");
      expect(s).toContain("`[` and `]` are written as `(` and `)`");
      expect(s).toContain("Never fetch anything from the tracker");
      expect(s).toContain("remove the line, commit nothing");
      expect(s).toContain("not a dry run");
    }
    expect(installed).toContain('scripts/hitl/ticket.sh "$SPEC"');
    expect(plugin).toContain('"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh" "$SPEC"');
  });

  it("both PR bodies start with the ticket line, and a refusal never stops the run", () => {
    const installed = renderAll(ROOT, THIS_REPO_CHOICES);
    const stack = installed.get(".claude/commands/implement-stack.md")!.content;
    const body = stack.slice(stack.indexOf("Body (write it"));
    expect(body.indexOf("### <ticket line>")).toBeGreaterThan(-1);
    expect(body.indexOf("### <ticket line>")).toBeLessThan(body.indexOf("## TL;DR"));
    expect(stack).toContain("scripts/hitl/ticket.sh <every Spec(s): path>");
    expect(stack).toContain("is never a STOP");
    const agent = installed.get(".claude/agents/handover.md")!.content;
    const umbrella = agent.slice(agent.indexOf("\n## Umbrella PR body\n"));
    expect(umbrella.indexOf("### <ticket line>")).toBeGreaterThan(-1);
    expect(umbrella.indexOf("### <ticket line>")).toBeLessThan(umbrella.indexOf("## TL;DR"));
    expect(agent).toContain("the body starts at `## TL;DR`");
    expect(agent).toContain("scripts/hitl/ticket.sh <every Spec(s): path>");
    expect(agent).toContain("report the refusal in your reply");
    const plugin = renderPlugin(ROOT);
    for (const f of ["commands/implement-stack.md", "agents/handover.md"])
      expect(plugin.get(f)!.content).toContain(
        '"${CLAUDE_PLUGIN_ROOT}/runtime/ticket.sh" <every Spec(s): path>',
      );
  });

  it("the doctrine defines the Ticket line and names it load-bearing", () => {
    const doc = renderAll(ROOT, THIS_REPO_CHOICES).get(".hitl/HITL.md")!.content;
    const specs = doc.slice(doc.indexOf("## Specs and plans"), doc.indexOf("## Review gates"));
    expect(specs).toContain("`**Ticket:**`");
    const pr = doc.slice(doc.indexOf("## Pull requests"), doc.indexOf("## Delivery slices"));
    expect(pr).toContain("`### [<label>](<url>)`");
    const inv = doc.slice(doc.indexOf("## Load-bearing invariants"));
    expect(inv).toContain("The `**Ticket:**` header line of a spec");
    expect(readFileSync(join(ROOT, "commands/customize.md"), "utf8")).toContain(
      "the `**Ticket:**` line",
    );
  });
});

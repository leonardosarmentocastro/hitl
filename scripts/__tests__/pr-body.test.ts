// scripts/__tests__/pr-body.test.ts
// PR bodies open with a short bullet TL;DR and a Why. A slice body then shows `## Needs you`
// only when something asks for the human, and folds what only agents read (`Plan:` and
// `## Review decisions`) into one `<details>` block, last. The umbrella body and the doctrine
// say the same.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAll, THIS_REPO_CHOICES } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("PR body TL;DR (installed render)", () => {
  it("the slice body is TL;DR bullets, Why, Needs you, then the agent fold", () => {
    const installed = renderAll(ROOT, THIS_REPO_CHOICES);
    const text = installed.get(".claude/commands/implement-stack.md")!.content;
    const slice = installed.get(".claude/commands/review-slice.md")!.content;
    const body = text.slice(text.indexOf("Body (write it"));
    const i = (s: string) => body.indexOf(s);
    expect(i("## TL;DR")).toBeGreaterThan(-1);
    expect(i("## Why")).toBeGreaterThan(i("## TL;DR"));
    expect(i("## Needs you")).toBeGreaterThan(i("## Why"));
    expect(i("<details>")).toBeGreaterThan(i("## Needs you"));
    expect(i("<summary>For agents — skip when reviewing</summary>")).toBeGreaterThan(
      i("<details>"),
    );
    expect(i("\nPlan: <plan path>\n")).toBeGreaterThan(i("<summary>"));
    expect(i("## Review decisions")).toBeGreaterThan(i("\nPlan: <plan path>\n"));
    expect(i("</details>")).toBeGreaterThan(i("## Review decisions"));
    // Blank lines inside the fold, or the Markdown in it does not render.
    expect(body).toContain("</summary>\n\nPlan: <plan path>\n");
    expect(body).toContain("\n\n</details>");
    expect(slice).toContain("that PR's body `## Review decisions` and `## Needs you`");
    for (const gone of ["What — ", "How — ", "## What"]) expect(i(gone)).toBe(-1);
    expect(body).toContain("never more than three bullets");
    expect(body).toContain("No visible change:");
    expect(body).toContain("omit the whole section when there is none");
    // The security follow-up line now goes to Needs you, in both commands.
    expect(text).toMatch(/did not run for this slice\."\s+under the PR body's `## Needs you`/);
    expect(slice).toMatch(/marked\s+it 🟠, tell the human under the PR body's `## Needs you`/);
    expect(slice).toContain("`## Needs you` block");
    // A fix-up posts a comment, not a body: its Needs-you lines open that comment.
    expect(text).toContain("The comment opens with a `## Needs you` block when there is one");
  });

  it("the umbrella body is TL;DR bullets, Why and Slices — no Plan line, no Notes, no fold", () => {
    const installed = renderAll(ROOT, THIS_REPO_CHOICES);
    const agent = installed.get(".claude/agents/handover.md")!.content;
    // `## Fix-up` is also named in prose above the template: search from the umbrella heading.
    const start = agent.indexOf("\n## Umbrella PR body\n");
    const body = agent.slice(start, agent.indexOf("\n## Fix-up\n", start));
    expect(body.length).toBeGreaterThan(0);
    const i = (s: string) => body.indexOf(s);
    expect(i("## TL;DR")).toBeGreaterThan(-1);
    expect(i("## Why")).toBeGreaterThan(i("## TL;DR"));
    expect(i("## Slices")).toBeGreaterThan(i("## Why"));
    expect(i("<!-- stack -->")).toBeGreaterThan(i("## Slices"));
    for (const gone of ["Plan:", "## Notes", "**What**", "**How**", "<details>", "durable record"])
      expect(i(gone)).toBe(-1);
    expect(body).toContain("never one bullet per slice");
    const cmd = installed.get(".claude/commands/umbrella-pr.md")!.content;
    expect(cmd).toContain("everything under the handover document's `## Umbrella PR body` heading");
    expect(cmd).toContain("`## TL;DR`, `## Why`, `## Slices` or `## Notes`");
    expect(cmd).toContain("opens as it is");
    expect(cmd).not.toContain("everything from `Plan:`");
  });

  it("the doctrine states the shape, and tuning cannot remove the reader rule", () => {
    const installed = renderAll(ROOT, THIS_REPO_CHOICES);
    const doc = installed.get(".hitl/HITL.md")!.content;
    const pr = doc.slice(doc.indexOf("## Pull requests"), doc.indexOf("## Delivery slices"));
    expect(pr).toContain("`## TL;DR`");
    expect(pr).toContain("1 to 3 bullets");
    expect(pr).toContain("`## Needs you`");
    expect(pr).toContain("For agents — skip when reviewing");
    expect(pr).toContain("The umbrella PR carries no `Plan:` line");
    expect(pr).not.toContain("**How**");
    expect(pr).not.toContain("human reviewers");
    // What /hitl:customize may rewrite: from the line after an anchor to the next blank line
    // or the next anchor line.
    const ANCHOR = "<!-- hitl:knob pr-body-sections -->";
    const lines = readFileSync(join(ROOT, "templates/HITL.md"), "utf8").split("\n");
    const blocks: string[] = [];
    lines.forEach((l, n) => {
      if (l !== ANCHOR) return;
      let end = n + 1;
      while (end < lines.length && lines[end] !== "" && lines[end] !== ANCHOR) end += 1;
      blocks.push(lines.slice(n + 1, end).join("\n"));
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("`## TL;DR`");
    expect(blocks[1]).toContain("`## Review decisions`");
    for (const b of blocks)
      for (const fixed of [
        "Needs you",
        "only if it has a reader",
        "For agents — skip when reviewing",
        "Exempt",
      ])
        expect(b).not.toContain(fixed);
    expect(pr).toContain("A section enters a PR body only if it has a reader");
    expect(readFileSync(join(ROOT, "installer/lib.mjs"), "utf8")).not.toContain("durable record");
    expect(readFileSync(join(ROOT, "commands/customize.md"), "utf8")).toContain(
      "TL;DR bullets plus Why",
    );
  });
});

// scripts/__tests__/pr-body.test.ts
// PR bodies open with a short bullet TL;DR and a Why. A slice body then shows `## Needs you`
// only when something asks for the human, and folds what only agents read (`Plan:` and
// `## Review decisions`) into one `<details>` block, last. The umbrella body and the doctrine
// say the same.
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
    expect(i("<summary>For agents — skip when reviewing</summary>")).toBeGreaterThan(i("<details>"));
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
});

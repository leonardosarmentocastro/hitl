// scripts/__tests__/pr-body.test.ts
// PR bodies open with a TL;DR in both modes: the slice body keeps `Plan:` as its first line
// (the slice reviewer parses it), then `## TL;DR` holding What / Why / How, then
// `## Review decisions`. The umbrella body and the doctrine say the same.
import { describe, expect, it } from "vitest";
import { renderAll, THIS_REPO_CHOICES } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("PR body TL;DR (installed render)", () => {
  it("the slice body is Plan:, then ## TL;DR with What / Why / How, then ## Review decisions", () => {
    const installed = renderAll(ROOT, THIS_REPO_CHOICES);
    const text = installed.get(".claude/commands/implement-stack.md")!.content;
    // The command's prose names `## Review decisions` before the body block; search the block.
    const body = text.slice(text.indexOf("Body (write it"));
    const i = (s: string) => body.indexOf(s);
    expect(i("Plan: <plan path>")).toBeGreaterThan(-1);
    expect(i("## TL;DR")).toBeGreaterThan(i("Plan: <plan path>"));
    expect(i("What — ")).toBeGreaterThan(i("## TL;DR"));
    expect(i("## Review decisions")).toBeGreaterThan(i("How — "));
    expect(installed.get(".claude/agents/handover.md")!.content).toContain("## TL;DR");
    expect(installed.get("HITL.md")!.content).toContain("`## TL;DR`");
  });
});

// scripts/__tests__/plugin-drift.test.ts
// The plugin's no-install files are rendered from the same templates as the installed ones:
// every file `renderPlugin` produces must be checked in, byte for byte.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THIS_REPO_CHOICES, renderAll, renderMode, renderPlugin } from "../../installer/lib.mjs";

const ROOT = process.cwd();

describe("the plugin equals its no-install render", () => {
  const rendered = renderPlugin(ROOT);

  for (const [p, { content, executable }] of rendered) {
    it(`${p} matches its template`, () =>
      expect(readFileSync(join(ROOT, p), "utf8")).toBe(content));
    if (executable)
      it(`${p} is executable`, () => expect(statSync(join(ROOT, p)).mode & 0o111).not.toBe(0));
  }

  it("ships the PR shim byte-for-byte, executable", () => {
    const shim = rendered.get("runtime/pr/pr.sh");
    expect(shim?.content).toBe(readFileSync(join(ROOT, "templates/scripts/pr.sh"), "utf8"));
    expect(shim?.executable).toBe(true);
    expect(rendered.get("runtime/pr/backend.sh")?.content).toBe(
      readFileSync(join(ROOT, "templates/scripts/backends/github.sh"), "utf8"),
    );
  });

  const doc = rendered.get("doctrine/HITL.md")!.content;

  it("names no installed-only path", () => {
    expect(doc).not.toMatch(
      /scripts\/hitl\/|\.claude\/hooks\/|\.claude\/agents\/|\.claude\/commands\/|\.claude\/hitl\.json|grandfathered/,
    );
  });

  it("names no unprefixed workflow command", () => {
    expect(doc).not.toMatch(
      /(?<![\w/.:-])\/(review-spec|review-plan|review-slice|handover|implement-stack|umbrella-pr)(?![\w/-])/,
    );
  });

  it("keeps the load-bearing invariants identical to the installed doctrine, command names aside", () => {
    const section = (t: string) => t.slice(t.indexOf("## Load-bearing invariants"));
    const installed = section(renderAll(ROOT, THIS_REPO_CHOICES).get("HITL.md")!.content);
    // the section names workflow commands, which the no-install render prefixes; nothing else may differ
    expect(section(doc)).toBe(renderMode(installed, "no-install"));
  });

  it("carries no mode marker", () => expect(doc).not.toContain("hitl:mode"));

  it("never assumes the base branch is main", () => {
    expect(doc).not.toMatch(/origin\/main|`main`/);
    expect(doc).toContain("the base branch");
  });

  it("carries the project-memory rules every command inherits", () => {
    expect(doc).toContain("## Project memory");
    expect(doc).toContain("Remember this for this project?");
    expect(doc).toContain('node "<Plugin root>/installer/discover.mjs" --repo');
    expect(doc).toContain('node "<Plugin root>/runtime/memory.mjs" write --repo');
    expect(doc).toContain("--name gates");
    expect(renderAll(ROOT, THIS_REPO_CHOICES).get("HITL.md")!.content).not.toContain(
      "## Project memory",
    );
  });
});

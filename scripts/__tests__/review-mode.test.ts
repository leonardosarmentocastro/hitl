// scripts/__tests__/review-mode.test.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCRIPT = join(ROOT, "templates/scripts/review-mode.sh");
const DIR = mkdtempSync(join(tmpdir(), "review-mode-"));
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

function expectOk(r: ReturnType<typeof run>, word: string) {
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe(word);
  expect(r.stderr).toBe("");
}

function expectRefused(r: ReturnType<typeof run>, message: string) {
  expect(r.status).toBe(2);
  expect(r.stdout.trim()).toBe("");
  expect(r.stderr).toContain(message);
  expect(r.stderr.trim().split("\n")).toHaveLength(1);
}

describe("review-mode.sh", () => {
  it("reads elaborate", () => {
    expectOk(run(spec("**Review mode:** elaborate")), "elaborate");
  });

  it("reads simple", () => {
    expectOk(run(spec("**Review mode:** simple")), "simple");
  });

  it("no line is absent", () => {
    expectOk(run(spec("**Status:** draft")), "absent");
  });

  it("ignores case, spaces and a trailing period", () => {
    expectOk(run(spec("**Review mode:**   Elaborate. ")), "elaborate");
  });

  it("ignores a line below the first ##", () => {
    expectOk(run(spec("**Status:** x", "**Review mode:** elaborate")), "absent");
  });

  it("the first line in the header wins", () => {
    expectOk(run(spec("**Review mode:** simple\n**Review mode:** elaborate")), "simple");
  });

  it("refuses another value", () => {
    expectRefused(
      run(spec("**Review mode:** thorough")),
      "invalid value 'thorough' — use simple, elaborate or complete",
    );
  });

  it("refuses an empty value", () => {
    expectRefused(run(spec("**Review mode:**")), "invalid value ''");
  });

  it("refuses a missing file", () => {
    const missing = join(DIR, "does-not-exist.md");
    expectRefused(run(missing), `review-mode: ${missing}: no such file`);
  });

  it("refuses no arguments", () => {
    expectRefused(run(), "usage");
  });

  it("any elaborate wins", () => {
    expectOk(run(spec("**Review mode:** simple"), spec("**Review mode:** elaborate")), "elaborate");
  });

  it("simple beats absent", () => {
    expectOk(run(spec("**Status:** draft"), spec("**Review mode:** simple")), "simple");
  });

  it("an invalid value beats elaborate", () => {
    expectRefused(
      run(spec("**Review mode:** elaborate"), spec("**Review mode:** thorough")),
      "invalid value",
    );
  });

  it("reads complete", () => {
    expectOk(run(spec("**Review mode:** complete")), "complete");
  });

  it("reads Complete. with a capital and a period", () => {
    expectOk(run(spec("**Review mode:**  Complete. ")), "complete");
  });

  it("any complete wins", () => {
    expectOk(
      run(
        spec("**Review mode:** simple"),
        spec("**Review mode:** elaborate"),
        spec("**Review mode:** complete"),
      ),
      "complete",
    );
    expectOk(
      run(spec("**Review mode:** complete"), spec("**Review mode:** elaborate")),
      "complete",
    );
  });

  it("elaborate beats simple whatever the order", () => {
    expectOk(run(spec("**Review mode:** elaborate"), spec("**Review mode:** simple")), "elaborate");
  });

  it("an invalid value beats complete", () => {
    const bad = spec("**Review mode:** thorough");
    const r = run(spec("**Review mode:** complete"), bad);
    expectRefused(r, "invalid value");
    expect(r.stderr).toContain(bad);
  });

  it("the refusal names the three values", () => {
    expectRefused(run(spec("**Review mode:** thorough")), "use simple, elaborate or complete");
  });
});

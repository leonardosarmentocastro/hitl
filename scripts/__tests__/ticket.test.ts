// scripts/__tests__/ticket.test.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

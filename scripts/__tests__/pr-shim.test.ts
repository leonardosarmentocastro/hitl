// scripts/__tests__/pr-shim.test.ts
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FAKE_GH_DIR = join(ROOT, "scripts/__fixtures__/fake-gh");

/** Install the shim as init would: pr.sh + the github backend as backend.sh, side by side. */
function installShim() {
  const dir = mkdtempSync(join(tmpdir(), "hitl-shim-"));
  copyFileSync(join(ROOT, "templates/scripts/pr.sh"), join(dir, "pr.sh"));
  copyFileSync(join(ROOT, "templates/scripts/backends/github.sh"), join(dir, "backend.sh"));
  chmodSync(join(dir, "pr.sh"), 0o755);
  chmodSync(join(dir, "backend.sh"), 0o755);
  return dir;
}

function shim(args: string[], mode = "ok") {
  const dir = installShim();
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  const r = spawnSync(join(dir, "pr.sh"), args, {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${FAKE_GH_DIR}:${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_MODE: mode,
    },
  });
  const calls = readFileSync(log, "utf8").trim().split("\n").filter(Boolean);
  let json: unknown = null;
  try {
    json = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  } catch {
    json = { unparsable: r.stdout };
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, calls };
}

const RECORD = {
  number: 12,
  url: "https://github.com/o/r/pull/12",
  head: "feat/x-slice-1-api",
  base: "feat/x",
  state: "open",
  draft: true,
  title: "Slice 1: api",
  body: "Plan: docs/superpowers/plans/p.md",
};

describe("pr.sh view", () => {
  it("returns the record with reviews and comments and exit 0", () => {
    const r = shim(["view", "12"]);
    expect(r.status).toBe(0);
    expect(r.json).toEqual({
      ...RECORD,
      reviews: [{ author: "ana", state: "changes_requested", body: "rename it" }],
      comments: [{ author: "bo", body: "+1", created_at: "2026-09-16T10:00:00Z" }],
    });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatch(/^pr view 12 --json .*reviews.*comments.* --jq /);
  });
});

describe("pr.sh list", () => {
  it("returns an array of records for the head prefix, state all by default", () => {
    const r = shim(["list", "--head-prefix", "feat/x-slice-"]);
    expect(r.status).toBe(0);
    expect(Array.isArray(r.json)).toBe(true);
    expect((r.json as unknown[]).length).toBe(2);
    expect((r.json as { state: string }[])[1].state).toBe("merged");
    expect(r.calls[0]).toMatch(/^pr list --state all --limit \d+ --json .* --jq /);
    expect(r.calls[0]).toContain("feat/x-slice-");
  });

  it("passes --state through", () => {
    const r = shim(["list", "--head-prefix", "feat/x", "--state", "open"]);
    expect(r.status).toBe(0);
    expect(r.calls[0]).toContain("--state open");
  });
});

describe("pr.sh exit contract", () => {
  it("exits 2 and passes gh's stderr through on a backend failure", () => {
    const r = shim(["view", "12"], "fail");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("fake failure");
    expect(r.stdout).toBe("");
  });

  it("exits 1 on a usage error without calling gh", () => {
    for (const args of [
      [],
      ["view"],
      ["view", "abc"],
      ["list"],
      ["edit", "12"],
      ["create", "--base", "x"],
      ["nope"],
    ]) {
      const r = shim(args);
      expect(r.status, args.join(" ")).toBe(1);
      expect(r.stdout, args.join(" ")).toBe("");
      expect(r.calls, args.join(" ")).toHaveLength(0);
    }
  });
});

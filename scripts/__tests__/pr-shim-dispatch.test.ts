// scripts/__tests__/pr-shim-dispatch.test.ts
// The plugin's shim (runtime/pr/) ships both backends and picks one per call from the origin
// remote, by the host rule. The token only goes to the backend the remote selected.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type FakeGitlab, repoWithOrigin, startFakeGitlab } from "./helpers/gitlab";

const ROOT = process.cwd();
const SHIM = join(ROOT, "runtime/pr/pr.sh");
const FAKE_GH_DIR = join(ROOT, "scripts/__fixtures__/fake-gh");
const TOKEN = "glpat-dispatch";

let fake: FakeGitlab;

const MR = () => ({
  iid: 5,
  web_url: `${fake.url}/g/r/-/merge_requests/5`,
  source_branch: "feat/x-slice-1",
  target_branch: "feat/x",
  state: "opened",
  draft: true,
  title: "Draft: t",
  description: "",
  sha: "sha5",
  labels: ["hitl"],
});

beforeAll(async () => {
  fake = await startFakeGitlab({ mergeRequests: [], approvals: {}, discussions: {} });
});

afterAll(() => fake.stop());

beforeEach(() => {
  fake.setState({ mergeRequests: [MR()], approvals: {}, discussions: {} });
});

/** Run the plugin shim in `cwd` with the fake gh on PATH; returns the result and gh's log. */
function run(cwd: string, args: string[], env: Record<string, string>) {
  const logDir = mkdtempSync(join(tmpdir(), "hitl-dispatch-"));
  const log = join(logDir, "gh.log");
  writeFileSync(log, "");
  const base = { ...process.env };
  delete base.GITLAB_URL;
  delete base.GITLAB_TOKEN;
  const r = spawnSync(SHIM, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...base,
      PATH: `${FAKE_GH_DIR}:${process.env.PATH}`,
      FAKE_GH_LOG: log,
      FAKE_GH_MODE: "ok",
      ...env,
    },
  });
  const gh = readFileSync(log, "utf8").split("\n").filter(Boolean);
  let json: unknown = null;
  try {
    json = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  } catch {
    json = { unparsable: r.stdout };
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, gh };
}

const LIST = ["list", "--head-prefix", "feat/x-slice-"];

describe("the plugin shim picks the backend from the origin remote", () => {
  it("a GitHub remote answers from gh, even with GITLAB_URL and GITLAB_TOKEN set", () => {
    const r = run(repoWithOrigin("git@github.com:o/r.git"), LIST, {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.gh).toHaveLength(1);
    expect(r.gh[0]).toMatch(/^pr list /);
    expect(fake.requests()).toHaveLength(0);
  });

  it("a remote at GITLAB_URL answers from GitLab and never runs gh", () => {
    const r = run(repoWithOrigin(`${fake.url}/g/r.git`), LIST, {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.json).toEqual([expect.objectContaining({ number: 5, ref: "!5" })]);
    expect(r.gh).toHaveLength(0);
    expect(fake.requests().length).toBeGreaterThan(0);
  });

  it("a gitlab.com remote with no token is refused by the GitLab backend", () => {
    const r = run(repoWithOrigin("git@gitlab.com:g/r.git"), LIST, {});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GITLAB_TOKEN");
    expect(r.gh).toHaveLength(0);
  });

  const notRepo = () => mkdtempSync(join(tmpdir(), "hitl-dispatch-norepo-"));
  const noRemote = () => {
    const dir = mkdtempSync(join(tmpdir(), "hitl-dispatch-noremote-"));
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    return dir;
  };

  it.each([
    ["a Bitbucket remote", () => repoWithOrigin("git@bitbucket.org:o/r.git")],
    ["no origin remote", noRemote],
    ["not a repository", notRepo],
  ])("%s exits 2 with no PR backend, calling neither host", (_name, dir) => {
    const r = run(dir(), LIST, { GITLAB_URL: fake.url, GITLAB_TOKEN: TOKEN });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("no PR backend");
    expect(r.gh).toHaveLength(0);
    expect(fake.requests()).toHaveLength(0);
  });
});

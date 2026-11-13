// scripts/__tests__/memory.test.ts
// Per-project memory under ~/.hitl (HITL_HOME in tests): the project key, fact files and the
// gates fact.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FACT_TYPES,
  gatesOf,
  hitlHome,
  memoryDir,
  normalizeRemote,
  projectKey,
  readFacts,
  writeFact,
} from "../../runtime/memory.mjs";

const ROOT = process.cwd();
const CLI = join(ROOT, "runtime/memory.mjs");
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

function tmp(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/** A git repository with one commit, and the remotes asked for. */
function repo(remotes: Record<string, string> = {}): string {
  const dir = join(tmp("hitl-memory-repo-"), "Proj");
  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "commit", "-q", "--allow-empty", "-m", "init");
  for (const [name, url] of Object.entries(remotes)) git(dir, "remote", "add", name, url);
  return dir;
}

let savedHome: string | undefined;
let home: string;
beforeEach(() => {
  savedHome = process.env.HITL_HOME;
  home = tmp("hitl-home-");
  process.env.HITL_HOME = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env.HITL_HOME;
  else process.env.HITL_HOME = savedHome;
});

describe("normalizeRemote", () => {
  it("normalizes scp-style, https and ssh urls to <host>/<path>, lowercase", () => {
    expect(normalizeRemote("git@github.com:Acme/API.git")).toBe("github.com/acme/api");
    expect(normalizeRemote("https://user:tok@GitHub.com/Acme/API/")).toBe("github.com/acme/api");
    expect(normalizeRemote("ssh://git@GitLab.example.com:2222/Group/Sub/Repo.git")).toBe(
      "gitlab.example.com/group/sub/repo",
    );
  });

  it("never yields a key that escapes the projects folder", () => {
    expect(normalizeRemote("https://h.com/a/../../etc")).toBeNull();
    expect(normalizeRemote("")).toBeNull();
  });

  it("replaces characters outside [a-z0-9._-] in a segment", () => {
    expect(normalizeRemote("https://h.com/a b/c~d")).toBe("h.com/a-b/c-d");
  });
});

describe("projectKey and memoryDir", () => {
  it("uses origin when it is the only remote", () => {
    expect(projectKey(repo({ origin: "git@github.com:Acme/API.git" }))).toBe("github.com/acme/api");
  });

  it("prefers upstream over origin", () => {
    const r = repo({
      origin: "git@github.com:me/api.git",
      upstream: "git@github.com:Acme/API.git",
    });
    expect(projectKey(r)).toBe("github.com/acme/api");
  });

  it("falls back to local/<basename of the main checkout> with no remote", () => {
    const r = repo();
    expect(projectKey(r)).toBe(`local/${basename(r).toLowerCase()}`);
  });

  it("is the same from a linked worktree as from the main checkout", () => {
    const r = repo({ origin: "git@github.com:Acme/API.git" });
    const wt = join(tmp("hitl-wt-"), "wt");
    git(r, "worktree", "add", "-q", wt, "-b", "feat/x");
    expect(projectKey(wt)).toBe(projectKey(r));
    const local = repo();
    const lwt = join(tmp("hitl-wt-"), "other-name");
    git(local, "worktree", "add", "-q", lwt, "-b", "feat/y");
    expect(projectKey(lwt)).toBe(projectKey(local));
  });

  it("lives under HITL_HOME/projects/", () => {
    expect(hitlHome()).toBe(home);
    const r = repo({ origin: "git@github.com:Acme/API.git" });
    expect(memoryDir(r).startsWith(`${home}/projects/`)).toBe(true);
    expect(memoryDir(r)).toBe(join(home, "projects/github.com/acme/api"));
  });
});

describe("facts", () => {
  it("knows four fact types", () => {
    expect(FACT_TYPES).toEqual(["gates", "review-context", "pr-section", "quirk"]);
  });

  it("round-trips a fact and keeps one index line per fact", () => {
    const dir = join(home, "projects/x");
    const fact = {
      name: "gates",
      description: "The gates",
      type: "gates",
      body: "- `pnpm test`\n",
    };
    const path = writeFact(dir, fact);
    expect(path).toBe(join(dir, "gates.md"));
    expect(readFileSync(path, "utf8")).toBe(
      "---\nname: gates\ndescription: The gates\nmetadata:\n  type: gates\n---\n- `pnpm test`\n",
    );
    writeFact(dir, { ...fact, description: "The local gates" });
    writeFact(dir, { name: "shots", description: "Screenshots", type: "pr-section", body: "x\n" });
    const index = readFileSync(join(dir, "MEMORY.md"), "utf8");
    expect(index.split("\n").filter((l) => l.startsWith("- [gates]"))).toEqual([
      "- [gates](gates.md) — The local gates",
    ]);
    expect(index).toContain("- [shots](shots.md) — Screenshots");
    const { facts, skipped } = readFacts(dir);
    expect(skipped).toEqual([]);
    expect(facts).toEqual([
      { name: "gates", description: "The local gates", type: "gates", body: "- `pnpm test`\n" },
      { name: "shots", description: "Screenshots", type: "pr-section", body: "x\n" },
    ]);
  });

  it("skips malformed fact files by name and still returns the valid ones", () => {
    const dir = join(home, "projects/y");
    writeFact(dir, { name: "ok", description: "fine", type: "quirk", body: "b\n" });
    writeFileSync(join(dir, "junk.md"), "no frontmatter here\n");
    writeFileSync(
      join(dir, "nope.md"),
      "---\nname: nope\ndescription: d\nmetadata:\n  type: nope\n---\nbody\n",
    );
    const { facts, skipped } = readFacts(dir);
    expect(facts.map((f) => f.name)).toEqual(["ok"]);
    expect(skipped.sort()).toEqual(["junk.md", "nope.md"]);
  });

  it("reads an absent folder as no facts", () => {
    expect(readFacts(join(home, "projects/none"))).toEqual({ facts: [], skipped: [] });
  });

  it("refuses a fact name that is not kebab-case", () => {
    expect(() =>
      writeFact(join(home, "projects/z"), {
        name: "../x",
        description: "",
        type: "quirk",
        body: "",
      }),
    ).toThrow();
  });
});

describe("gatesOf", () => {
  it("is null without a gates fact, [] for none, else the commands", () => {
    expect(gatesOf([])).toBeNull();
    expect(gatesOf([{ name: "gates", description: "", type: "gates", body: "none\n" }])).toEqual(
      [],
    );
    expect(
      gatesOf([
        {
          name: "gates",
          description: "",
          type: "gates",
          body: "- `pnpm test`\n- `pnpm format:check`\n",
        },
      ]),
    ).toEqual(["pnpm test", "pnpm format:check"]);
  });
});

describe("memory.mjs CLI", () => {
  function cli(...args: string[]) {
    const r = spawnSync("node", [CLI, ...args], {
      encoding: "utf8",
      env: { ...ENV, HITL_HOME: home },
    });
    return { status: r.status, out: r.stdout ? JSON.parse(r.stdout) : null };
  }

  it("prints the key and folder", () => {
    const r = repo({ origin: "git@github.com:Acme/API.git" });
    expect(cli("key", "--repo", r)).toEqual({
      status: 0,
      out: { key: "github.com/acme/api", dir: join(home, "projects/github.com/acme/api") },
    });
  });

  it("writes a fact from a body file and lists it", () => {
    const r = repo({ origin: "git@github.com:Acme/API.git" });
    const body = join(tmp("hitl-body-"), "body.md");
    writeFileSync(body, "- `npm run verify`\n");
    const w = cli(
      "write",
      "--repo",
      r,
      "--name",
      "gates",
      "--type",
      "gates",
      "--description",
      "The local gates for this project",
      "--body-file",
      body,
    );
    expect(w.status).toBe(0);
    expect(w.out.wrote).toBe(join(home, "projects/github.com/acme/api/gates.md"));
    const l = cli("list", "--repo", r);
    expect(l.status).toBe(0);
    expect(l.out.key).toBe("github.com/acme/api");
    expect(l.out.facts).toEqual([
      {
        name: "gates",
        description: "The local gates for this project",
        type: "gates",
        body: "- `npm run verify`\n",
      },
    ]);
    expect(l.out.skipped).toEqual([]);
  });

  it("is a usage error for an unknown type or a missing argument", () => {
    const r = repo();
    const body = join(tmp("hitl-body-"), "body.md");
    writeFileSync(body, "x\n");
    expect(
      cli(
        "write",
        "--repo",
        r,
        "--name",
        "a",
        "--type",
        "nope",
        "--description",
        "d",
        "--body-file",
        body,
      ).status,
    ).toBe(1);
    expect(cli("key").status).toBe(1);
    expect(cli("bogus", "--repo", r).status).toBe(1);
  });
});

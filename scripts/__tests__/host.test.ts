// scripts/__tests__/host.test.ts
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hostOf, resolveHost } from "../../templates/scripts/host.mjs";

type Row = [
  remote: string | null,
  gitlabUrl: string | undefined,
  host: string,
  apiBase: string | undefined,
  project: string | undefined,
  problem: string | undefined,
];

const ROWS: Row[] = [
  ["git@github.com:o/r.git", undefined, "github", undefined, undefined, undefined],
  ["https://bitbucket.org/o/r", undefined, "bitbucket", undefined, undefined, undefined],
  ["https://gitlab.com/g/r.git", undefined, "gitlab", "https://gitlab.com", "g%2Fr", undefined],
  [
    "git@gitlab.com:g/sub/r.git",
    "https://gitlab.corp",
    "gitlab",
    "https://gitlab.com",
    "g%2Fsub%2Fr",
    undefined,
  ],
  [
    "git@GitLab.Corp:g/r.git",
    "https://gitlab.corp",
    "gitlab",
    "https://gitlab.corp",
    "g%2Fr",
    undefined,
  ],
  [
    "ssh://git@gitlab.corp:2222/g/r.git",
    "https://gitlab.corp/",
    "gitlab",
    "https://gitlab.corp",
    "g%2Fr",
    undefined,
  ],
  [
    "http://127.0.0.1:4010/g/r.git",
    "http://127.0.0.1:4010",
    "gitlab",
    "http://127.0.0.1:4010",
    "g%2Fr",
    undefined,
  ],
  [
    "https://host/gitlab/g/r.git",
    "https://host/gitlab",
    "gitlab",
    "https://host/gitlab",
    "g%2Fr",
    undefined,
  ],
  [
    "https://host/gitops/r.git",
    "https://host/git",
    "gitlab",
    "https://host/git",
    "gitops%2Fr",
    undefined,
  ],
  ["git@host:g/r.git", "https://host/gitlab", "gitlab", "https://host/gitlab", "g%2Fr", undefined],
  ["git@gitlab.corp:g/r.git", undefined, "unknown", undefined, undefined, undefined],
  ["git@gitlab.corp:g/r.git", "gitlab.corp", "unknown", undefined, undefined, "bad-gitlab-url"],
  ["git@gitlab.corp:g/r.git", "", "unknown", undefined, undefined, undefined],
  [
    "git@gitlab.corp:g/r.git",
    "https://gitlab.corp/api/v4",
    "unknown",
    undefined,
    undefined,
    "gitlab-url-has-api-path",
  ],
  [
    "git@gitlab.corp:g/r.git",
    "https://gitlab.corp/api/v4/",
    "unknown",
    undefined,
    undefined,
    "gitlab-url-has-api-path",
  ],
  [
    "git@gitlab.corp:g/r.git",
    "gitlab.corp:8443",
    "unknown",
    undefined,
    undefined,
    "bad-gitlab-url",
  ],
  ["git@other.corp:g/r.git", "https://gitlab.corp", "unknown", undefined, undefined, undefined],
  [null, undefined, "unknown", undefined, undefined, undefined],
];

describe("resolveHost", () => {
  it.each(ROWS)(
    "%s with GITLAB_URL=%s → %s",
    (remote, gitlabUrl, host, apiBase, project, problem) => {
      const env = gitlabUrl === undefined ? {} : { GITLAB_URL: gitlabUrl };
      const r = resolveHost(remote, env);
      expect(r.host).toBe(host);
      expect(r.apiBase).toBe(apiBase);
      expect(r.project).toBe(project);
      expect(r.problem).toBe(problem);
      expect(hostOf(remote, env)).toBe(host);
    },
  );

  it("reads process.env when no env is passed", () => {
    const saved = process.env.GITLAB_URL;
    process.env.GITLAB_URL = "https://gitlab.corp";
    try {
      expect(hostOf("git@gitlab.corp:g/r.git")).toBe("gitlab");
    } finally {
      if (saved === undefined) delete process.env.GITLAB_URL;
      else process.env.GITLAB_URL = saved;
    }
  });
});

describe("node host.mjs (the CLI)", () => {
  const CLI = join(process.cwd(), "templates/scripts/host.mjs");

  function dirWith(remote: string | null, repo = true): string {
    const dir = mkdtempSync(join(tmpdir(), "hitl-host-cli-"));
    if (repo) execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
    if (remote) execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
    return dir;
  }

  function run(dir: string, env: Record<string, string> = {}) {
    const base = { ...process.env };
    delete base.GITLAB_URL;
    return spawnSync("node", [CLI], { cwd: dir, encoding: "utf8", env: { ...base, ...env } });
  }

  it("prints github for a GitHub origin", () => {
    const r = run(dirWith("git@github.com:o/r.git"));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("github\n");
  });

  it("prints gitlab for a self-hosted origin matching GITLAB_URL", () => {
    const r = run(dirWith("git@gitlab.corp:g/r.git"), { GITLAB_URL: "https://gitlab.corp" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("gitlab\n");
  });

  it("prints unknown for a repository with no origin", () => {
    const r = run(dirWith(null));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("unknown\n");
  });

  it("prints unknown outside a git repository", () => {
    const r = run(dirWith(null, false));
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("unknown\n");
  });
});

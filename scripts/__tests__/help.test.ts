// scripts/__tests__/help.test.ts
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANIFEST_PATH, pluginVersion } from "../../installer/lib.mjs";

const PLUGIN_ROOT = process.cwd();
const CURRENT = pluginVersion(PLUGIN_ROOT);
const HELP = join(PLUGIN_ROOT, "installer/help.mjs");
const RENDER = join(PLUGIN_ROOT, "installer/render.mjs");

function tempDir(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hitl-help-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

function installed() {
  const repo = tempDir();
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  const answers = join(repo, "..", `answers-${Math.random()}.json`);
  writeFileSync(answers, JSON.stringify({ provider: "github", testing: [], gates: [] }));
  const r = spawnSync(
    "node",
    [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answers],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(0);
  return repo;
}

function setVersion(repo: string, version: string) {
  const p = join(repo, MANIFEST_PATH);
  const m = JSON.parse(readFileSync(p, "utf8"));
  m.version = version;
  writeFileSync(p, JSON.stringify(m));
}

function help(repo: string, home: string = tempDir()) {
  const r = spawnSync(
    "node",
    [HELP, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--home", home],
    { encoding: "utf8" },
  );
  return { ...r, json: r.stdout ? JSON.parse(r.stdout) : null };
}

describe("help.mjs states", () => {
  it("not installed", () => {
    const r = help(tempDir({ "README.md": "hi\n" }));
    expect(r.status).toBe(0);
    expect(r.json.state).toBe("not installed");
    expect(r.json.manifestVersion).toBeNull();
    expect(r.json.locallyEdited).toBeNull();
  });

  it("not installed when only the old wipe workflow is present (no longer an owned path)", () => {
    const r = help(tempDir({ ".github/workflows/wipe-superpowers-docs.yml": "name: wipe\n" }));
    expect(r.json.state).toBe("not installed");
  });

  it("ejected (agents dir and HITL.md, no manifest)", () => {
    const r = help(tempDir({ "HITL.md": "# HITL\n", ".claude/agents/fixer.md": "x\n" }));
    expect(r.json.state).toBe("ejected");
  });

  it("ejected (agents dir and .hitl/HITL.md, no manifest)", () => {
    const r = help(tempDir({ ".hitl/HITL.md": "# HITL\n", ".claude/agents/fixer.md": "x\n" }));
    expect(r.json.state).toBe("ejected");
  });

  it("partially installed (some owned path, not both of the above)", () => {
    expect(help(tempDir({ "scripts/hitl/pr.sh": "" })).json.state).toBe("partially installed");
    expect(help(tempDir({ "HITL.md": "# HITL\n" })).json.state).toBe("partially installed");
  });

  it("up to date, behind and ahead by the manifest version", () => {
    const repo = installed();
    expect(help(repo).json.state).toBe("up to date");
    expect(help(repo).json.manifestVersion).toBe(CURRENT);
    setVersion(repo, "0.0.1");
    expect(help(repo).json.state).toBe("behind");
    setVersion(repo, "9.9.9");
    expect(help(repo).json.state).toBe("ahead");
  });

  it("counts locally edited owned files against the manifest", () => {
    const repo = installed();
    expect(help(repo).json.locallyEdited).toBe(0);
    appendFileSync(join(repo, ".claude/agents/fixer.md"), "\nours\n");
    expect(help(repo).json.locallyEdited).toBe(1);
  });

  it("counts a deleted owned file as missing, never as locally edited", () => {
    const repo = installed();
    expect(help(repo).json.missing).toBe(0);
    rmSync(join(repo, ".claude/agents/handover.md"));
    const json = help(repo).json;
    expect(json.locallyEdited).toBe(0);
    expect(json.missing).toBe(1);
    expect(help(tempDir()).json.missing).toBeNull();
  });
});

describe("help.mjs prerequisites", () => {
  it("finds superpowers in the home or the repository settings, and probes the tools", () => {
    const repo = installed();
    const none = help(repo).json.prerequisites;
    expect(none.node).toBe(true);
    expect(typeof none.git).toBe("boolean");
    expect(typeof none.gh).toBe("boolean");
    expect(none.superpowers).toBe(false);

    const home = tempDir({
      ".claude/settings.json": JSON.stringify({
        enabledPlugins: { "superpowers@claude-plugins-official": true },
      }),
    });
    expect(help(repo, home).json.prerequisites.superpowers).toBe(true);

    const projectScoped = installed();
    const p = join(projectScoped, ".claude/settings.json");
    const s = JSON.parse(readFileSync(p, "utf8"));
    s.enabledPlugins = { "superpowers@superpowers-marketplace": true };
    writeFileSync(p, JSON.stringify(s));
    expect(help(projectScoped).json.prerequisites.superpowers).toBe(true);
  });
});

/** A GitLab install whose origin remote is `remote`. */
function installedGitlab(remote: string) {
  const repo = tempDir();
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
  spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo });
  const answers = join(repo, "..", `answers-${Math.random()}.json`);
  writeFileSync(answers, JSON.stringify({ provider: "gitlab", testing: [], gates: [] }));
  const r = spawnSync(
    "node",
    [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answers],
    { encoding: "utf8" },
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  return repo;
}

/** help.mjs with GITLAB_TOKEN and GITLAB_URL taken from `vars` only. */
function helpWith(repo: string, vars: Record<string, string>) {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.GITLAB_TOKEN;
  delete env.GITLAB_URL;
  const r = spawnSync(
    "node",
    [HELP, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--home", tempDir()],
    { encoding: "utf8", env: { ...env, ...vars } },
  );
  expect(r.status, r.stdout + r.stderr).toBe(0);
  return { stdout: r.stdout, json: JSON.parse(r.stdout) };
}

describe("help.mjs prerequisites by provider", () => {
  it("on gitlab.com: the token, GITLAB_URL not needed, no gh", () => {
    const repo = installedGitlab("git@gitlab.com:g/r.git");
    const json = helpWith(repo, { GITLAB_TOKEN: "t" }).json;
    expect(json.provider).toBe("gitlab");
    expect(json.prerequisites.gitlabToken).toBe(true);
    expect(json.prerequisites.gitlabUrl).toBe("not-needed");
    expect(json.prerequisites).not.toHaveProperty("gh");
    expect(json.prerequisites.node).toBe(true);
    expect(typeof json.prerequisites.git).toBe("boolean");
    expect(json.prerequisites.superpowers).toBe(false);
  });

  it("reports an unset or empty token as false", () => {
    const repo = installedGitlab("git@gitlab.com:g/r.git");
    expect(helpWith(repo, {}).json.prerequisites.gitlabToken).toBe(false);
    expect(helpWith(repo, { GITLAB_TOKEN: "" }).json.prerequisites.gitlabToken).toBe(false);
  });

  it("on a self-hosted remote: GITLAB_URL missing, set or invalid", () => {
    const repo = installedGitlab("git@gitlab.corp:g/r.git");
    expect(helpWith(repo, {}).json.prerequisites.gitlabUrl).toBe("missing");
    expect(helpWith(repo, { GITLAB_URL: "https://gitlab.corp" }).json.prerequisites.gitlabUrl).toBe(
      "set",
    );
    const bad = helpWith(repo, { GITLAB_URL: "gitlab.corp" }).json.prerequisites;
    expect(bad.gitlabUrl).toBe("invalid");
    expect(bad.gitlabUrlProblem).toBe("bad-gitlab-url");
    const api = helpWith(repo, { GITLAB_URL: "https://gitlab.corp/api/v4" }).json.prerequisites;
    expect(api.gitlabUrl).toBe("invalid");
    expect(api.gitlabUrlProblem).toBe("gitlab-url-has-api-path");
  });

  it("reads the provider from the manifest even when the remote no longer matches", () => {
    const repo = installedGitlab("git@elsewhere.example:g/r.git");
    const json = helpWith(repo, { GITLAB_URL: "https://gitlab.corp" }).json;
    expect(json.provider).toBe("gitlab");
    expect(json.prerequisites.gitlabUrl).toBe("mismatch");
    expect(helpWith(repo, {}).json.prerequisites.gitlabUrl).toBe("missing");
  });

  it("with a GitLab manifest and no origin remote, says the remote is missing", () => {
    const repo = installedGitlab("git@gitlab.com:g/r.git");
    spawnSync("git", ["remote", "remove", "origin"], { cwd: repo });
    expect(helpWith(repo, {}).json.prerequisites.gitlabUrl).toBe("no-remote");
    expect(helpWith(repo, { GITLAB_URL: "https://gitlab.corp" }).json.prerequisites.gitlabUrl).toBe(
      "no-remote",
    );
  });

  for (const [remote, provider] of [
    ["git@bitbucket.org:o/r.git", "bitbucket"],
    ["git@elsewhere.example:o/r.git", "unknown"],
  ]) {
    it(`without a manifest, a ${provider} remote falls back to the gh probe`, () => {
      const repo = tempDir();
      spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
      spawnSync("git", ["remote", "add", "origin", remote], { cwd: repo });
      const json = helpWith(repo, {}).json;
      expect(json.provider).toBe(provider);
      expect(typeof json.prerequisites.gh).toBe("boolean");
      expect(json.prerequisites).not.toHaveProperty("gitlabToken");
      expect(json.prerequisites).not.toHaveProperty("gitlabUrl");
    });
  }

  it("without a manifest, takes the provider from a GitHub remote and probes gh", () => {
    const repo = tempDir();
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    spawnSync("git", ["remote", "add", "origin", "git@github.com:o/r.git"], { cwd: repo });
    const json = helpWith(repo, {}).json;
    expect(json.provider).toBe("github");
    expect(typeof json.prerequisites.gh).toBe("boolean");
    expect(json.prerequisites).not.toHaveProperty("gitlabToken");
  });

  it("never prints the token's value", () => {
    const repo = installedGitlab("git@gitlab.com:g/r.git");
    const secret = "glpat-secret-value-12345";
    expect(helpWith(repo, { GITLAB_TOKEN: secret }).stdout).not.toContain(secret);
  });
});

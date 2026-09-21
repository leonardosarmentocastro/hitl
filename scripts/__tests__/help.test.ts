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

const PLUGIN_ROOT = process.cwd();
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
  writeFileSync(
    answers,
    JSON.stringify({ provider: "github", ci: "github-actions", testing: [], gates: [] }),
  );
  const r = spawnSync(
    "node",
    [RENDER, "--repo", repo, "--plugin-root", PLUGIN_ROOT, "--answers", answers],
    { encoding: "utf8" },
  );
  expect(r.status).toBe(0);
  return repo;
}

function setVersion(repo: string, version: string) {
  const p = join(repo, ".claude/hitl.json");
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

  it("ejected (agents dir and HITL.md, no manifest)", () => {
    const r = help(tempDir({ "HITL.md": "# HITL\n", ".claude/agents/fixer.md": "x\n" }));
    expect(r.json.state).toBe("ejected");
  });

  it("partially installed (some owned path, not both of the above)", () => {
    expect(help(tempDir({ "scripts/hitl/pr.sh": "" })).json.state).toBe("partially installed");
    expect(help(tempDir({ "HITL.md": "# HITL\n" })).json.state).toBe("partially installed");
  });

  it("up to date, behind and ahead by the manifest version", () => {
    const repo = installed();
    expect(help(repo).json.state).toBe("up to date");
    expect(help(repo).json.manifestVersion).toBe("0.1.0");
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

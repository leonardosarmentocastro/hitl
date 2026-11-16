// scripts/__tests__/helpers/gitlab.ts — a fake GitLab in its own process, and a PR shim
// assembled from the templates with the GitLab backend.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const SERVER = join(ROOT, "scripts/__fixtures__/fake-gitlab/server.mjs");

export type GitlabState = {
  mode?: "ok" | "fail" | "redirect";
  project?: string;
  mergeRequests: Record<string, unknown>[];
  approvals: Record<string, { approved_by: { user: { username: string } }[] }>;
  discussions: Record<string, Record<string, unknown>[]>;
};

export type Req = {
  method: string;
  path: string;
  query: Record<string, string>;
  token: string | null;
  body: unknown;
};

export type FakeGitlab = {
  url: string;
  setState(s: GitlabState): void;
  requests(): Req[];
  stop(): void;
};

/** Spawn the fake server; resolves once it prints its port. setState also clears the log. */
export function startFakeGitlab(state: GitlabState): Promise<FakeGitlab> {
  const dir = mkdtempSync(join(tmpdir(), "hitl-fake-gitlab-"));
  const stateFile = join(dir, "state.json");
  const log = join(dir, "requests.log");
  writeFileSync(stateFile, JSON.stringify(state));
  writeFileSync(log, "");
  const child = spawn("node", [SERVER, "--state", stateFile, "--log", log], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  return new Promise((resolve, reject) => {
    let out = "";
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`fake gitlab exited with ${code}`)));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
      const nl = out.indexOf("\n");
      if (nl === -1) return;
      const { port } = JSON.parse(out.slice(0, nl));
      resolve({
        url: `http://127.0.0.1:${port}`,
        setState(s) {
          writeFileSync(stateFile, JSON.stringify(s));
          writeFileSync(log, "");
        },
        requests() {
          return readFileSync(log, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((l) => JSON.parse(l));
        },
        stop() {
          child.kill();
        },
      });
    });
  });
}

/** A temp directory (copies keep the source mode) holding pr.sh, the GitLab backend as backend.sh, gitlab.mjs and host.mjs. */
export function gitlabShimDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hitl-gitlab-shim-"));
  const t = (p: string) => join(ROOT, "templates/scripts", p);
  copyFileSync(t("pr.sh"), join(dir, "pr.sh"));
  copyFileSync(t("backends/gitlab.sh"), join(dir, "backend.sh"));
  copyFileSync(t("backends/gitlab.mjs"), join(dir, "gitlab.mjs"));
  copyFileSync(t("host.mjs"), join(dir, "host.mjs"));
  return dir;
}

/** A temp git repository whose origin is `remoteUrl`. */
export function repoWithOrigin(remoteUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hitl-gitlab-repo-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", remoteUrl], { cwd: dir });
  return dir;
}

/** Run the shim in `repo`. GITLAB_URL and GITLAB_TOKEN come only from `env`. */
export function runGitlabShim(
  shimDir: string,
  repo: string,
  args: string[],
  env: Record<string, string>,
) {
  const base = { ...process.env };
  delete base.GITLAB_URL;
  delete base.GITLAB_TOKEN;
  const r = spawnSync(join(shimDir, "pr.sh"), args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...base, ...env },
  });
  let json: unknown = null;
  try {
    json = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
  } catch {
    json = { unparsable: r.stdout };
  }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

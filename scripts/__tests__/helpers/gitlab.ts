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
  failFromPage?: number;
  htmlFromPage?: number;
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
  /** The state file as the fake left it (writes rewrite it). */
  state(): GitlabState;
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
        state() {
          return JSON.parse(readFileSync(stateFile, "utf8"));
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

/** A PR as the contract suite seeds it, whichever the backend. */
export type SeedPr = {
  number: number;
  head: string;
  base: string;
  state: "open" | "merged" | "closed";
  draft: boolean;
  title: string;
  body: string;
  head_sha: string;
};

export type ShimResult = { status: number | null; stdout: string; stderr: string; json: unknown };

/** One backend behind the shim, for the contract suite. */
export type World = {
  name: string;
  setup(prs: SeedPr[]): Promise<void>;
  run(args: string[]): ShimResult;
  backendCalls(): number;
  teardown(): void;
};

let fake: FakeGitlab | null = null;
let shim: string | null = null;
let repo = "";

const glState = { open: "opened", merged: "merged", closed: "closed" } as const;

/** The GitLab side of the contract suite: seeds the fake GitLab (labelled hitl), counts requests. */
export const gitlabWorld: World = {
  name: "gitlab",
  async setup(prs: SeedPr[]) {
    fake ??= await startFakeGitlab({ mergeRequests: [], approvals: {}, discussions: {} });
    shim ??= gitlabShimDir();
    repo = repoWithOrigin(`${fake.url}/g/r.git`);
    fake.setState({
      mergeRequests: prs.map((p) => ({
        iid: p.number,
        web_url: `${fake?.url}/g/r/-/merge_requests/${p.number}`,
        source_branch: p.head,
        target_branch: p.base,
        state: glState[p.state],
        draft: p.draft,
        title: p.draft ? `Draft: ${p.title}` : p.title,
        description: p.body,
        sha: p.head_sha,
        labels: ["hitl"],
      })),
      approvals: {},
      discussions: {},
    });
  },
  run(args: string[]) {
    return runGitlabShim(shim as string, repo, args, {
      GITLAB_URL: (fake as FakeGitlab).url,
      GITLAB_TOKEN: "glpat-contract",
    });
  },
  backendCalls() {
    return (fake as FakeGitlab).requests().length;
  },
  teardown() {
    fake?.stop();
    fake = null;
  },
};

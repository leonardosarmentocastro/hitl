// scripts/__tests__/helpers/github.ts — a PR shim assembled from the templates with the GitHub
// backend, run against the fake gh in store mode.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SeedPr, World } from "./gitlab";

const ROOT = process.cwd();
const FAKE_GH_DIR = join(ROOT, "scripts/__fixtures__/fake-gh");

/** A temp directory (copies keep the source mode) holding pr.sh and github.sh as backend.sh. */
export function githubShimDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hitl-github-shim-"));
  copyFileSync(join(ROOT, "templates/scripts/pr.sh"), join(dir, "pr.sh"));
  copyFileSync(join(ROOT, "templates/scripts/backends/github.sh"), join(dir, "backend.sh"));
  return dir;
}

let shim: string | null = null;
let dir = "";

const ghState = { open: "OPEN", merged: "MERGED", closed: "CLOSED" } as const;

/** The GitHub side of the contract suite: seeds the fake gh's store, counts its calls. */
export const githubWorld: World = {
  name: "github",
  async setup(prs: SeedPr[]) {
    shim ??= githubShimDir();
    dir = mkdtempSync(join(tmpdir(), "hitl-github-world-"));
    writeFileSync(join(dir, "gh.log"), "");
    const store = prs.map((p) => ({
      number: p.number,
      url: `https://github.com/o/r/pull/${p.number}`,
      headRefName: p.head,
      baseRefName: p.base,
      state: ghState[p.state],
      isDraft: p.draft,
      title: p.title,
      body: p.body,
      headRefOid: p.head_sha,
      reviews: [],
      comments: [],
    }));
    writeFileSync(join(dir, "store.json"), JSON.stringify(store));
  },
  run(args: string[]) {
    const r = spawnSync(join(shim as string, "pr.sh"), args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${FAKE_GH_DIR}:${process.env.PATH}`,
        FAKE_GH_LOG: join(dir, "gh.log"),
        FAKE_GH_MODE: "store",
        FAKE_GH_STORE: join(dir, "store.json"),
      },
    });
    let json: unknown = null;
    try {
      json = r.stdout.trim() === "" ? null : JSON.parse(r.stdout);
    } catch {
      json = { unparsable: r.stdout };
    }
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  },
  backendCalls() {
    return readFileSync(join(dir, "gh.log"), "utf8").split("\n").filter(Boolean).length;
  },
  teardown() {},
};

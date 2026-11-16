// scripts/__tests__/pr-shim-gitlab.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  type FakeGitlab,
  gitlabShimDir,
  repoWithOrigin,
  runGitlabShim,
  startFakeGitlab,
} from "./helpers/gitlab";

const TOKEN = "glpat-secret-token-123";

let fake: FakeGitlab;
let shim: string;

beforeAll(async () => {
  fake = await startFakeGitlab({ mergeRequests: [], approvals: {}, discussions: {} });
  shim = gitlabShimDir();
});

afterAll(() => fake.stop());

beforeEach(() => {
  fake.setState({ mergeRequests: [], approvals: {}, discussions: {} });
});

function expectNoToken(r: { stdout: string; stderr: string }) {
  expect(r.stdout).not.toContain(TOKEN);
  expect(r.stderr).not.toContain(TOKEN);
}

describe("the GitLab backend refuses before any request", () => {
  it("refuses without GITLAB_TOKEN", () => {
    const repo = repoWithOrigin(`${fake.url}/g/r.git`);
    const r = runGitlabShim(shim, repo, ["list", "--head-prefix", "feat/x"], {
      GITLAB_URL: fake.url,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GITLAB_TOKEN");
    expect(fake.requests()).toHaveLength(0);
  });

  it("refuses with an empty GITLAB_TOKEN", () => {
    const repo = repoWithOrigin(`${fake.url}/g/r.git`);
    const r = runGitlabShim(shim, repo, ["view", "1"], { GITLAB_URL: fake.url, GITLAB_TOKEN: "" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GITLAB_TOKEN");
    expect(fake.requests()).toHaveLength(0);
  });

  it("refuses when the origin remote does not match GITLAB_URL", () => {
    const repo = repoWithOrigin("git@other.corp:g/r.git");
    const r = runGitlabShim(shim, repo, ["list", "--head-prefix", "feat/x"], {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GITLAB_URL");
    expect(fake.requests()).toHaveLength(0);
    expectNoToken(r);
  });

  it("refuses a GITLAB_URL without a scheme", () => {
    const repo = repoWithOrigin("git@127.0.0.1:g/r.git");
    const r = runGitlabShim(shim, repo, ["list", "--head-prefix", "feat/x"], {
      GITLAB_URL: "127.0.0.1:1",
      GITLAB_TOKEN: TOKEN,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("is not a URL");
    expect(fake.requests()).toHaveLength(0);
    expectNoToken(r);
  });

  it("refuses a GITLAB_URL that ends in /api/v4", () => {
    const repo = repoWithOrigin(`${fake.url}/g/r.git`);
    const r = runGitlabShim(shim, repo, ["list", "--head-prefix", "feat/x"], {
      GITLAB_URL: `${fake.url}/api/v4`,
      GITLAB_TOKEN: TOKEN,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("without /api/v4");
    expect(fake.requests()).toHaveLength(0);
    expectNoToken(r);
  });
});

/** A GitLab-shaped merge request, labelled hitl unless overridden. */
function mr(iid: number, over: Record<string, unknown> = {}) {
  return {
    iid,
    web_url: `https://gitlab.example/g/r/-/merge_requests/${iid}`,
    source_branch: `feat/x-slice-${iid}`,
    target_branch: "feat/x",
    state: "opened",
    draft: false,
    title: `Slice ${iid}`,
    description: "body",
    sha: `sha${iid}`,
    labels: ["hitl"],
    ...over,
  };
}

const EMPTY = { mergeRequests: [], approvals: {}, discussions: {} };

describe("pr.sh list on GitLab", () => {
  const list = (args: string[], env: Record<string, string> = {}) =>
    runGitlabShim(shim, repoWithOrigin(`${fake.url}/g/r.git`), ["list", ...args], {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
      ...env,
    });

  it("returns the records whose head starts with the prefix, and only those", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [
        mr(1),
        mr(2, { source_branch: "feat/y-slice-1" }),
        mr(3, { source_branch: "fix/feat/x-slice-3" }),
        mr(4, { state: "merged" }),
      ],
    });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status, r.stderr).toBe(0);
    expect((r.json as { number: number }[]).map((p) => p.number)).toEqual([1, 4]);
    expectNoToken(r);
  });

  it("asks only for hitl-labelled MRs and sends the token header on every request", () => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(1), mr(2, { labels: [] })] });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status, r.stderr).toBe(0);
    expect((r.json as { number: number }[]).map((p) => p.number)).toEqual([1]);
    const reqs = fake.requests();
    expect(reqs.length).toBeGreaterThan(0);
    for (const q of reqs) {
      expect(q.query.labels).toBe("hitl");
      expect(q.token).toBe(TOKEN);
      expect(q.path).toBe("/api/v4/projects/g%2Fr/merge_requests");
    }
  });

  it.each([
    ["open", "opened"],
    ["merged", "merged"],
    ["closed", "closed"],
    ["all", "all"],
  ])("--state %s sends state=%s", (state, sent) => {
    const r = list(["--head-prefix", "feat/x", "--state", state]);
    expect(r.status, r.stderr).toBe(0);
    expect(fake.requests()[0].query.state).toBe(sent);
  });

  it("maps a locked draft MR with a null description to the record", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [
        mr(7, {
          source_branch: "feat/x-slice-1-api",
          title: "Draft: Slice 1: api",
          draft: true,
          description: null,
          state: "locked",
          sha: "abc1234",
        }),
      ],
    });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json).toEqual([
      {
        number: 7,
        ref: "!7",
        url: "https://gitlab.example/g/r/-/merge_requests/7",
        head: "feat/x-slice-1-api",
        base: "feat/x",
        state: "open",
        draft: true,
        title: "Slice 1: api",
        body: "",
        head_sha: "abc1234",
      },
    ]);
  });

  it("removes one draft marker from a draft's title, and keeps a non-draft's title", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [
        mr(1, { draft: true, title: "[Draft] x" }),
        mr(2, { draft: true, title: "(Draft) x" }),
        mr(3, { draft: true, title: "draft x" }),
        mr(4, { draft: false, title: "Draft plans for Q3" }),
        mr(5, { state: "merged" }),
        mr(6, { state: "closed" }),
      ],
    });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status, r.stderr).toBe(0);
    const recs = r.json as { title: string; state: string }[];
    expect(recs.map((p) => p.title)).toEqual([
      "x",
      "x",
      "x",
      "Draft plans for Q3",
      "Slice 5",
      "Slice 6",
    ]);
    expect(recs.map((p) => p.state)).toEqual(["open", "open", "open", "open", "merged", "closed"]);
  });

  it("reads every page: 250 MRs come back as 250 records", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: Array.from({ length: 250 }, (_, i) => mr(i + 1)),
    });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status, r.stderr).toBe(0);
    expect((r.json as unknown[]).length).toBe(250);
    const reqs = fake.requests();
    expect(reqs.map((q) => q.query.page)).toEqual(["1", "2", "3"]);
    for (const q of reqs) expect(q.query.per_page).toBe("100");
  });

  it("fails the whole call when GitLab answers an error", () => {
    fake.setState({ ...EMPTY, mode: "fail" });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GitLab 500: boom");
    expect(r.stdout).toBe("");
    expectNoToken(r);
  });

  it("does not follow a redirect", () => {
    fake.setState({ ...EMPTY, mode: "redirect" });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("http://127.0.0.1:1/elsewhere");
    expect(r.stderr).toContain("GITLAB_URL");
    expect(r.stdout).toBe("");
    expect(fake.requests()).toHaveLength(1);
    expectNoToken(r);
  });

  it("matches a prefix containing a quote or backslash literally", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [
        mr(1, { source_branch: 'feat/x"q-slice-1' }),
        mr(2, { source_branch: "feat\\y-slice-1" }),
        mr(3, { source_branch: "feat/x-slice-3" }),
      ],
    });
    const q = list(["--head-prefix", 'feat/x"q']);
    expect(q.status, q.stderr).toBe(0);
    expect((q.json as { number: number }[]).map((p) => p.number)).toEqual([1]);
    const b = list(["--head-prefix", "feat\\"]);
    expect(b.status, b.stderr).toBe(0);
    expect((b.json as { number: number }[]).map((p) => p.number)).toEqual([2]);
  });

  it.each([
    ["an scp-style", (_url: string) => "git@127.0.0.1:g/sub/r.git"],
    ["an ssh://", (_url: string) => "ssh://git@127.0.0.1:2222/g/sub/r.git"],
    ["an http", (url: string) => `${url}/g/sub/r.git`],
  ])("reaches the project from %s origin", (_form, remote) => {
    fake.setState({ ...EMPTY, project: "g%2Fsub%2Fr", mergeRequests: [mr(1)] });
    const r = runGitlabShim(
      shim,
      repoWithOrigin(remote(fake.url)),
      ["list", "--head-prefix", "feat/x-slice-"],
      { GITLAB_URL: fake.url, GITLAB_TOKEN: TOKEN },
    );
    expect(r.status, r.stderr).toBe(0);
    expect((r.json as { number: number }[]).map((p) => p.number)).toEqual([1]);
    expect(fake.requests()[0].path).toBe("/api/v4/projects/g%2Fsub%2Fr/merge_requests");
  });
});

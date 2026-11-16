// scripts/__tests__/pr-shim-gitlab.test.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("fails the whole call when a later page fails, printing none of the pages read", () => {
    fake.setState({
      ...EMPTY,
      failFromPage: 2,
      mergeRequests: Array.from({ length: 250 }, (_, i) => mr(i + 1)),
    });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GitLab 500: boom");
    expect(r.stdout).toBe("");
    expect(fake.requests().map((q) => q.query.page)).toEqual(["1", "2"]);
    expectNoToken(r);
  });

  it("fails the whole call when a page is not a list (a proxy's HTML page)", () => {
    fake.setState({
      ...EMPTY,
      htmlFromPage: 2,
      mergeRequests: Array.from({ length: 250 }, (_, i) => mr(i + 1)),
    });
    const r = list(["--head-prefix", "feat/x-slice-"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("not a list");
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

/** A GitLab note. */
function note(username: string, body: string, over: Record<string, unknown> = {}) {
  return {
    id: Math.floor(Math.random() * 1e9),
    body,
    author: { username },
    created_at: "2026-11-15T10:00:00Z",
    system: false,
    resolvable: false,
    ...over,
  };
}

describe("pr.sh view on GitLab", () => {
  const view = (n: string) =>
    runGitlabShim(shim, repoWithOrigin(`${fake.url}/g/r.git`), ["view", n], {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
    });

  it("maps approvals, threads and comments, leaving system notes out", () => {
    const open = { resolvable: true, resolved: false };
    const done = { resolvable: true, resolved: true };
    fake.setState({
      mergeRequests: [mr(5)],
      approvals: { "5": { approved_by: [{ user: { username: "ana" } }] } },
      discussions: {
        "5": [
          {
            id: "d1",
            notes: [
              note("bo", "rename it", open),
              note("me", "why?", open),
              note("bo", "never mind, keep it", open),
            ],
          },
          { id: "d2", notes: [note("cy", "typo", done)] },
          { id: "d3", notes: [note("di", "+1", { created_at: "2026-11-15T11:00:00Z" })] },
          { id: "d4", notes: [note("me", "added 1 commit", { system: true })] },
        ],
      },
    });
    const r = view("5");
    expect(r.status, r.stderr).toBe(0);
    const out = r.json as Record<string, unknown>;
    expect(out.number).toBe(5);
    expect(out.ref).toBe("!5");
    expect(out.reviews).toEqual([
      { author: "ana", state: "approved", body: "" },
      {
        author: "bo",
        state: "changes_requested",
        body: "@bo: rename it\n\n@me: why?\n\n@bo: never mind, keep it",
      },
      { author: "cy", state: "commented", body: "@cy: typo" },
    ]);
    expect(out.comments).toEqual([
      { author: "di", body: "+1", created_at: "2026-11-15T11:00:00Z" },
    ]);
    expect(r.stdout).not.toContain("added 1 commit");
    expectNoToken(r);
  });

  it("reads every page of discussions: 150 are all represented", () => {
    fake.setState({
      mergeRequests: [mr(5)],
      approvals: {},
      discussions: {
        "5": Array.from({ length: 150 }, (_, i) => ({
          id: `d${i}`,
          notes: [note("bo", `c${i}`, i % 2 ? { resolvable: true, resolved: false } : {})],
        })),
      },
    });
    const r = view("5");
    expect(r.status, r.stderr).toBe(0);
    const out = r.json as { reviews: unknown[]; comments: unknown[] };
    expect(out.reviews.length + out.comments.length).toBe(150);
    const pages = fake
      .requests()
      .filter((q) => q.path.endsWith("/discussions"))
      .map((q) => q.query.page);
    expect(pages).toEqual(["1", "2"]);
  });

  it("returns empty reviews and comments for an MR with neither", () => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(5)] });
    const r = view("5");
    expect(r.status, r.stderr).toBe(0);
    const out = r.json as { reviews: unknown[]; comments: unknown[] };
    expect(out.reviews).toEqual([]);
    expect(out.comments).toEqual([]);
  });

  it("exits 2 with GitLab's message for an unknown number", () => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(5)] });
    const r = view("99");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GitLab 404: 404 Not found");
    expect(r.stdout).toBe("");
  });
});

/** A temp body file holding `text`. */
function bodyFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hitl-gitlab-body-"));
  const f = join(dir, "body.md");
  writeFileSync(f, text);
  return f;
}

describe("pr.sh create on GitLab", () => {
  const create = (args: string[]) =>
    runGitlabShim(shim, repoWithOrigin(`${fake.url}/g/r.git`), ["create", ...args], {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
    });
  const base = (title: string, body = bodyFile("the body")) => [
    "--base",
    "feat/x",
    "--head",
    "feat/x-slice-1-api",
    "--title",
    title,
    "--body-file",
    body,
  ];

  it("--draft creates a Draft MR labelled hitl, with no reviewers or assignees", () => {
    const r = create([...base("Slice 1: api", bodyFile("plan text")), "--draft"]);
    expect(r.status, r.stderr).toBe(0);
    const post = fake.requests().find((q) => q.method === "POST");
    expect(post?.path).toBe("/api/v4/projects/g%2Fr/merge_requests");
    const sent = post?.body as Record<string, unknown>;
    expect(sent.title).toBe("Draft: Slice 1: api");
    expect(sent.labels).toBe("hitl");
    expect(sent.description).toBe("plan text");
    expect(sent.source_branch).toBe("feat/x-slice-1-api");
    expect(sent.target_branch).toBe("feat/x");
    for (const k of ["reviewer_ids", "assignee_ids", "assignee_id"])
      expect(sent).not.toHaveProperty(k);
    const rec = r.json as Record<string, unknown>;
    expect(rec.draft).toBe(true);
    expect(rec.ref).toBe("!1");
    expect(rec.title).toBe("Slice 1: api");
    expectNoToken(r);
  });

  it("without --draft sends the title as given", () => {
    const r = create(base("Slice 1: api"));
    expect(r.status, r.stderr).toBe(0);
    const post = fake.requests().find((q) => q.method === "POST");
    expect((post?.body as { title: string }).title).toBe("Slice 1: api");
    expect((r.json as { draft: boolean }).draft).toBe(false);
  });

  it("--draft on a title that already has a draft marker adds no second one", () => {
    const r = create([...base("Draft: x"), "--draft"]);
    expect(r.status, r.stderr).toBe(0);
    const post = fake.requests().find((q) => q.method === "POST");
    expect((post?.body as { title: string }).title).toBe("Draft: x");
  });

  it("--draft on a title that only starts with the word Draft still adds the marker", () => {
    const r = create([...base("Draft emails"), "--draft"]);
    expect(r.status, r.stderr).toBe(0);
    const post = fake.requests().find((q) => q.method === "POST");
    expect((post?.body as { title: string }).title).toBe("Draft: Draft emails");
    const rec = r.json as { draft: boolean; title: string };
    expect(rec.draft).toBe(true);
    expect(rec.title).toBe("Draft emails");
  });

  it("without --draft, a title starting with the word Draft is not a draft", () => {
    const r = create(base("Draft emails"));
    expect(r.status, r.stderr).toBe(0);
    const rec = r.json as { draft: boolean; title: string };
    expect(rec.draft).toBe(false);
    expect(rec.title).toBe("Draft emails");
  });

  it("sends a body with non-ASCII text, quotes and newlines byte-exact", () => {
    const text = '"é"\n— end';
    const r = create(base("t", bodyFile(text)));
    expect(r.status, r.stderr).toBe(0);
    const post = fake.requests().find((q) => q.method === "POST");
    expect((post?.body as { description: string }).description).toBe(text);
    expect((r.json as { body: string }).body).toBe(text);
  });

  it("exits 3 with the existing MR's record, adding the hitl label and keeping the others", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [mr(4, { source_branch: "feat/x-slice-1-api", labels: ["team"] })],
    });
    const r = create(base("Slice 1: api"));
    expect(r.status, r.stderr).toBe(3);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect((r.json as { number: number; ref: string }).number).toBe(4);
    expect((r.json as { ref: string }).ref).toBe("!4");
    const lookup = fake.requests().find((q) => q.method === "GET");
    expect(lookup?.query).toMatchObject({
      source_branch: "feat/x-slice-1-api",
      target_branch: "feat/x",
      state: "opened",
    });
    expect(lookup?.query.labels).toBeUndefined();
    const after = fake.state().mergeRequests.find((m) => m.iid === 4) as { labels: string[] };
    expect(after.labels).toEqual(["team", "hitl"]);
    expect(fake.state().mergeRequests).toHaveLength(1);
    expectNoToken(r);
  });

  it("exits 3 with the whole record when the existing MR's body is large", () => {
    const big = "x".repeat(512 * 1024);
    fake.setState({
      ...EMPTY,
      mergeRequests: [mr(4, { source_branch: "feat/x-slice-1-api", description: big })],
    });
    const r = create(base("Slice 1: api"));
    expect(r.status, r.stderr).toBe(3);
    expect((r.json as { body: string }).body).toHaveLength(big.length);
  });

  it("exits 3 without a PUT when the existing MR already carries hitl", () => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(4, { source_branch: "feat/x-slice-1-api" })] });
    const r = create(base("Slice 1: api"));
    expect(r.status, r.stderr).toBe(3);
    expect(fake.requests().filter((q) => q.method === "PUT")).toHaveLength(0);
  });

  it("creates a new MR when the head's open MR targets another base", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [mr(4, { source_branch: "feat/x-slice-1-api", target_branch: "main" })],
    });
    const r = create(base("Slice 1: api"));
    expect(r.status, r.stderr).toBe(0);
    expect((r.json as { number: number }).number).toBe(5);
    expect(fake.state().mergeRequests).toHaveLength(2);
  });

  it("does not follow a redirect on the POST: exit 2, one request, no MR", () => {
    fake.setState({ ...EMPTY, mode: "redirect" });
    const r = create(base("Slice 1: api"));
    expect(r.status).toBe(2);
    expect(r.stdout).toBe("");
    expect(fake.requests()).toHaveLength(1);
    expect(fake.state().mergeRequests).toHaveLength(0);
    expectNoToken(r);
  });

  it("exits 2 with GitLab's message when GitLab fails", () => {
    fake.setState({ ...EMPTY, mode: "fail" });
    const r = create(base("Slice 1: api"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GitLab 500: boom");
    expect(r.stdout).toBe("");
  });
});

describe("pr.sh edit, comment and retarget on GitLab", () => {
  const run = (args: string[]) =>
    runGitlabShim(shim, repoWithOrigin(`${fake.url}/g/r.git`), args, {
      GITLAB_URL: fake.url,
      GITLAB_TOKEN: TOKEN,
    });
  const writes = () => fake.requests().filter((q) => q.method !== "GET");

  it("edit sends only the description; the Draft title and status stand", () => {
    fake.setState({
      ...EMPTY,
      mergeRequests: [mr(5, { draft: true, title: "Draft: Slice 5" })],
    });
    const r = run(["edit", "5", "--body-file", bodyFile("new body")]);
    expect(r.status, r.stderr).toBe(0);
    const [put] = writes();
    expect(put.method).toBe("PUT");
    expect(put.path).toBe("/api/v4/projects/g%2Fr/merge_requests/5");
    expect(put.body).toEqual({ description: "new body" });
    const rec = r.json as Record<string, unknown>;
    expect(rec.body).toBe("new body");
    expect(rec.draft).toBe(true);
    expect(rec.title).toBe("Slice 5");
    expectNoToken(r);
  });

  it("comment posts a note with the file's text and returns the MR's record", () => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(5)] });
    const r = run(["comment", "5", "--body-file", bodyFile("a note")]);
    expect(r.status, r.stderr).toBe(0);
    const [post] = writes();
    expect(post.method).toBe("POST");
    expect(post.path).toBe("/api/v4/projects/g%2Fr/merge_requests/5/notes");
    expect(post.body).toEqual({ body: "a note" });
    const rec = r.json as Record<string, unknown>;
    expect(rec.number).toBe(5);
    expect(rec.ref).toBe("!5");
    expect(rec).not.toHaveProperty("reviews");
  });

  it("retarget sends only target_branch; the record's base is the new branch", () => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(5)] });
    const r = run(["retarget", "5", "--base", "feat/y"]);
    expect(r.status, r.stderr).toBe(0);
    const [put] = writes();
    expect(put.method).toBe("PUT");
    expect(put.body).toEqual({ target_branch: "feat/y" });
    expect((r.json as { base: string }).base).toBe("feat/y");
  });

  const verbs: [string, (n: string) => string[]][] = [
    ["edit", (n) => ["edit", n, "--body-file", bodyFile("x")]],
    ["comment", (n) => ["comment", n, "--body-file", bodyFile("x")]],
    ["retarget", (n) => ["retarget", n, "--base", "b"]],
  ];

  it.each(verbs)("%s exits 2 when GitLab fails", (_verb, args) => {
    fake.setState({ ...EMPTY, mode: "fail", mergeRequests: [mr(5)] });
    const r = run(args("5"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GitLab 500: boom");
    expect(r.stdout).toBe("");
  });

  it.each(verbs)("%s exits 2 for an unknown number", (_verb, args) => {
    fake.setState({ ...EMPTY, mergeRequests: [mr(5)] });
    const r = run(args("99"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("GitLab 404");
    expect(r.stdout).toBe("");
  });
});

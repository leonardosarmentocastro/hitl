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

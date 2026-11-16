// scripts/__tests__/pr-shim-contract.test.ts — the shim's contract for every verb, asserted
// identically against each backend.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { githubWorld } from "./helpers/github";
import { type SeedPr, gitlabWorld } from "./helpers/gitlab";

const SEED: SeedPr[] = [
  {
    number: 1,
    head: "feat/x-slice-1-api",
    base: "feat/x",
    state: "open",
    draft: true,
    title: "Slice 1: api",
    body: "Plan: docs/superpowers/plans/p.md",
    head_sha: "sha1",
  },
  {
    number: 2,
    head: "feat/x-slice-2-web",
    base: "feat/x-slice-1-api",
    state: "merged",
    draft: false,
    title: "Slice 2: web",
    body: "",
    head_sha: "sha2",
  },
  {
    number: 3,
    head: "feat/x-slice-3-ui",
    base: "feat/x-slice-2-web",
    state: "closed",
    draft: false,
    title: "Slice 3: ui",
    body: "b",
    head_sha: "sha3",
  },
  {
    number: 4,
    head: "fix/feat/x-slice-4",
    base: "main",
    state: "open",
    draft: false,
    title: "Unrelated",
    body: "",
    head_sha: "sha4",
  },
  {
    number: 5,
    head: 'feat/x"q-slice-1',
    base: "feat/x",
    state: "open",
    draft: false,
    title: "Quoted",
    body: "",
    head_sha: "sha5",
  },
];

const RECORD_KEYS = [
  "number",
  "ref",
  "url",
  "head",
  "base",
  "state",
  "draft",
  "title",
  "body",
  "head_sha",
].sort();

/** A temp body file holding `text`. */
function bodyFile(text: string): string {
  const f = join(mkdtempSync(join(tmpdir(), "hitl-contract-body-")), "body.md");
  writeFileSync(f, text);
  return f;
}

const numbers = (json: unknown) => (json as { number: number }[]).map((p) => p.number).sort();

describe.each([githubWorld, gitlabWorld])("the shim contract on $name", (world) => {
  const refOf = (n: number) => `${world.name === "github" ? "#" : "!"}${n}`;

  afterAll(() => world.teardown());

  it("view prints the record with reviews and comments", async () => {
    await world.setup(SEED);
    const r = world.run(["view", "1"]);
    expect(r.status, r.stderr).toBe(0);
    const rec = r.json as Record<string, unknown>;
    expect(Object.keys(rec).sort()).toEqual(
      [
        "number",
        "ref",
        "url",
        "head",
        "base",
        "state",
        "draft",
        "title",
        "body",
        "head_sha",
        "reviews",
        "comments",
      ].sort(),
    );
    const { url, ref, reviews, comments, ...rest } = rec;
    expect(rest).toEqual(SEED[0]);
    expect(ref).toBe(refOf(1));
    expect(typeof url).toBe("string");
    expect(reviews).toEqual([]);
    expect(comments).toEqual([]);
  });

  it("list returns every state by default, and only heads that start with the prefix", async () => {
    await world.setup(SEED);
    const r = world.run(["list", "--head-prefix", "feat/x-slice-"]);
    expect(r.status, r.stderr).toBe(0);
    expect(numbers(r.json)).toEqual([1, 2, 3]);
    for (const rec of r.json as { number: number; ref: string }[]) {
      expect(rec.ref).toBe(refOf(rec.number));
    }
  });

  it("list --state merged returns only the merged one", async () => {
    await world.setup(SEED);
    const r = world.run(["list", "--head-prefix", "feat/x-slice-", "--state", "merged"]);
    expect(r.status, r.stderr).toBe(0);
    expect(numbers(r.json)).toEqual([2]);
  });

  it("list matches a prefix containing a quote literally", async () => {
    await world.setup(SEED);
    const r = world.run(["list", "--head-prefix", 'feat/x"q']);
    expect(r.status, r.stderr).toBe(0);
    expect(numbers(r.json)).toEqual([5]);
  });

  it.each([[["list"]], [["view", "abc"]], [["nope"]]])(
    "%j is a usage error that never reaches the backend",
    async (args) => {
      await world.setup(SEED);
      const r = world.run(args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("usage: pr.sh");
      expect(r.stdout).toBe("");
      expect(world.backendCalls()).toBe(0);
    },
  );

  it("view of a number that does not exist is exit 2", async () => {
    await world.setup(SEED);
    const r = world.run(["view", "99"]);
    expect(r.status).toBe(2);
    expect(r.stderr.trim()).not.toBe("");
    expect(r.stdout).toBe("");
  });

  describe("the writing verbs", () => {
    const createArgs = (head: string, base: string, title: string) => [
      "create",
      "--base",
      base,
      "--head",
      head,
      "--title",
      title,
      "--body-file",
      bodyFile("created body"),
    ];

    it("create --draft prints a draft record with the title as passed", async () => {
      await world.setup(SEED);
      const r = world.run([
        ...createArgs("feat/x-slice-9-new", "feat/x", "Slice 9: new"),
        "--draft",
      ]);
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout.trim().split("\n")).toHaveLength(1);
      const rec = r.json as Record<string, unknown>;
      expect(Object.keys(rec).sort()).toEqual(RECORD_KEYS);
      expect(rec).toMatchObject({
        draft: true,
        title: "Slice 9: new",
        head: "feat/x-slice-9-new",
        base: "feat/x",
        state: "open",
        body: "created body",
      });
      expect(rec.ref).toBe(refOf(rec.number as number));
    });

    it("create without --draft prints a non-draft record", async () => {
      await world.setup(SEED);
      const r = world.run(createArgs("feat/x-slice-9-new", "feat/x", "Slice 9: new"));
      expect(r.status, r.stderr).toBe(0);
      expect((r.json as { draft: boolean }).draft).toBe(false);
    });

    it("create for a head with an open PR to that base exits 3 with that PR's record", async () => {
      await world.setup(SEED);
      const r = world.run(createArgs("feat/x-slice-1-api", "feat/x", "Slice 1: api"));
      expect(r.status, r.stderr).toBe(3);
      expect(r.stdout.trim().split("\n")).toHaveLength(1);
      const rec = r.json as Record<string, unknown>;
      expect(Object.keys(rec).sort()).toEqual(RECORD_KEYS);
      expect(rec).toMatchObject({ number: 1, ref: refOf(1), head: "feat/x-slice-1-api" });
    });

    it("edit --body-file prints the record with the new body, same draft and title", async () => {
      await world.setup(SEED);
      const r = world.run(["edit", "1", "--body-file", bodyFile("edited body")]);
      expect(r.status, r.stderr).toBe(0);
      const rec = r.json as Record<string, unknown>;
      expect(Object.keys(rec).sort()).toEqual(RECORD_KEYS);
      expect(rec).toMatchObject({
        number: 1,
        body: "edited body",
        draft: true,
        title: "Slice 1: api",
      });
    });

    it("comment --body-file prints the PR's record", async () => {
      await world.setup(SEED);
      const r = world.run(["comment", "1", "--body-file", bodyFile("a comment")]);
      expect(r.status, r.stderr).toBe(0);
      const rec = r.json as Record<string, unknown>;
      expect(Object.keys(rec).sort()).toEqual(RECORD_KEYS);
      expect(rec).toMatchObject({ number: 1, ref: refOf(1) });
    });

    it("retarget --base prints the record with the new base", async () => {
      await world.setup(SEED);
      const r = world.run(["retarget", "1", "--base", "b"]);
      expect(r.status, r.stderr).toBe(0);
      const rec = r.json as Record<string, unknown>;
      expect(Object.keys(rec).sort()).toEqual(RECORD_KEYS);
      expect(rec.base).toBe("b");
    });

    it.each([
      [["create", "--base", "feat/x", "--head", "h", "--body-file", "/dev/null"]],
      [["edit", "1"]],
      [["retarget", "1"]],
    ])("%j is a usage error that never reaches the backend", async (args) => {
      await world.setup(SEED);
      const r = world.run(args);
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
      expect(world.backendCalls()).toBe(0);
    });
  });
});

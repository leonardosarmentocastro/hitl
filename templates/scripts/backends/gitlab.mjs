#!/usr/bin/env node
// hitl PR shim — GitLab backend, run by backend.sh as `node gitlab.mjs <verb> <args…>` with the
// arguments pr.sh passes to backend_<verb>. Talks to GitLab's REST API with Node's built-in
// fetch; zero dependencies. Prints one JSON document on stdout; exit 2 with a message on stderr
// on any failure. The token goes only in the PRIVATE-TOKEN header, only to the API base the
// host rule resolved from the origin remote, and is never printed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveHost } from "./host.mjs";

/** Print `message` on stderr and exit 2. */
function fail(message) {
  process.stderr.write(`pr.sh: ${message}\n`);
  process.exit(2);
}

function originUrl() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return url === "" ? null : url;
  } catch {
    return null;
  }
}

/** The request context { apiBase, project, token }, or exit 2 before any request. */
function context(env) {
  const token = env.GITLAB_TOKEN;
  if (!token) {
    fail("GITLAB_TOKEN is not set. Create a GitLab access token with the api scope and export it.");
  }
  const resolved = resolveHost(originUrl(), env);
  if (resolved.host !== "gitlab") {
    if (resolved.problem === "bad-gitlab-url") {
      fail("GITLAB_URL is not a URL (it needs a scheme, e.g. https://gitlab.example.com).");
    }
    if (resolved.problem === "gitlab-url-has-api-path") {
      fail("GITLAB_URL must be the instance's address, without /api/v4.");
    }
    fail(
      "the origin remote is not gitlab.com and does not match GITLAB_URL. For a self-hosted " +
        "GitLab, set GITLAB_URL to its address; an instance whose ssh hostname differs from its " +
        "web hostname needs an https remote.",
    );
  }
  return { apiBase: resolved.apiBase, project: resolved.project, token };
}

/**
 * One request to `<apiBase>/api/v4/projects/<project><path>`. Never follows a redirect. A
 * non-2xx answer is exit 2, unless its status is in `allow`; then the response comes back.
 */
export async function api(ctx, method, path, { query, body, allow = [] } = {}) {
  const url = new URL(`${ctx.apiBase}/api/v4/projects/${ctx.project}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  const headers = { "PRIVATE-TOKEN": ctx.token };
  if (body !== undefined) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  } catch (e) {
    fail(`could not reach GitLab at ${ctx.apiBase}: ${e.cause?.message ?? e.message}`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text === "" ? null : JSON.parse(text);
  } catch {
    json = null;
  }
  if (res.status >= 300 && res.status < 400) {
    fail(
      `GitLab answered ${res.status} with a redirect to ${res.headers.get("location")}; ` +
        "set GITLAB_URL to the address it redirects to.",
    );
  }
  if ((res.status < 200 || res.status >= 300) && !allow.includes(res.status)) {
    let detail = json?.message ?? json?.error ?? text;
    if (typeof detail !== "string") detail = JSON.stringify(detail);
    fail(`GitLab ${res.status}: ${detail}`);
  }
  return { status: res.status, json, headers: res.headers };
}

const PER_PAGE = 100;

/** Every item of a paged list: page 1, 2, … until a page holds fewer than PER_PAGE items. */
export async function paged(ctx, path, query) {
  const all = [];
  for (let page = 1; ; page++) {
    const { json } = await api(ctx, "GET", path, {
      query: { ...query, per_page: PER_PAGE, page },
    });
    if (!Array.isArray(json)) {
      fail(`GitLab answered page ${page} of ${path} with something that is not a list.`);
    }
    const items = json;
    all.push(...items);
    if (items.length < PER_PAGE) return all;
  }
}

const DRAFT_MARKER = /^\s*(?:\[draft\]|\(draft\)|draft:|draft\s)\s*/i;
// GitLab's own draft rule: only these leading markers (or a title that is exactly "Draft") make
// an MR a draft. "Draft emails" is not one. The prefix decision in create must use this one.
const GITLAB_DRAFT = /^(?:\[draft\]|\(draft\)|draft:|draft - |draft$)/i;
const STATES = { opened: "open", locked: "open", merged: "merged", closed: "closed" };

/** The shim's record for a GitLab merge request. */
export function toRecord(mr) {
  return {
    number: mr.iid,
    ref: `!${mr.iid}`,
    url: mr.web_url,
    head: mr.source_branch,
    base: mr.target_branch,
    state: STATES[mr.state] ?? mr.state,
    draft: mr.draft,
    title: mr.draft ? mr.title.replace(DRAFT_MARKER, "") : mr.title,
    body: mr.description ?? "",
    head_sha: mr.sha,
  };
}

async function list(ctx, [prefix, state]) {
  const mrs = await paged(ctx, "/merge_requests", {
    labels: "hitl",
    state: state === "open" ? "opened" : state,
    order_by: "created_at",
    sort: "asc",
  });
  return mrs.map(toRecord).filter((r) => r.head.startsWith(prefix));
}

/**
 * The record plus reviews (each approver, then each thread — a discussion with a resolvable
 * note — in GitLab's order) and comments (the non-system notes of every other discussion).
 */
async function view(ctx, [number]) {
  const { json: mr } = await api(ctx, "GET", `/merge_requests/${number}`);
  const { json: approvals } = await api(ctx, "GET", `/merge_requests/${number}/approvals`);
  const discussions = await paged(ctx, `/merge_requests/${number}/discussions`, {});

  const reviews = (approvals?.approved_by ?? []).map((a) => ({
    author: a.user.username,
    state: "approved",
    body: "",
  }));
  const comments = [];
  for (const d of discussions) {
    const notes = d.notes ?? [];
    const spoken = notes.filter((n) => !n.system);
    const resolvable = notes.filter((n) => n.resolvable === true);
    if (resolvable.length > 0) {
      reviews.push({
        author: spoken[0]?.author?.username ?? null,
        state: resolvable.some((n) => n.resolved === false) ? "changes_requested" : "commented",
        body: spoken.map((n) => `@${n.author.username}: ${n.body}`).join("\n\n"),
      });
    } else {
      for (const n of spoken) {
        comments.push({ author: n.author.username, body: n.body, created_at: n.created_at });
      }
    }
  }
  return { ...toRecord(mr), reviews, comments };
}

/** GitLab's `message`/`error` text of an answer, as one string. */
function detailOf(json) {
  const detail = json?.message ?? json?.error ?? "";
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

/**
 * A Draft (when `draft` is "1") MR labelled hitl, with no reviewers or assignees. When GitLab
 * answers 409 because an open MR for this head and base exists, that MR gains the hitl label
 * if it lacks it, its record is printed and the shim exits 3.
 */
async function create(ctx, [base, head, title, bodyFile, draft]) {
  const sentTitle = draft === "1" && !GITLAB_DRAFT.test(title) ? `Draft: ${title}` : title;
  const { status, json } = await api(ctx, "POST", "/merge_requests", {
    body: {
      source_branch: head,
      target_branch: base,
      title: sentTitle,
      description: readFileSync(bodyFile, "utf8"),
      labels: "hitl",
    },
    allow: [409],
  });
  if (status !== 409) return toRecord(json);
  const [existing] = await paged(ctx, "/merge_requests", {
    source_branch: head,
    target_branch: base,
    state: "opened",
  });
  if (!existing) fail(`GitLab 409: ${detailOf(json)}`);
  let mr = existing;
  if (!(mr.labels ?? []).includes("hitl")) {
    ({ json: mr } = await api(ctx, "PUT", `/merge_requests/${mr.iid}`, {
      body: { add_labels: "hitl" },
    }));
  }
  process.stdout.write(`${JSON.stringify(toRecord(mr))}\n`);
  process.exit(3);
}

/** Replace the description only: the title is never sent, so Draft status stands. */
async function edit(ctx, [number, bodyFile]) {
  const { json } = await api(ctx, "PUT", `/merge_requests/${number}`, {
    body: { description: readFileSync(bodyFile, "utf8") },
  });
  return toRecord(json);
}

async function comment(ctx, [number, bodyFile]) {
  await api(ctx, "POST", `/merge_requests/${number}/notes`, {
    body: { body: readFileSync(bodyFile, "utf8") },
  });
  const { json } = await api(ctx, "GET", `/merge_requests/${number}`);
  return toRecord(json);
}

async function retarget(ctx, [number, base]) {
  const { json } = await api(ctx, "PUT", `/merge_requests/${number}`, {
    body: { target_branch: base },
  });
  return toRecord(json);
}

const VERBS = { list, view, create, edit, comment, retarget };

async function main(argv) {
  const [verb, ...args] = argv;
  const run = VERBS[verb];
  if (!run) fail(`unknown verb: ${verb}`);
  const ctx = context(process.env);
  const out = await run(ctx, args);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1].
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) await main(process.argv.slice(2));

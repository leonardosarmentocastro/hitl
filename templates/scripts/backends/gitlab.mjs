#!/usr/bin/env node
// hitl PR shim — GitLab backend, run by backend.sh as `node gitlab.mjs <verb> <args…>` with the
// arguments pr.sh passes to backend_<verb>. Talks to GitLab's REST API with Node's built-in
// fetch; zero dependencies. Prints one JSON document on stdout; exit 2 with a message on stderr
// on any failure. The token goes only in the PRIVATE-TOKEN header, only to the API base the
// host rule resolved from the origin remote, and is never printed.
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
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

const VERBS = {};

async function main(argv) {
  const [verb, ...args] = argv;
  const ctx = context(process.env);
  const run = VERBS[verb];
  if (!run) fail(`${verb} is not available on GitLab yet`);
  const out = await run(ctx, args);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1].
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) await main(process.argv.slice(2));

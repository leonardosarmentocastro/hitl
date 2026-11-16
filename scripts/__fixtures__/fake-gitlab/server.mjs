#!/usr/bin/env node
// Fake GitLab REST API for the PR-shim tests. Run as
//   node server.mjs --state <json file> --log <file>
// It listens on 127.0.0.1, port 0, and prints {"port":<n>} as its first stdout line. The state
// file is re-read on every request:
//   { mode?: "ok"|"fail"|"redirect", project?: <url-encoded id, default "g%2Fr">,
//     failFromPage?: n (a paged list answers 500 from page n on),
//     htmlFromPage?: n (a paged list answers 200 with an HTML body from page n on),
//     mergeRequests: MR[], approvals: { [iid]: { approved_by: [{ user: { username } }] } },
//     discussions: { [iid]: Discussion[] } }
// with MR and Discussion in GitLab's REST shape. Every request appends one JSON line to the
// log: { method, path, query, token, body }.
import { appendFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const STATE = opt("--state");
const LOG = opt("--log");
if (!STATE || !LOG) {
  process.stderr.write("usage: server.mjs --state <file> --log <file>\n");
  process.exit(1);
}

function send(res, status, json, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(json));
}

/** One page of `items`, with GitLab's x-next-page header. */
function sendPage(res, items, query, state) {
  const perPage = Number(query.per_page ?? 20) || 20;
  const page = Number(query.page ?? 1) || 1;
  if (state.failFromPage && page >= state.failFromPage) {
    return send(res, 500, { message: "boom" });
  }
  if (state.htmlFromPage && page >= state.htmlFromPage) {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end("<html><body>proxy login</body></html>");
  }
  const slice = items.slice((page - 1) * perPage, page * perPage);
  const next = page * perPage < items.length ? String(page + 1) : "";
  send(res, 200, slice, { "x-next-page": next, "x-page": String(page) });
}

function handle(req, res, bodyText) {
  const url = new URL(req.url, "http://127.0.0.1");
  const query = Object.fromEntries(url.searchParams);
  const token = req.headers["private-token"] ?? null;
  let body = null;
  if (bodyText !== "") {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }
  }
  appendFileSync(
    LOG,
    `${JSON.stringify({ method: req.method, path: url.pathname, query, token, body })}\n`,
  );

  const state = JSON.parse(readFileSync(STATE, "utf8"));
  if (state.mode === "fail") return send(res, 500, { message: "boom" });
  if (state.mode === "redirect") {
    return send(res, 301, { message: "moved" }, { location: "http://127.0.0.1:1/elsewhere" });
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "v4" || parts[2] !== "projects") {
    return send(res, 404, { error: "404 Not Found" });
  }
  if (parts[3] !== (state.project ?? "g%2Fr")) {
    return send(res, 404, { message: "404 Project Not Found" });
  }
  const rest = parts.slice(4);
  const mrs = state.mergeRequests ?? [];

  if (req.method === "GET" && rest.length === 1 && rest[0] === "merge_requests") {
    const labelsWanted = query.labels ? query.labels.split(",") : [];
    const items = mrs.filter(
      (mr) =>
        (!query.state || query.state === "all" || mr.state === query.state) &&
        labelsWanted.every((l) => (mr.labels ?? []).includes(l)) &&
        (!query.source_branch || mr.source_branch === query.source_branch) &&
        (!query.target_branch || mr.target_branch === query.target_branch),
    );
    return sendPage(res, items, query, state);
  }

  if (rest[0] === "merge_requests" && rest.length >= 2) {
    const iid = Number(rest[1]);
    const mr = mrs.find((m) => m.iid === iid);
    if (!mr) return send(res, 404, { message: "404 Not found" });
    if (req.method === "GET" && rest.length === 2) return send(res, 200, mr);
    if (req.method === "GET" && rest[2] === "approvals" && rest.length === 3) {
      return send(res, 200, state.approvals?.[iid] ?? { approved_by: [] });
    }
    if (req.method === "GET" && rest[2] === "discussions" && rest.length === 3) {
      return sendPage(res, state.discussions?.[iid] ?? [], query, state);
    }
  }
  return send(res, 404, { error: "404 Not Found" });
}

const server = createServer((req, res) => {
  let bodyText = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => (bodyText += chunk));
  req.on("end", () => {
    try {
      handle(req, res, bodyText);
    } catch (e) {
      send(res, 500, { message: `fake gitlab: ${e.message}` });
    }
  });
});

server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`);
});

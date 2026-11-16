// hitl host rule — which code host a repository's origin remote points at, and for GitLab the
// API base and the project id. Self-contained (Node's own modules only), so it can be copied
// beside the GitLab backend and imported by the installer alike.
//
// The rule: github.com → github; bitbucket.org → bitbucket; gitlab.com → gitlab (API base
// https://gitlab.com, whatever GITLAB_URL says); a remote whose hostname equals GITLAB_URL's →
// gitlab (API base GITLAB_URL); anything else → unknown. Hostnames compare case-insensitively
// and ignore the port. An empty GITLAB_URL is unset; one that is not an http(s) URL, or that
// ends in /api/v4, is a `problem` and is otherwise treated as unset.
//
// Run as a program (`node host.mjs`), it prints the host word of the current directory's origin
// remote — `unknown` when there is no origin or no repository — and exits 0.

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Split a remote url (https, ssh:// or scp-style) into its lower-cased hostname and path. */
function parseRemote(remote) {
  const url = remote.match(
    /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]+@)?(\[[^\]]+\]|[^/:]+)(?::\d*)?(\/.*)?$/i,
  );
  if (url) {
    return { scheme: url[1].toLowerCase(), hostname: url[2].toLowerCase(), path: url[3] ?? "" };
  }
  const scp = remote.match(/^(?:[^@/]+@)?([^/:]+):(.*)$/);
  if (scp) return { scheme: "scp", hostname: scp[1].toLowerCase(), path: scp[2] };
  return null;
}

/** GITLAB_URL as { hostname, base, path } or { problem }; null when unset. */
function parseGitlabUrl(value) {
  if (value === undefined || value === null || value === "") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return { problem: "bad-gitlab-url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { problem: "bad-gitlab-url" };
  const path = url.pathname.replace(/\/+$/, "");
  if (/\/api\/v4$/i.test(path)) return { problem: "gitlab-url-has-api-path" };
  return { hostname: url.hostname.toLowerCase(), base: `${url.origin}${path}`, path };
}

/** The project id: the path without slashes at its ends or a trailing .git, URL-encoded. */
function projectOf(path) {
  const clean = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  return encodeURIComponent(clean);
}

/**
 * { host: github|gitlab|bitbucket|unknown, apiBase?, project?, problem? }. apiBase (no
 * trailing slash, no /api/v4) and project (URL-encoded) are present exactly for gitlab.
 */
export function resolveHost(remote, env = process.env) {
  const gitlab = parseGitlabUrl(env.GITLAB_URL);
  const result = (fields) => (gitlab?.problem ? { ...fields, problem: gitlab.problem } : fields);

  const parsed = remote ? parseRemote(remote) : null;
  if (!parsed) return result({ host: "unknown" });
  const { scheme, hostname, path } = parsed;

  if (hostname === "github.com") return result({ host: "github" });
  if (hostname === "bitbucket.org") return result({ host: "bitbucket" });
  if (hostname === "gitlab.com") {
    return result({ host: "gitlab", apiBase: "https://gitlab.com", project: projectOf(path) });
  }
  if (gitlab && !gitlab.problem && hostname === gitlab.hostname) {
    let projectPath = path;
    const isWeb = scheme === "http" || scheme === "https";
    if (isWeb && gitlab.path !== "" && projectPath.startsWith(`${gitlab.path}/`)) {
      projectPath = projectPath.slice(gitlab.path.length);
    }
    return { host: "gitlab", apiBase: gitlab.base, project: projectOf(projectPath) };
  }
  return result({ host: "unknown" });
}

/** github | gitlab | bitbucket | unknown, from an https, ssh:// or scp-style remote url. */
export function hostOf(remote, env = process.env) {
  return resolveHost(remote, env).host;
}

/** The current directory's origin remote url, or null (no origin, or not a repository). */
function originOfCwd() {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

// Compare realpaths: Node resolves symlinks in import.meta.url but not in argv[1].
const isMain =
  process.argv[1] !== undefined &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  process.stdout.write(`${hostOf(originOfCwd())}\n`);
  process.exit(0);
}

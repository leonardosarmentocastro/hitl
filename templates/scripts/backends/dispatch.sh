#!/usr/bin/env bash
# hitl PR shim — the plugin's backend dispatcher. Sourced by pr.sh; never run directly. The
# plugin runs where nothing is installed, so it ships both backends beside it (backend-github.sh,
# backend-gitlab.sh) and picks one on the first backend call, from the host of the current
# directory's origin remote. The host rule lives only in host.mjs; this file just asks it.
# Resolving lazily keeps a usage error free of any git or host lookup.

hitl_load_backend() {
  local host
  host=$(node "$HERE/host.mjs") || host=unknown
  case "$host" in
    github) . "$HERE/backend-github.sh" ;;
    gitlab) . "$HERE/backend-gitlab.sh" ;;
    *)
      echo "pr.sh: no PR backend for this repository's host (${host:-unknown}): hitl opens PRs on GitHub and GitLab. A self-hosted GitLab needs GITLAB_URL set to its address." >&2
      exit 2
      ;;
  esac
}

# Each verb loads the backend, which redefines it, then calls the backend's own definition.
backend_view() { hitl_load_backend && backend_view "$@"; }
backend_list() { hitl_load_backend && backend_list "$@"; }
backend_create() { hitl_load_backend && backend_create "$@"; }
backend_edit() { hitl_load_backend && backend_edit "$@"; }
backend_comment() { hitl_load_backend && backend_comment "$@"; }
backend_retarget() { hitl_load_backend && backend_retarget "$@"; }

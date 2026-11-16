#!/usr/bin/env bash
# hitl PR shim — GitLab backend. Sourced by pr.sh; never run directly. Each verb forwards its
# arguments unchanged to gitlab.mjs beside it (Node's built-in fetch against GitLab's REST API;
# needs GITLAB_TOKEN, plus GITLAB_URL for a self-hosted instance). pr.sh runs under set -e, so
# the Node process's exit code is the shim's.

backend_view() { node "$HERE/gitlab.mjs" view "$@"; }
backend_list() { node "$HERE/gitlab.mjs" list "$@"; }
backend_create() { node "$HERE/gitlab.mjs" create "$@"; }
backend_edit() { node "$HERE/gitlab.mjs" edit "$@"; }
backend_comment() { node "$HERE/gitlab.mjs" comment "$@"; }
backend_retarget() { node "$HERE/gitlab.mjs" retarget "$@"; }

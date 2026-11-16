# Handover — gitlab-mr

Launch: `cd .claude/worktrees/gitlab-mr && claude --model opus` then `/implement-stack docs/superpowers/handover/gitlab-mr.md`
Mode: start
Feature branch: feat/gitlab-mr
Spec(s): docs/superpowers/specs/2026-11-15-gitlab-mr-design.md

## Stack

| slice | plan | branch | parent | status | owns |
|---|---|---|---|---|---|
| 1 | docs/superpowers/plans/2026-11-15-gitlab-mr-slice-1-installed-wipe-pr.md | feat/gitlab-mr-slice-1-installed-wipe-pr | feat/gitlab-mr | open #37 | an installed repository's feature documents leave through the generated wipe PR built by `/umbrella-pr`. |
| 2 | docs/superpowers/plans/2026-11-15-gitlab-mr-slice-2-ci-wipe-removed.md | feat/gitlab-mr-slice-2-ci-wipe-removed | feat/gitlab-mr-slice-1-installed-wipe-pr | open #38 | the GitHub Actions wipe job, its script, its init question and the `ci` choice are gone; an upgrade removes them; the doctrine states that the last PR of every stack is the generated wipe PR. |
| 3 | docs/superpowers/plans/2026-11-15-gitlab-mr-slice-3-gitlab-read.md | feat/gitlab-mr-slice-3-gitlab-read | feat/gitlab-mr-slice-2-ci-wipe-removed | open #39 | the PR shim's `list` and `view` answer from GitLab over REST — with the one host rule (`GITLAB_URL` matched against the remote), the token and host refusals, and `ref` on the record of both backends. |
| 4 | docs/superpowers/plans/2026-11-15-gitlab-mr-slice-4-gitlab-write.md | feat/gitlab-mr-slice-4-gitlab-write | feat/gitlab-mr-slice-3-gitlab-read | open #40 | the PR shim's `create` (Draft, labelled, exit 3 when one exists), `edit`, `comment` and `retarget` work on GitLab; every text hitl posts or reports names a PR by its `ref`. |
| 5 | docs/superpowers/plans/2026-11-15-gitlab-mr-slice-5-install-on-gitlab.md | feat/gitlab-mr-slice-5-install-on-gitlab | feat/gitlab-mr-slice-4-gitlab-write | open #41 | `/hitl:init`, `/hitl:init --adopt` and `/hitl:help` accept and describe a GitLab repository: the installer renders the GitLab backend for `provider: gitlab`, and the prerequisite is the token, not `gh`. |
| 6 | docs/superpowers/plans/2026-11-15-gitlab-mr-slice-6-no-install-on-gitlab.md | feat/gitlab-mr-slice-6-no-install-on-gitlab | feat/gitlab-mr-slice-5-install-on-gitlab | todo | without an install, the plugin's shim picks the GitLab or GitHub backend from the repository's remote, and the plugin's commands run a stack on GitLab. |

## Umbrella PR body

Plan: docs/superpowers/specs/2026-11-15-gitlab-mr-design.md

## TL;DR

**What** — hitl can now run a whole stack on a GitLab project the way it does on GitHub: Draft merge requests that each target their parent, a Draft umbrella merge request, and status read back from the host. It works in an installed repository and without an install, on gitlab.com or a self-hosted instance, and needs only an access token in the environment. Alongside that, every stack on every host now ends the same way: with a generated PR that removes the feature's design documents.

**Why** — A real 13-slice run on a GitLab project only worked because someone hand-wrote replacements for hitl's commands using raw API calls; the machine had no GitLab command-line tool. GitLab also has no equivalent of the GitHub-only CI job that used to delete the design documents after merge, so that clean-up had to stop depending on one host.

**How** — The GitLab side talks to GitLab's web API directly from Node, so there is nothing to install beyond what hitl already requires; the GitHub side keeps using the GitHub command-line tool, and one shared set of tests holds both to the same contract. Because GitLab cannot search merge requests by branch-name prefix, every merge request hitl opens carries a `hitl` label and listings filter on it — one opened by hand without the label is invisible until the label is added. A self-hosted instance is recognised only when the repository's remote matches the address the user exported, and the token is never sent anywhere else nor along a redirect. PRs are named in prose by a host-specific reference (`!12` on GitLab, `#12` on GitHub) so links do not point at issues by mistake. The GitHub Actions wipe job and its init question are removed; existing installs lose them on their next upgrade and gain the wipe-PR builder instead.

## Slices

<!-- stack -->
| slice | title | PR |
|---|---|---|
| 1 | Installed wipe PR | — |
| 2 | CI wipe job removed | — |
| 3 | GitLab backend, reading | — |
| 4 | GitLab backend, writing | — |
| 5 | Install on GitLab | — |
| 6 | No-install on GitLab | — |
<!-- /stack -->

## Notes

Spec, plans and this document are transient and are removed from `main` after merge. This
description is the durable record.

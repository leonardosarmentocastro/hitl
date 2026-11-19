# Changelog

What changes for a repository that has hitl installed, or for someone who runs it without an install.

## Unreleased

- `elaborate` no longer includes the security review: it is now one cold review and one adversarial review. The mode that includes the security review is called `complete`. A spec that says `**Review mode:** elaborate` and should keep its security review must be changed to `complete` by hand. Everyone working on a repository should update the plugin together: an older plugin refuses `complete` and still runs the security review for `elaborate`.

## 0.3.0

- The first release with a changelog; earlier changes are not listed.

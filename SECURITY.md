# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Use GitHub's private
reporting instead: the **Report a vulnerability** button on this repo's
[Security tab](https://github.com/Zalaras/muster/security/advisories/new). Only the
maintainer sees the report.

Include what you can of: the `musterd -version` output, the Claude Code version, what you
did, and what happened. Proof-of-concept detail is welcome; a fix suggestion is not required.

## What to expect

Muster is a personal tool with a single maintainer. Reports are handled on a best-effort
basis: an acknowledgement when read, a fix in a release when one is warranted, and a note in
the advisory. There is **no bug bounty** and no fixed response time.

## Supported versions

Only the **latest release** is supported. Older releases are not patched; upgrade with
`make install` (see `README.md` § Install).

## What is in scope

Anything in this repo: the `musterd` daemon, the embedded dashboard, the tmux integration,
the hook and status-line ingest, and the GitHub issue-filing path (which reads your `gh`
token at time of use and stores nothing). Claude Code itself and `gh` are out of scope —
report those to their maintainers.

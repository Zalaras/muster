# Contributing to Muster

Muster is a personal tool with one maintainer, built through a fixed multi-agent pipeline
(`CLAUDE.md` § Workflow). That shapes what is and isn't open:

- **Bug reports and feature requests are welcome.** Two ways to file, below.
- **Pull requests are not accepted at this time.** Outside changes don't fit the pipeline
  yet, and an unreviewed PR would sit open indefinitely, so it will be closed without
  review. This is a capacity decision, not a judgement on the change.
- **Forks are fine.** The [MIT licence](LICENSE) lets you take the code wherever you like.

If the policy changes, this file is where it will say so.

## Filing an issue

- **The dashboard's `Issue` button** (masthead). It attaches a snapshot of muster's own
  state — session states, timings, context percentages — built from a strict allowlist
  that never includes prompt text, hook payloads, pane contents, directories, branches or
  repo names. The dialog shows the exact payload before you post, and what you see is
  byte-for-byte what gets sent.
- **[GitHub directly](https://github.com/Zalaras/muster/issues)**, if you'd rather not
  attach anything.

Two things to know about the button:

- **The issue is public**, filed on this repo under **your** GitHub account, so read the
  preview as you would any public post.
- **It needs the `gh` CLI, logged in.** Muster takes the token from `gh auth token` at the
  moment you click, stores nothing, and has no login flow of its own. If filing fails with
  an auth error, run `gh auth login` and try again.

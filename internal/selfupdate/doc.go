// Package selfupdate is to GitHub Releases what internal/claudecode is to Claude Code:
// the one place that knows the redirect shape of {base}/latest, GoReleaser's asset
// naming and checksums.txt format, and the minisign signature file format. It knows
// nothing about the daemon's HTTP surface, its store, or tmux — internal/server owns the
// poller, apply serialisation and the wire messages; cmd/musterd owns the -update flag,
// the install classification at startup, and the in-place re-exec (plan auto-update,
// 2026-09-10).
package selfupdate

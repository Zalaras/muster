package claudecode

// LaunchParams are the neutral inputs to building the `claude` CLI invocation
// (docs/protocol.md §3.1). Validation of these values (non-empty model, a known
// permission mode) is the caller's job — BuildArgv only assembles argv.
type LaunchParams struct {
	Model          string
	Title          string // optional; empty omits --name
	PermissionMode string // "default" | "plan" | "acceptEdits"
}

// BuildArgv returns the full argv (binary included) for launching `claude` with p.
// `--permission-mode` is confirmed by spike S2 (`--permission-mode plan`,
// `--permission-mode acceptEdits`); "default" needs no flag — it's Claude Code's own
// default and carries no CLI flag of its own.
func BuildArgv(binary string, p LaunchParams) []string {
	args := []string{binary, "--model", p.Model}
	if p.Title != "" {
		args = append(args, "--name", p.Title)
	}
	switch p.PermissionMode {
	case "plan", "acceptEdits":
		args = append(args, "--permission-mode", p.PermissionMode)
	}
	return args
}

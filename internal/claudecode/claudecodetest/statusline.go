package claudecodetest

func statusLineBase(sessionID string) map[string]any {
	return map[string]any{
		"session_id":          sessionID,
		"transcript_path":     defaultTranscriptPath,
		"cwd":                 defaultCWD,
		"version":             defaultClaudeVersion,
		"workspace":           map[string]any{"current_dir": "/tmp", "project_dir": "/tmp", "added_dirs": []any{}},
		"output_style":        map[string]any{"name": "default"},
		"thinking":            map[string]any{"enabled": false},
		"fast_mode":           false,
		"exceeds_200k_tokens": false,
	}
}

type StatusLinePreFirstResponseOpts struct {
	MusterSession int
	TmuxPane      string
	SessionName   string
	EffortLevel   string
}

func EnvelopedStatusLinePreFirstResponse(sessionID string, opts StatusLinePreFirstResponseOpts) string {
	payload := statusLineBase(sessionID)
	payload["model"] = map[string]any{"id": defaultModelID, "display_name": defaultModelDisplay}
	payload["context_window"] = map[string]any{
		"context_window_size":  defaultContextWindow,
		"used_percentage":      nil,
		"remaining_percentage": nil,
		"total_input_tokens":   0,
		"total_output_tokens":  0,
		"current_usage":        nil,
	}
	if opts.SessionName != "" {
		payload["session_name"] = opts.SessionName
	}
	addEffort(payload, opts.EffortLevel)
	return marshal(envelope(opts.MusterSession, opts.TmuxPane, payload))
}

func addEffort(payload map[string]any, level string) {
	if level != "" {
		payload["effort"] = map[string]any{"level": level}
	}
}

// StatusLineFullOpts overrides EnvelopedStatusLineFull's defaults (musterSession 1, model
// "claude-haiku-4-5-20251001"/"Haiku 4.5", 42% context used / 84000 input tokens / 200000
// window, 61% five-hour / 23% seven-day usage, both resetting at a fixed far-future epoch).
// TmuxPane has no default: left empty, it omits the envelope's tmuxPane field (the headless
// shape) rather than filling one in. Every default is fixed and non-wall-clock-dependent so
// two zero-value calls are byte-identical, which dedup tests depend on.
type StatusLineFullOpts struct {
	MusterSession    int
	TmuxPane         string
	SessionName      string
	ModelID          string
	ModelDisplayName string
	UsedPct          *float64
	TotalInputTokens int64
	WindowSize       int64
	FiveHourPct      float64
	FiveHourResetsAt int64
	SevenDayPct      float64
	SevenDayResetsAt int64
	PromptCache      *PromptCacheOpts
	EffortLevel      string
	CurrentDir       string
	AddedDirs        []string
}

type PromptCacheOpts struct {
	ExpiresAt int64
	TTL       string
}

const farFutureResetsAt = 4070908800

func EnvelopedStatusLineFull(sessionID string, opts StatusLineFullOpts) string {
	payload := statusLineFullPayload(sessionID, opts)
	return marshal(envelope(opts.MusterSession, opts.TmuxPane, payload))
}

func RawStatusLineFull(sessionID string, opts StatusLineFullOpts) string {
	return marshal(statusLineFullPayload(sessionID, opts))
}

func statusLineFullPayload(sessionID string, opts StatusLineFullOpts) map[string]any {
	modelID := orDefault(opts.ModelID, defaultModelID)
	modelDisplayName := orDefault(opts.ModelDisplayName, defaultModelDisplay)
	usedPct := 42.0
	if opts.UsedPct != nil {
		usedPct = *opts.UsedPct
	}
	totalInputTokens := opts.TotalInputTokens
	if totalInputTokens == 0 {
		totalInputTokens = 84000
	}
	windowSize := opts.WindowSize
	if windowSize == 0 {
		windowSize = defaultContextWindow
	}
	fiveHourPct := opts.FiveHourPct
	if fiveHourPct == 0 {
		fiveHourPct = 61
	}
	fiveHourResetsAt := opts.FiveHourResetsAt
	if fiveHourResetsAt == 0 {
		fiveHourResetsAt = farFutureResetsAt
	}
	sevenDayPct := opts.SevenDayPct
	if sevenDayPct == 0 {
		sevenDayPct = 23
	}
	sevenDayResetsAt := opts.SevenDayResetsAt
	if sevenDayResetsAt == 0 {
		sevenDayResetsAt = farFutureResetsAt
	}

	payload := statusLineBase(sessionID)
	if opts.CurrentDir != "" || opts.AddedDirs != nil {
		dir := orDefault(opts.CurrentDir, defaultCWD)
		added := make([]any, 0, len(opts.AddedDirs))
		for _, d := range opts.AddedDirs {
			added = append(added, d)
		}
		payload["cwd"] = dir
		payload["workspace"] = map[string]any{"current_dir": dir, "project_dir": dir, "added_dirs": added}
	}
	payload["model"] = map[string]any{"id": modelID, "display_name": modelDisplayName}
	payload["context_window"] = map[string]any{
		"context_window_size":  windowSize,
		"used_percentage":      usedPct,
		"remaining_percentage": 100 - usedPct,
		"total_input_tokens":   totalInputTokens,
		"total_output_tokens":  49,
		"current_usage": map[string]any{
			"input_tokens": 10, "output_tokens": 49,
			"cache_creation_input_tokens": 15558, "cache_read_input_tokens": 23318,
		},
	}
	payload["rate_limits"] = map[string]any{
		"five_hour": map[string]any{"used_percentage": fiveHourPct, "resets_at": fiveHourResetsAt},
		"seven_day": map[string]any{"used_percentage": sevenDayPct, "resets_at": sevenDayResetsAt},
	}
	if opts.SessionName != "" {
		payload["session_name"] = opts.SessionName
	}
	if opts.PromptCache != nil {
		payload["prompt_cache"] = map[string]any{
			"warm": true, "ttl": opts.PromptCache.TTL, "expires_at": opts.PromptCache.ExpiresAt,
			"caching_observed": true, "requests": 3,
		}
	}
	addEffort(payload, opts.EffortLevel)
	return payload
}

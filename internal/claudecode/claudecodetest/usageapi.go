package claudecodetest

type UsageWindowOpt struct {
	DisplayName string
	Percent     float64
	ResetsAt    string
}

func UsageAPIBody(windows ...UsageWindowOpt) string {
	return UsageAPIBucketsBody(nil, nil, windows...)
}

type UsageBucketOpt struct {
	Percent  float64
	ResetsAt string
}

func UsageAPIBucketsBody(fiveHour, sevenDay *UsageBucketOpt, windows ...UsageWindowOpt) string {
	body := map[string]any{}
	for key, b := range map[string]*UsageBucketOpt{"five_hour": fiveHour, "seven_day": sevenDay} {
		if b != nil {
			body[key] = map[string]any{"utilization": b.Percent, "resets_at": b.ResetsAt}
		}
	}
	limits := []any{
		map[string]any{"kind": "session", "percent": 12, "resets_at": farFutureResetsAt, "scope": nil},
		map[string]any{"kind": "weekly_all", "percent": 30, "resets_at": farFutureResetsAt, "scope": nil},
	}
	for _, w := range windows {
		var resetsAt any = farFutureResetsAt
		if w.ResetsAt != "" {
			resetsAt = w.ResetsAt
		}
		limits = append(limits, map[string]any{
			"kind":      "weekly_scoped",
			"percent":   w.Percent,
			"resets_at": resetsAt,
			"scope":     map[string]any{"model": map[string]any{"id": nil, "display_name": w.DisplayName}},
		})
	}
	body["limits"] = limits
	return marshal(body)
}

func OAuthCredentialsBody(token string) string {
	return marshal(map[string]any{
		"claudeAiOauth": map[string]any{"accessToken": token},
	})
}

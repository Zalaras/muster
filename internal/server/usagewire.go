package server

import "github.com/Zalaras/muster/internal/usage"

// usageMessage is the WS `usage` envelope (kb:anchor/ws.usage).
type usageMessage struct {
	Type  string    `json:"type"`
	Usage UsageInfo `json:"usage"`
}

// toWireUsage converts the two independent usage sources — the status-line Aggregator's
// snapshot and the per-model poller's ModelScoped snapshot (plan usage-model-bar,
// 2026-08-30) — into one wire object. It is the single mapping point for both, shared by
// every `usage` broadcast and every snapshot's embedded usage object, so the two halves
// can never drift apart and every caller builds the merged object from both holders'
// Current() at send time (Edge Case 10).
func toWireUsage(snap usage.Snapshot, model usage.ModelSnapshot) UsageInfo {
	out := UsageInfo{Source: snap.Source, ModelScopedSource: model.Source, SampledAt: wireTimePtr(snap.SampledAt)}
	if snap.FiveHour != nil {
		out.FiveHour = &UsageBucket{
			UsedPct:  snap.FiveHour.UsedPct,
			ResetsAt: wireTime(snap.FiveHour.ResetsAt),
		}
	}
	if snap.SevenDay != nil {
		out.SevenDay = &UsageBucket{
			UsedPct:  snap.SevenDay.UsedPct,
			ResetsAt: wireTime(snap.SevenDay.ResetsAt),
		}
	}
	if snap.Model != nil {
		out.Model = &sessionWireModel{ID: snap.Model.ID, DisplayName: snap.Model.DisplayName}
	}

	// model.Windows is nil until the first successful fetch; a non-nil (possibly
	// empty) slice is a distinct, valid successful result (REQ-14/INV-1) — only
	// assign out.ModelScoped inside this branch so the "never fetched" case keeps it
	// nil (renders `null`, no `omitempty` on the field).
	if model.Windows != nil {
		windows := make([]UsageModelWindow, len(model.Windows))
		for i, w := range model.Windows {
			windows[i] = UsageModelWindow{
				DisplayName: w.DisplayName,
				UsedPct:     w.UsedPct,
				ResetsAt:    wireTime(w.ResetsAt),
			}
		}
		out.ModelScoped = windows
	}
	out.ModelScopedAt = wireTimePtr(model.At)
	out.ModelScopedError = model.Error

	return out
}

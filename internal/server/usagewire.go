package server

import "github.com/Zalaras/muster/internal/usage"

// usageMessage is the WS `usage` envelope (kb:anchor/ws.usage).
type usageMessage struct {
	Type  string    `json:"type"`
	Usage UsageInfo `json:"usage"`
}

// UsageBucket is one of the five-hour/seven-day usage readouts (kb:anchor/ws.usage).
type UsageBucket struct {
	UsedPct  float64 `json:"usedPct"`
	ResetsAt string  `json:"resetsAt"`
}

// UsageModelWindow is one entry of the `usage.modelScoped` list (kb:anchor/ws.usage,
// kb:adr/usage-masthead-one-selectable-model-window) — one per-model weekly usage window.
type UsageModelWindow struct {
	DisplayName string  `json:"displayName"`
	UsedPct     float64 `json:"usedPct"`
	ResetsAt    string  `json:"resetsAt"`
}

// UsageInfo is the `usage` object inside a snapshot (kb:anchor/ws.usage). Model is the
// freshest sample's model, for the masthead readout — present as an explicit `null` key
// (no `omitempty`), matching FiveHour/SevenDay/SampledAt: null iff the buckets are null,
// not an absent key. ModelScoped/ModelScopedAt/ModelScopedError are the second,
// independent usage source: nil slice/pointer renders `null` on the wire (no `omitempty`)
// until the first successful fetch; an empty-but-non-nil ModelScoped is a valid, distinct
// successful result. ModelScopedSource is a wire constant in v1, never empty.
type UsageInfo struct {
	FiveHour          *UsageBucket       `json:"fiveHour"`
	SevenDay          *UsageBucket       `json:"sevenDay"`
	Model             *sessionWireModel  `json:"model"`
	SampledAt         *string            `json:"sampledAt"`
	Source            string             `json:"source"`
	ModelScoped       []UsageModelWindow `json:"modelScoped"`
	ModelScopedAt     *string            `json:"modelScopedAt"`
	ModelScopedError  *string            `json:"modelScopedError"`
	ModelScopedSource string             `json:"modelScopedSource"`
}

// emptyUsageInfo is UsageInfo's shape before either usage source has ever answered
// (kb:anchor/ws.usage) — buildSnapshot's placeholder, immediately overwritten by
// usageFeature.contribute in every real snapshot (usage is always registered). The two
// literals mirror usage.Aggregator/ModelScoped's own unexported defaults
// (defaultSource/defaultModelScopedSource in internal/usage) — this package has no
// zero-value holder to ask before New constructs one.
func emptyUsageInfo() UsageInfo {
	return UsageInfo{
		Source:            "subscription",
		ModelScopedSource: "subscription-api",
	}
}

// toWireUsage converts the two independent usage sources — the status-line Aggregator's
// snapshot and the per-model poller's ModelScoped snapshot
// (kb:adr/usage-model-window-polled-from-oauth-api) — into one wire object. It is the
// single mapping point for both, shared by every `usage` broadcast and every snapshot's
// embedded usage object, so the two halves can never drift apart and every caller builds
// the merged object from both holders' Current() at send time.
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
	// empty) slice is a distinct, valid successful result — only assign out.ModelScoped
	// inside this branch so the "never fetched" case keeps it nil (renders `null`, no
	// `omitempty` on the field).
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

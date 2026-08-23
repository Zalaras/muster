package server

import (
	"time"

	"github.com/Zalaras/muster/internal/usage"
)

// usageMessage is the WS `usage` envelope (docs/protocol.md §5.4).
type usageMessage struct {
	Type  string    `json:"type"`
	Usage UsageInfo `json:"usage"`
}

// toWireUsage converts a usage.Snapshot to its wire shape — shared by the `usage`
// broadcast and every snapshot's embedded usage object, so the two can never drift
// apart (mirrors toWireSession's role for sessions).
func toWireUsage(snap usage.Snapshot) UsageInfo {
	out := UsageInfo{Source: snap.Source}
	if snap.FiveHour != nil {
		out.FiveHour = &UsageBucket{
			UsedPct:  snap.FiveHour.UsedPct,
			ResetsAt: snap.FiveHour.ResetsAt.UTC().Format(time.RFC3339),
		}
	}
	if snap.SevenDay != nil {
		out.SevenDay = &UsageBucket{
			UsedPct:  snap.SevenDay.UsedPct,
			ResetsAt: snap.SevenDay.ResetsAt.UTC().Format(time.RFC3339),
		}
	}
	if snap.Model != nil {
		out.Model = &sessionWireModel{ID: snap.Model.ID, DisplayName: snap.Model.DisplayName}
	}
	if snap.SampledAt != nil {
		v := snap.SampledAt.UTC().Format(time.RFC3339)
		out.SampledAt = &v
	}
	return out
}

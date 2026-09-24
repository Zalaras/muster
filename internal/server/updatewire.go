package server

import "github.com/Zalaras/muster/internal/selfupdate"

// updateMessage is the WS `update` broadcast (kb:anchor/ws.update).
type updateMessage struct {
	Type   string     `json:"type"`
	Update UpdateInfo `json:"update"`
}

// UpdateApplyInfo is the `update.apply` object (kb:anchor/ws.update). Error is non-nil
// iff Phase is "failed"; Version is nil iff Phase is "idle".
type UpdateApplyInfo struct {
	Phase   string  `json:"phase"`
	Version *string `json:"version"`
	Error   *string `json:"error"`
}

// UpdateInfo is the `update` object, shared verbatim by the WS `update` broadcast and
// snapshot.update (kb:anchor/ws.update) — always present, even on a daemon with
// updates disabled entirely (-update-base-url "").
type UpdateInfo struct {
	Running   string          `json:"running"`
	Install   string          `json:"install"`
	Remedy    *string         `json:"remedy"`
	CanCheck  bool            `json:"canCheck"`
	Available *string         `json:"available"`
	CheckedAt *string         `json:"checkedAt"`
	Installed *string         `json:"installed"`
	Apply     UpdateApplyInfo `json:"apply"`
}

// defaultUpdateInfo is UpdateInfo's shape before updateFeature exists (kb:anchor/ws.update)
// — buildSnapshot's placeholder. Every real snapshot overwrites it via
// updateFeature.contribute, which additionally knows the Running/Install/Remedy values
// this can't (they aren't known until New constructs the feature).
func defaultUpdateInfo() UpdateInfo {
	return UpdateInfo{Apply: UpdateApplyInfo{Phase: string(selfupdate.PhaseIdle)}}
}

// buildUpdateInfo is the `update` wire object's one builder: updateManager.Current
// calls it with its live check state, and updateFeature.current calls it with the disabled
// defaults when no updateManager exists (BaseURL == ""). Both halves were assembling the
// same shape — including the Remedy pointer — by hand.
func buildUpdateInfo(install selfupdate.Install, running string, canCheck bool, available, checkedAt, installed *string, apply UpdateApplyInfo) UpdateInfo {
	return UpdateInfo{
		Running:   running,
		Install:   string(install.Kind),
		Remedy:    remedyPointer(install),
		CanCheck:  canCheck,
		Available: available,
		CheckedAt: checkedAt,
		Installed: installed,
		Apply:     apply,
	}
}

// remedyPointer is UpdateInfo.Remedy's mapping from selfupdate.Install: empty means no
// remedy sentence (an "installer" install, or no install classification at all).
func remedyPointer(install selfupdate.Install) *string {
	if install.Remedy == "" {
		return nil
	}
	r := install.Remedy
	return &r
}

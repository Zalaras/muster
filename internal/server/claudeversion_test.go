package server

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// versionRig is the injectable seams of a claudeVersionFeature: the identity look, the
// `claude --version` check and the broadcast. No test here runs a real claude.
type versionRig struct {
	mu         sync.Mutex
	id         claudecode.BinaryIdentity
	idErr      error
	report     claudecode.VersionReport
	checks     int
	deadlines  []bool
	broadcasts []ClaudeCodeInfo
	onCheck    func(ctx context.Context)
}

func binaryIdentity(n int64) claudecode.BinaryIdentity {
	return claudecode.BinaryIdentity{Path: "/bin/claude", Size: n, ModTime: time.Unix(n, 0)}
}

func versionReportFor(installed string) claudecode.VersionReport {
	floor, verified := claudecode.RangeOf(claudecode.ObservedVersions())
	return claudecode.VersionReport{
		Installed: &installed,
		Floor:     floor,
		Verified:  verified,
		Status:    claudecode.Classify(installed),
	}
}

func unknownVersionReport() claudecode.VersionReport {
	floor, verified := claudecode.RangeOf(claudecode.ObservedVersions())
	return claudecode.VersionReport{Floor: floor, Verified: verified, Status: claudecode.StatusUnknown, Err: errors.New("exit status 1")}
}

// versionOutcomes are the four statuses a check can resolve to, one report each.
func versionOutcomes() map[string]claudecode.VersionReport {
	return map[string]claudecode.VersionReport{
		"below":    versionReportFor("1.0.0"),
		"verified": versionReportFor(claudecode.Floor()),
		"above":    versionReportFor("99.0.0"),
		"unknown":  unknownVersionReport(),
	}
}

func (r *versionRig) set(id claudecode.BinaryIdentity, report claudecode.VersionReport) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.id, r.idErr, r.report = id, nil, report
}

func (r *versionRig) setIdentity(id claudecode.BinaryIdentity) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.id, r.idErr = id, nil
}

func (r *versionRig) setIdentityErr(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.idErr = err
}

func (r *versionRig) identify() (claudecode.BinaryIdentity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.id, r.idErr
}

func (r *versionRig) check(ctx context.Context) claudecode.VersionReport {
	r.mu.Lock()
	r.checks++
	_, hasDeadline := ctx.Deadline()
	r.deadlines = append(r.deadlines, hasDeadline)
	hook := r.onCheck
	r.mu.Unlock()
	if hook != nil {
		hook(ctx)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.report
}

func (r *versionRig) broadcast(info ClaudeCodeInfo) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.broadcasts = append(r.broadcasts, info)
}

func (r *versionRig) checkCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.checks
}

func (r *versionRig) broadcastsSoFar() []ClaudeCodeInfo {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]ClaudeCodeInfo(nil), r.broadcasts...)
}

// newVersionFeature builds the feature through its constructor, then swaps the three seams
// for the rig's.
func newVersionFeature(t *testing.T, poll time.Duration, logs *bytes.Buffer) (*claudeVersionFeature, *versionRig) {
	t.Helper()
	log := zerolog.Nop()
	if logs != nil {
		log = zerolog.New(logs)
	}
	f := newClaudeVersionFeature(ClaudeVersionConfig{Poll: poll}, "claude-never-run", newWSHub(log), log)
	rig := &versionRig{}
	f.identify, f.check, f.broadcast = rig.identify, rig.check, rig.broadcast
	return f, rig
}

func installedOf(t *testing.T, info ClaudeCodeInfo) string {
	t.Helper()
	require.NotNil(t, info.Installed)
	return *info.Installed
}

func TestClaudeVersion_StartsNotCheckedWithFloorAndVerifiedPopulated(t *testing.T) {
	f, _ := newVersionFeature(t, time.Hour, nil)

	got := f.Current()

	assert.Nil(t, got.Installed)
	assert.Equal(t, "unknown", got.Status)
	assert.Equal(t, claudecode.Floor(), got.Floor)
	assert.Equal(t, claudecode.Verified(), got.Verified)
}

func TestClaudeVersion_IdentityChangeRunsExactlyOneCheckAndBroadcastsOnce(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))

	f.tick(context.Background())

	assert.Equal(t, 1, rig.checkCount())
	got := rig.broadcastsSoFar()
	require.Len(t, got, 1)
	assert.Equal(t, "99.0.0", installedOf(t, got[0]))
	assert.Equal(t, "above", got[0].Status)
	assert.Equal(t, got[0], f.Current(), "the broadcast value is the held value")

	rig.set(binaryIdentity(2), versionReportFor(claudecode.Floor()))
	f.tick(context.Background())

	assert.Equal(t, 2, rig.checkCount(), "a second identity runs exactly one more check")
	got = rig.broadcastsSoFar()
	require.Len(t, got, 2)
	assert.Equal(t, "verified", got[1].Status)
	assert.Equal(t, claudecode.Floor(), installedOf(t, f.Current()))
}

func TestClaudeVersion_UnchangedIdentityRunsNoCheck(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	f.tick(context.Background())
	require.Equal(t, 1, rig.checkCount())

	for range 5 {
		f.tick(context.Background())
	}

	assert.Equal(t, 1, rig.checkCount(), "a look at an identity already checked is a stat, never a claude run")
	assert.Len(t, rig.broadcastsSoFar(), 1)
}

func TestClaudeVersion_IdentityFieldsEachTriggerACheck(t *testing.T) {
	base := binaryIdentity(1)
	tests := []struct {
		name string
		next claudecode.BinaryIdentity
	}{
		{"path", claudecode.BinaryIdentity{Path: "/other/claude", Size: base.Size, ModTime: base.ModTime}},
		{"size", claudecode.BinaryIdentity{Path: base.Path, Size: base.Size + 1, ModTime: base.ModTime}},
		{"mtime", claudecode.BinaryIdentity{Path: base.Path, Size: base.Size, ModTime: base.ModTime.Add(time.Second)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, rig := newVersionFeature(t, time.Hour, nil)
			rig.set(base, versionReportFor("99.0.0"))
			f.tick(context.Background())

			rig.set(tt.next, versionReportFor("99.0.0"))
			f.tick(context.Background())

			assert.Equal(t, 2, rig.checkCount())
		})
	}
}

func TestClaudeVersion_UnchangedResultBroadcastsNothing(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	f.tick(context.Background())
	require.Len(t, rig.broadcastsSoFar(), 1)

	rig.set(binaryIdentity(2), versionReportFor("99.0.0"))
	f.tick(context.Background())

	assert.Equal(t, 2, rig.checkCount(), "the new identity is checked")
	assert.Len(t, rig.broadcastsSoFar(), 1, "a check that lands on the same result pushes nothing")
}

func TestClaudeVersion_FirstUnknownResultEqualsTheNotCheckedValueAndBroadcastsNothing(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), unknownVersionReport())

	f.tick(context.Background())

	assert.Equal(t, 1, rig.checkCount())
	assert.Empty(t, rig.broadcastsSoFar(), "unknown over the initial unknown is no change")
	assert.Equal(t, "unknown", f.Current().Status)
}

func TestClaudeVersion_UnresolvableIdentityRunsNoCheckAndKeepsTheHeldValue(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	f.tick(context.Background())
	held := f.Current()

	rig.setIdentityErr(errors.New("exec: claude: not found"))
	for range 3 {
		f.tick(context.Background())
	}

	assert.Equal(t, 1, rig.checkCount())
	assert.Equal(t, held, f.Current())
	assert.Len(t, rig.broadcastsSoFar(), 1)

	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	f.tick(context.Background())
	assert.Equal(t, 1, rig.checkCount(), "the same identity resolving again after the swap is not re-checked")

	rig.set(binaryIdentity(2), versionReportFor("98.0.0"))
	f.tick(context.Background())
	assert.Equal(t, 2, rig.checkCount(), "a different identity after the swap is checked")
	assert.Equal(t, "98.0.0", installedOf(t, f.Current()))
}

func TestClaudeVersion_UnresolvableIdentityAtTheFirstLookStaysNotChecked(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.setIdentityErr(errors.New("not found"))

	f.tick(context.Background())

	assert.Zero(t, rig.checkCount())
	assert.Empty(t, rig.broadcastsSoFar())
	assert.Equal(t, "unknown", f.Current().Status)
}

// TestClaudeVersion_FailingCheckAfterAKnownValueReplacesItAndIsBroadcast pins the logged
// decision: hello.claudeCode is the latest result, so a failing check replaces a known
// value with unknown, pushes it, and still records the identity so a failing claude is not
// re-run every tick.
func TestClaudeVersion_FailingCheckAfterAKnownValueReplacesItAndIsBroadcast(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	f.tick(context.Background())
	require.Equal(t, "above", f.Current().Status)

	rig.set(binaryIdentity(2), unknownVersionReport())
	f.tick(context.Background())

	got := f.Current()
	assert.Equal(t, "unknown", got.Status)
	assert.Nil(t, got.Installed)
	assert.Equal(t, claudecode.Floor(), got.Floor)
	assert.Equal(t, claudecode.Verified(), got.Verified)
	pushed := rig.broadcastsSoFar()
	require.Len(t, pushed, 2)
	assert.Equal(t, got, pushed[1])

	for range 4 {
		f.tick(context.Background())
	}
	assert.Equal(t, 2, rig.checkCount(), "the failed identity is recorded: a failing claude is not re-run every tick")
	assert.Len(t, rig.broadcastsSoFar(), 2)
}

func TestClaudeVersion_CheckRunsUnderADeadline(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))

	f.tick(context.Background())

	rig.mu.Lock()
	defer rig.mu.Unlock()
	assert.Equal(t, []bool{true}, rig.deadlines, "a hung claude --version is bounded, never left to hang the watch")
}

func TestClaudeVersion_CheckInterruptedByShutdownDiscardsItsResult(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	ctx, cancel := context.WithCancel(context.Background())
	rig.onCheck = func(context.Context) { cancel() }

	f.tick(ctx)

	assert.Equal(t, "unknown", f.Current().Status)
	assert.Empty(t, rig.broadcastsSoFar())
}

// TestClaudeVersion_InstalledNullIffUnknownFromEveryStateAfterEveryOutcome crosses every
// outcome against every held state (the invariant is "installed null iff unknown, floor and
// verified always populated") rather than only the convenient initial state.
func TestClaudeVersion_InstalledNullIffUnknownFromEveryStateAfterEveryOutcome(t *testing.T) {
	outcomes := versionOutcomes()
	names := make([]string, 0, len(outcomes))
	for name := range outcomes {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, from := range append([]string{"initial"}, names...) {
		for _, to := range names {
			t.Run(fmt.Sprintf("%s then %s", from, to), func(t *testing.T) {
				f, rig := newVersionFeature(t, time.Hour, nil)
				next := int64(1)
				if from != "initial" {
					rig.set(binaryIdentity(next), outcomes[from])
					f.tick(context.Background())
					next++
				}

				rig.set(binaryIdentity(next), outcomes[to])
				f.tick(context.Background())

				all := append(rig.broadcastsSoFar(), f.Current())
				for _, info := range all {
					assert.Equal(t, info.Status == "unknown", info.Installed == nil, "installed null iff unknown: %+v", info)
					assert.Equal(t, claudecode.Floor(), info.Floor)
					assert.Equal(t, claudecode.Verified(), info.Verified)
				}
				assert.Equal(t, to, f.Current().Status, "the latest result wins whatever the prior state")
			})
		}
	}
}

func TestClaudeVersion_StartDoesNotBlockOnTheFirstCheckAndRunsIt(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	started := make(chan struct{})
	release := make(chan struct{})
	rig.onCheck = func(ctx context.Context) {
		close(started)
		select {
		case <-release:
		case <-ctx.Done():
		}
	}

	f.Start()
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		f.Stop(ctx)
	})

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		require.FailNow(t, "the first check never started after Start")
	}
	assert.Equal(t, "unknown", f.Current().Status, "Start returned while the check is still running")

	close(release)
	require.Eventually(t, func() bool { return f.Current().Status == "above" }, 5*time.Second, 5*time.Millisecond)
	assert.Equal(t, 1, rig.checkCount())
	assert.Len(t, rig.broadcastsSoFar(), 1)
}

func TestClaudeVersion_LoopPicksUpABinaryReplacedBetweenLooks(t *testing.T) {
	f, rig := newVersionFeature(t, 5*time.Millisecond, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))

	f.Start()
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		f.Stop(ctx)
	})
	require.Eventually(t, func() bool { return f.Current().Status == "above" }, 5*time.Second, 5*time.Millisecond)

	rig.set(binaryIdentity(2), versionReportFor(claudecode.Floor()))

	require.Eventually(t, func() bool { return f.Current().Status == "verified" }, 5*time.Second, 5*time.Millisecond)
	assert.Equal(t, 2, rig.checkCount(), "many looks, one check per identity")
	assert.Len(t, rig.broadcastsSoFar(), 2)
}

func TestClaudeVersion_ZeroPollNeverLooksAndNeverChecks(t *testing.T) {
	f, rig := newVersionFeature(t, 0, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))

	f.Start()
	f.Stop(context.Background())

	assert.Zero(t, rig.checkCount())
	assert.Equal(t, "unknown", f.Current().Status)
}

func TestClaudeVersion_ConfigPollReachesTheFeature(t *testing.T) {
	srv := New(Config{Logger: zerolog.Nop(), ClaudeVersion: ClaudeVersionConfig{Poll: 7 * time.Second}})

	assert.Equal(t, 7*time.Second, srv.claudeVersion.interval)
	assert.Zero(t, New(Config{Logger: zerolog.Nop()}).claudeVersion.interval, "a zero-value Config never runs a check")
}

// TestClaudeVersion_WireSendsOneClaudeCodeMessagePerChangedResult drives the real hub: a
// connected client gets one claudeCode message per changed result and none for an unchanged one.
func TestClaudeVersion_WireSendsOneClaudeCodeMessagePerChangedResult(t *testing.T) {
	srv := newTestServer(t, notCheckedClaudeCode())
	rig := &versionRig{}
	srv.claudeVersion.identify, srv.claudeVersion.check = rig.identify, rig.check
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	c, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = c.CloseNow() }()
	hello := readJSON[helloWire](t, c)
	require.Equal(t, "unknown", hello.ClaudeCode.Status)
	require.Equal(t, "snapshot", readJSON[snapshotWire](t, c).Type)

	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	srv.claudeVersion.tick(context.Background())
	rig.set(binaryIdentity(2), versionReportFor("99.0.0"))
	srv.claudeVersion.tick(context.Background())
	rig.set(binaryIdentity(3), unknownVersionReport())
	srv.claudeVersion.tick(context.Background())

	first := readJSON[map[string]any](t, c)
	assert.ElementsMatch(t, []string{"type", "claudeCode"}, keysOf(first), "the message carries no timestamp or other key")
	assert.Equal(t, "claudeCode", first["type"])
	cc, ok := first["claudeCode"].(map[string]any)
	require.True(t, ok)
	assert.ElementsMatch(t, []string{"installed", "floor", "verified", "status"}, keysOf(cc))
	assert.Equal(t, "99.0.0", cc["installed"])
	assert.Equal(t, "above", cc["status"])

	second := readJSON[map[string]any](t, c)
	cc, ok = second["claudeCode"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "unknown", cc["status"], "the unchanged result between them pushed nothing")
	installed, present := cc["installed"]
	assert.True(t, present, "installed is a key, null rather than absent")
	assert.Nil(t, installed)
}

// TestClaudeVersion_HelloOfALateClientReadsTheLatestValueNotTheStartupOne checks:
// the hello is built per connection from the held value.
func TestClaudeVersion_HelloOfALateClientReadsTheLatestValueNotTheStartupOne(t *testing.T) {
	srv := newTestServer(t, notCheckedClaudeCode())
	rig := &versionRig{}
	srv.claudeVersion.identify, srv.claudeVersion.check = rig.identify, rig.check
	httpSrv := httptest.NewServer(srv.Handler())
	t.Cleanup(httpSrv.Close)
	wsURL := "ws" + httpSrv.URL[len("http"):] + "/ws"

	late, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = late.CloseNow() }()
	assert.Equal(t, "unknown", readJSON[helloWire](t, late).ClaudeCode.Status)

	rig.set(binaryIdentity(4), versionReportFor("98.0.0"))
	srv.claudeVersion.tick(context.Background())
	later, err := dialWS(t, wsURL, nil)
	require.NoError(t, err)
	defer func() { _ = later.CloseNow() }()
	laterHello := readJSON[helloWire](t, later)
	require.NotNil(t, laterHello.ClaudeCode.Installed)
	assert.Equal(t, "98.0.0", *laterHello.ClaudeCode.Installed)
}

func keysOf(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// TestClaudeVersion_IssueSnapshotReadsTheLatestValueNotTheStartupOne checks that the
// issue snapshot reads the held value.
func TestClaudeVersion_IssueSnapshotReadsTheLatestValueNotTheStartupOne(t *testing.T) {
	srv := newTestServer(t, notCheckedClaudeCode())
	rig := &versionRig{}
	srv.claudeVersion.identify, srv.claudeVersion.check = rig.identify, rig.check

	before := srv.issue.buildIssueSnapshot(context.Background(), time.Now(), nil)
	assert.Equal(t, "unknown", before.ClaudeCode.Status)
	assert.Nil(t, before.ClaudeCode.Installed)

	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	srv.claudeVersion.tick(context.Background())
	after := srv.issue.buildIssueSnapshot(context.Background(), time.Now(), nil)
	require.NotNil(t, after.ClaudeCode.Installed)
	assert.Equal(t, "99.0.0", *after.ClaudeCode.Installed)
	assert.Equal(t, "above", after.ClaudeCode.Status)

	rig.set(binaryIdentity(2), unknownVersionReport())
	srv.claudeVersion.tick(context.Background())
	failed := srv.issue.buildIssueSnapshot(context.Background(), time.Now(), nil)
	assert.Equal(t, "unknown", failed.ClaudeCode.Status)
	assert.Nil(t, failed.ClaudeCode.Installed)
}

// versionStub is a real executable stand-in for claude that prints output for --version.
// It is passed as a path, never a $PATH shim (docs/conventions.md §Testing).
func versionStub(t *testing.T, output string) string {
	t.Helper()
	path, err := cachedStub("claude", fmt.Sprintf("#!/bin/sh\necho %q\nexit 0\n", output))
	require.NoError(t, err)
	return path
}

// watchVersionOf runs one tick of a feature built as production builds it, on the
// constructor's own identity look and check: both resolve and exec bin.
func watchVersionOf(t *testing.T, bin string, logs *bytes.Buffer) *claudeVersionFeature {
	t.Helper()
	log := zerolog.New(logs)
	f := newClaudeVersionFeature(ClaudeVersionConfig{Poll: time.Hour}, bin, newWSHub(log), log)
	f.tick(context.Background())
	return f
}

// TestClaudeVersion_MapsEachStatusAndLogsAtTheRightLevel is the old
// TestCheckClaudeCode_MapsEachStatusAndLogsAtTheRightLevel against the feature: every
// status maps onto the held ClaudeCodeInfo, logs at the documented level (info for
// verified, warn otherwise), and the below line names the remedy.
func TestClaudeVersion_MapsEachStatusAndLogsAtTheRightLevel(t *testing.T) {
	tests := []struct {
		name          string
		output        string
		wantStatus    string
		wantInstalled string
		wantLevel     string
		wantMsgSubstr string
	}{
		{"below the floor warns and names the remedy", "1.0.0 (Claude Code)", "below", "1.0.0", "warn", "update Claude Code"},
		{"inside the verified range logs info", claudecode.Floor() + " (Claude Code)", "verified", claudecode.Floor(), "info", ""},
		{"above the ceiling warns", "99.0.0 (Claude Code)", "above", "99.0.0", "warn", "newer than any version Muster has been tested with"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer

			f := watchVersionOf(t, versionStub(t, tt.output), &buf)

			info := f.Current()
			assert.Equal(t, tt.wantStatus, info.Status)
			assert.Equal(t, tt.wantInstalled, installedOf(t, info))
			assert.Equal(t, claudecode.Floor(), info.Floor)
			assert.Equal(t, claudecode.Verified(), info.Verified)

			logged := buf.String()
			assert.Contains(t, logged, fmt.Sprintf(`"level":"%s"`, tt.wantLevel))
			if tt.wantMsgSubstr != "" {
				assert.Contains(t, logged, tt.wantMsgSubstr)
			}
			assert.Contains(t, logged, `"status":"`+tt.wantStatus+`"`)
			assert.Contains(t, logged, `"installed":"`+tt.wantInstalled+`"`)
		})
	}
}

// TestClaudeVersion_UnknownOutcomeNeverFailsStartup is the old
// TestCheckClaudeCode_UnknownOutcomeNeverFailsStartup: a missing or failing claude yields a
// serving-compatible value (nil Installed, populated Floor/Verified, status unknown) and a
// warn line, and neither Start nor the hello that carries it errors. Each case runs through
// the constructor's real identity look and check, so the missing binary fails the look
// itself, as it does in production. An empty -claude-bin never reaches the feature as "":
// defaultClaudeBin maps it to "claude" first
// (TestClaudeVersion_EmptyClaudeBinNamesClaudeBeforeTheFeatureSeesIt).
func TestClaudeVersion_UnknownOutcomeNeverFailsStartup(t *testing.T) {
	failing, err := cachedStub("claude", "#!/bin/sh\necho boom >&2\nexit 3\n")
	require.NoError(t, err)
	garbage, err := cachedStub("claude", "#!/bin/sh\necho not-a-version\nexit 0\n")
	require.NoError(t, err)
	const resolveMsg = "could not resolve the claude binary; keeping the last claude code version result"
	const versionMsg = "could not determine claude code version"
	bins := map[string]struct{ bin, wantMsg string }{
		"missing binary":        {filepath.Join(t.TempDir(), "no-such-claude"), resolveMsg},
		"non-zero exit":         {failing, versionMsg},
		"unparseable --version": {garbage, versionMsg},
	}
	for name, tc := range bins {
		bin, wantMsg := tc.bin, tc.wantMsg
		t.Run(name, func(t *testing.T) {
			var buf bytes.Buffer

			f := watchVersionOf(t, bin, &buf)

			info := f.Current()
			assert.Nil(t, info.Installed)
			assert.Equal(t, claudecode.Floor(), info.Floor)
			assert.Equal(t, claudecode.Verified(), info.Verified)
			assert.Equal(t, "unknown", info.Status)

			logged := buf.String()
			assert.Contains(t, logged, `"level":"warn"`)
			assert.Contains(t, logged, wantMsg)
			assert.NotContains(t, logged, `"installed"`, "installed must be omitted from the log, never a bogus empty string")

			assert.NotPanics(t, func() {
				f.Start()
				f.Stop(context.Background())
			})
		})
	}
}

func TestClaudeVersion_EmptyClaudeBinNamesClaudeBeforeTheFeatureSeesIt(t *testing.T) {
	tests := []struct{ name, in, want string }{
		{"empty names claude", "", "claude"},
		{"explicit path passes through", "/opt/bin/claude", "/opt/bin/claude"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, defaultClaudeBin(tt.in))
		})
	}
}

// TestClaudeVersion_BinaryChangedWhileACheckRunsIsCheckedAgainOnTheNextLook is plan Edge
// Case 2: the identity is recorded before the check, so a binary swapped during the check
// differs from the recorded one and the next look checks it again; the look after that
// finds nothing new. A tick that re-identified after the check would record the swapped
// identity and run only one check.
func TestClaudeVersion_BinaryChangedWhileACheckRunsIsCheckedAgainOnTheNextLook(t *testing.T) {
	f, rig := newVersionFeature(t, time.Hour, nil)
	rig.set(binaryIdentity(1), versionReportFor("99.0.0"))
	var once sync.Once
	rig.onCheck = func(context.Context) { once.Do(func() { rig.setIdentity(binaryIdentity(2)) }) }

	f.tick(context.Background())
	require.Equal(t, 1, rig.checkCount(), "the first look checks the first identity")

	f.tick(context.Background())
	assert.Equal(t, 2, rig.checkCount(), "the identity swapped mid-check is seen by the next look")

	f.tick(context.Background())
	assert.Equal(t, 2, rig.checkCount(), "the swapped identity was checked, so a further look runs none")
}

// TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch: a look that cannot
// resolve claude runs no check, holds the value, and logs one warn per unresolved stretch
// carrying the resolution error and the held result's status (unknown with nothing held,
// verified with a held value, plus its installed version); it logs again only after an
// identity resolved in between.
func TestClaudeVersion_UnresolvableIdentityLogsOncePerUnresolvedStretch(t *testing.T) {
	var buf bytes.Buffer
	f, rig := newVersionFeature(t, time.Hour, &buf)
	const msg = "could not resolve the claude binary; keeping the last claude code version result"
	warns := func() int { return bytes.Count(buf.Bytes(), []byte(msg)) }
	warnLines := func() []string {
		var out []string
		for _, l := range strings.Split(buf.String(), "\n") {
			if strings.Contains(l, msg) {
				out = append(out, l)
			}
		}
		return out
	}
	rig.setIdentityErr(errors.New("resolving claude on PATH: not found"))

	f.tick(context.Background())
	f.tick(context.Background())

	assert.Equal(t, 1, warns(), "two unresolved looks log one warn")
	assert.Contains(t, buf.String(), `"level":"warn"`)
	assert.Contains(t, buf.String(), "resolving claude on PATH: not found", "the resolution error is carried")
	require.Len(t, warnLines(), 1)
	assert.Contains(t, warnLines()[0], `"status":"unknown"`, "nothing is held in the first stretch")
	assert.NotContains(t, warnLines()[0], `"installed"`, "an unknown held value has no installed version to log")
	assert.NotContains(t, buf.String(), "could not determine claude code version", "an unresolved look never reports the --version failure")
	assert.Zero(t, rig.checkCount(), "an unresolved look runs no check")
	assert.Empty(t, rig.broadcastsSoFar())
	assert.Equal(t, "unknown", f.Current().Status)

	rig.set(binaryIdentity(1), versionReportFor(claudecode.Floor()))
	f.tick(context.Background())
	require.Equal(t, 1, rig.checkCount())
	require.Equal(t, 1, warns(), "a resolved look adds no unknown warn")

	rig.setIdentityErr(errors.New("dangling symlink"))
	f.tick(context.Background())
	f.tick(context.Background())

	assert.Equal(t, 2, warns(), "a new unresolved stretch after a resolve logs once more")
	assert.Contains(t, buf.String(), "dangling symlink")
	assert.Equal(t, "verified", f.Current().Status, "the held value survives an unresolved look")
	require.Len(t, warnLines(), 2)
	second := warnLines()[1]
	assert.Contains(t, second, `"level":"warn"`)
	assert.Contains(t, second, `"status":"verified"`, "the second stretch reports the held verified result, not unknown")
	assert.Contains(t, second, `"installed":"`+claudecode.Floor()+`"`, "the held value's installed version is logged")

	rig.setIdentity(binaryIdentity(1))
	f.tick(context.Background())
	assert.Equal(t, 1, rig.checkCount(), "the same identity after the stretch runs no new check")
}

package server

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNew_RegistersLifecycleFeaturesInStartOrder pins REQ-11: Start and Stop must run the
// four independent-goroutine features in exactly today's order — ingest, usage poller,
// theme poller, updates (server.go's own comment above the ingest/usage/theme
// registrations) — since Start and Shutdown both iterate s.features in registration order,
// unreversed (INV-5).
func TestNew_RegistersLifecycleFeaturesInStartOrder(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	var lifecycles []feature
	for _, f := range srv.features {
		if _, ok := f.(lifecycle); ok {
			lifecycles = append(lifecycles, f)
		}
	}

	require.Len(t, lifecycles, 4, "exactly four features implement lifecycle: ingest, usage, theme, update")
	assert.Same(t, srv.ingest, lifecycles[0], "REQ-11: ingest must start first")
	assert.Same(t, srv.usage, lifecycles[1], "REQ-11: usage poller must start second")
	assert.Same(t, srv.theme, lifecycles[2], "REQ-11: theme poller must start third")
	assert.Same(t, srv.update, lifecycles[3], "REQ-11: updates must start last")
}

// TestNew_ZeroValueLaunchConfigDefaultsClaudeBin covers REQ-10 for LaunchConfig: a Config
// built with a zero-value Launch sub-struct must default ClaudeBin to "claude" rather than
// spawning an empty argv[0] — the one LaunchConfig field New itself interprets, as opposed
// to sessionLauncher.Launch's own request-time defaults (kb:anchor/sessions.create's create
// path is exercised elsewhere; this pins New's construction-time default in isolation).
func TestNew_ZeroValueLaunchConfigDefaultsClaudeBin(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{}) // Config.Launch left at its zero value

	assert.Equal(t, "claude", srv.sessions.launcher.claudeBin, "a zero-value LaunchConfig.ClaudeBin must default to \"claude\"")
}

// recordingLifecycleFeature is a minimal feature+lifecycle double that appends its name to
// a shared, ordered log on Start/Stop, so a test can assert actual invocation order rather
// than inferring it from registration order alone.
type recordingLifecycleFeature struct {
	name string
	log  *[]string
}

func (f *recordingLifecycleFeature) mount(*http.ServeMux, func(http.Handler) http.Handler) {}
func (f *recordingLifecycleFeature) Start()                                                { *f.log = append(*f.log, "start:"+f.name) }
func (f *recordingLifecycleFeature) Stop(context.Context)                                  { *f.log = append(*f.log, "stop:"+f.name) }

// TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed covers REQ-11's Stop half
// directly: TestNew_RegistersLifecycleFeaturesInStartOrder above only inspects the order
// features land in s.features, which pins what Start (looping that slice forward) will do
// but proves nothing about Shutdown's own loop body — a future edit reversing Shutdown's
// teardown to LIFO (a common, plausible convention) would not be caught by a test that never
// calls Shutdown. This test replaces s.features with recording doubles and calls Shutdown
// itself, asserting the Stop calls land in the same forward order as registration (INV-5:
// unreversed, since these four run independent goroutines with no dependency on one another).
func TestServerShutdown_StopsLifecycleFeaturesInStartOrderUnreversed(t *testing.T) {
	srv := newTestServer(t, ClaudeCodeInfo{})

	var log []string
	srv.features = []feature{
		&recordingLifecycleFeature{name: "ingest", log: &log},
		&recordingLifecycleFeature{name: "usage", log: &log},
		&recordingLifecycleFeature{name: "theme", log: &log},
		&recordingLifecycleFeature{name: "update", log: &log},
	}

	srv.Shutdown(context.Background())

	assert.Equal(t, []string{"stop:ingest", "stop:usage", "stop:theme", "stop:update"}, log,
		"REQ-11: Shutdown must stop lifecycle features in the same forward order they start, not LIFO")
}

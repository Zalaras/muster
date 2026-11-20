package server

import (
	"testing"
	"time"

	"github.com/rs/zerolog"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type revSeen struct {
	sessionID int64
	revFor    int64
	snapRev   int64
}

// newRevPoller builds a poller whose broadcast records the revision the hub closure would
// stamp (revFor) and the snapshot's revision at that moment.
func newRevPoller(seen *[]revSeen) *shellActivityPoller {
	var p *shellActivityPoller
	p = newShellActivityPoller(nil, nil, alwaysHasShells, testShellBase, time.Hour, newTerminalNames(), func(id int64, _ []terminalWire) {
		_, rev := p.snapshot()
		*seen = append(*seen, revSeen{id, p.revFor(id), rev})
	}, zerolog.Nop())
	return p
}

func TestPollerRev_TransitionsFromEveryStartingList(t *testing.T) {
	one := []terminalWire{tw(1, "shell 1", false)}
	two := []terminalWire{tw(1, "shell 1", false), tw(2, "shell 2", false)}
	tests := []struct {
		name      string
		prev      []terminalWire
		next      []terminalWire
		wantDelta int64
	}{
		{"empty to one", nil, one, 1},
		{"one to two", one, two, 1},
		{"one goes busy", one, []terminalWire{tw(1, "shell 1", true)}, 1},
		{"two to one", two, one, 1},
		{"one to empty", one, nil, 1},
		{"one unchanged", one, one, 0},
		{"two unchanged", two, two, 0},
		{"empty unchanged", nil, nil, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var seen []revSeen
			p := newRevPoller(&seen)
			p.reconcile(map[int64][]terminalWire{2: {tw(1, "shell 1", false)}})
			p.reconcile(listFor(1, tt.prev))
			beforeLists, before := p.snapshot()
			beforeSession2 := p.revFor(2)
			seen = nil

			p.reconcile(listFor(1, tt.next))

			lists, after := p.snapshot()
			assert.Equal(t, before+tt.wantDelta, after)
			assert.Len(t, seen, int(tt.wantDelta))
			for _, s := range seen {
				assert.Equal(t, after, s.revFor, "the rev the broadcast carries is the session's new rev")
				assert.Equal(t, after, s.snapRev)
			}
			if tt.wantDelta == 0 {
				assert.Equal(t, beforeLists, lists)
			}
			assert.Equal(t, p.revFor(2), beforeSession2, "the other session's rev is never touched by this one's change")
		})
	}
}

func TestPollerRev_SessionKeepsItsRevAfterItsListGoesEmpty(t *testing.T) {
	var seen []revSeen
	p := newRevPoller(&seen)
	p.reconcile(map[int64][]terminalWire{1: {tw(1, "shell 1", false)}, 2: {tw(1, "shell 1", false)}})
	seen = nil

	p.reconcile(map[int64][]terminalWire{2: {tw(1, "shell 1", false)}})

	require.Len(t, seen, 1)
	assert.Equal(t, int64(1), seen[0].sessionID)
	lists, rev := p.snapshot()
	assert.Equal(t, int64(3), rev)
	assert.Equal(t, int64(3), p.revFor(1), "the empty list's rev stays readable after the session left the lists")
	assert.NotContains(t, lists, "1")
	assert.Equal(t, int64(2), p.revFor(2), "the survivor keeps its own rev")
	p.reconcile(map[int64][]terminalWire{2: {tw(1, "shell 1", false)}})
	assert.Equal(t, int64(3), p.revFor(1), "a silent reconcile leaves it")
}

func TestPollerRev_OneReconcileOverSeveralSessionsNumbersEachBroadcastInOrder(t *testing.T) {
	var seen []revSeen
	p := newRevPoller(&seen)
	p.reconcile(map[int64][]terminalWire{3: {tw(1, "shell 1", false)}})
	seen = nil

	p.reconcile(map[int64][]terminalWire{
		1: {tw(1, "shell 1", false)},
		2: {tw(1, "shell 1", false)},
		3: {tw(1, "shell 1", true)},
	})

	require.Len(t, seen, 3)
	ids := map[int64]bool{}
	for i, s := range seen {
		assert.Equal(t, int64(i+2), s.revFor, "broadcast %d goes out with the rev assigned to it, increasing", i)
		ids[s.sessionID] = true
	}
	assert.Equal(t, map[int64]bool{1: true, 2: true, 3: true}, ids)
	_, rev := p.snapshot()
	assert.Equal(t, int64(4), rev)
}

func TestPollerRev_SnapshotListsAndRevAgreeAfterReconcile(t *testing.T) {
	var seen []revSeen
	p := newRevPoller(&seen)
	p.reconcile(map[int64][]terminalWire{1: {tw(1, "shell 1", false)}, 2: {tw(1, "a", false), tw(2, "b", false)}})
	p.reconcile(map[int64][]terminalWire{2: {tw(2, "b", false)}})

	lists, rev := p.snapshot()

	assert.Equal(t, p.Current(), lists)
	assert.Equal(t, map[string][]terminalWire{"2": {tw(2, "b", false)}}, lists)
	assert.Equal(t, int64(4), rev)
	assert.Equal(t, rev, max(p.revFor(1), p.revFor(2)), "the counter is the newest session rev")
	lists["2"][0].Name = "mutated"
	again, _ := p.snapshot()
	assert.Equal(t, "b", again["2"][0].Name, "snapshot lists are copies")
}

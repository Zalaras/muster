package session

import (
	"context"
	"fmt"
	"slices"
	"strconv"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/store"
	"github.com/Zalaras/muster/internal/tmux"
)

// railLog records, in arrival order, every broadcast a Manager makes: a groups message, a
// session upsert (with the groupId it carried) and a sessionRemoved. One shared log is what
// lets a test assert the contract's ordering (groups before the upserts that join, after
// the ones that leave).
type railLog struct {
	mu     sync.Mutex
	events []railEvent
}

type railEvent struct {
	kind      string // "groups", "upsert" or "removed"
	id        int64  // session id for upsert and removed
	groupID   *int64 // an upsert's groupId
	alive     bool   // an upsert's alive flag
	pinned    bool   // an upsert's pin flag
	railPos   int64  // an upsert's railPos
	groups    []Group
	ungrouped UngroupedLayout
}

func (l *railLog) upsert(s *Session) {
	l.mu.Lock()
	defer l.mu.Unlock()
	var gid *int64
	if s.GroupID != nil {
		v := *s.GroupID
		gid = &v
	}
	l.events = append(l.events, railEvent{kind: "upsert", id: s.ID, groupID: gid, alive: s.Alive, pinned: s.Pinned, railPos: s.RailPos})
}

func (l *railLog) removed(id int64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events = append(l.events, railEvent{kind: "removed", id: id})
}

func (l *railLog) groupsMsg(groups []Group, ungrouped UngroupedLayout) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events = append(l.events, railEvent{kind: "groups", groups: slices.Clone(groups), ungrouped: ungrouped})
}

func (l *railLog) reset() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events = nil
}

func (l *railLog) all() []railEvent {
	l.mu.Lock()
	defer l.mu.Unlock()
	return slices.Clone(l.events)
}

// kinds renders the log as "groups", "upsert:<id>", "removed:<id>" for order assertions.
func (l *railLog) kinds() []string {
	out := []string{}
	for _, e := range l.all() {
		if e.kind == "groups" {
			out = append(out, "groups")
			continue
		}
		out = append(out, e.kind+":"+strconv.FormatInt(e.id, 10))
	}
	return out
}

// count returns how many events of kind the log holds.
func (l *railLog) count(kind string) int {
	n := 0
	for _, e := range l.all() {
		if e.kind == kind {
			n++
		}
	}
	return n
}

// lastGroups returns the most recent groups message.
func (l *railLog) lastGroups(t *testing.T) railEvent {
	t.Helper()
	events := l.all()
	for i := len(events) - 1; i >= 0; i-- {
		if events[i].kind == "groups" {
			return events[i]
		}
	}
	require.Fail(t, "no groups message was broadcast")
	return railEvent{}
}

// groupsRig is a Manager over a real store with fake tmux ports and a railLog wired to every
// broadcast hook.
type groupsRig struct {
	t      *testing.T
	ctx    context.Context
	st     *store.Store
	mgr    *Manager
	log    *railLog
	pc     *fakePaneChecker
	killer *fakeTmuxSessions
	repoID int64
	dir    string
	labels map[string]int64 // fixture label -> session id
	groupA int64
	groupB int64
}

func newGroupsRig(t *testing.T) *groupsRig {
	t.Helper()
	st := openTestStore(t)
	dir := t.TempDir()
	r := &groupsRig{
		t: t, ctx: context.Background(), st: st, log: &railLog{},
		pc: newFakePaneChecker(), killer: newFakeTmuxSessions(),
		repoID: seedRepo(t, st, dir), dir: dir, labels: map[string]int64{},
	}
	r.mgr = r.newManager(st)
	require.NoError(t, r.mgr.LoadAll(r.ctx))
	return r
}

// newManager builds a Manager on st wired to the rig's log and fakes, as a daemon restart
// would build one over the same database.
func (r *groupsRig) newManager(st *store.Store) *Manager {
	return newTestManager(r.t, st, r.pc, r.log.upsert,
		withTmuxSessions(r.killer), withOnRemoved(r.log.removed),
		func(c *Config) { c.OnGroups = r.log.groupsMsg })
}

// restart replaces the Manager with a fresh one over the same store, the way a daemon
// restart reloads everything through LoadAll.
func (r *groupsRig) restart() {
	r.t.Helper()
	r.mgr = r.newManager(r.st)
	require.NoError(r.t, r.mgr.LoadAll(r.ctx))
}

// launch creates and launches a session in group (nil = Ungrouped), the way the launcher
// does, so it is alive and has been announced.
func (r *groupsRig) launch(group *int64) *Session {
	r.t.Helper()
	p := createParams(r.dir)
	p.RepoID = r.repoID
	p.GroupID = group
	sess, err := r.mgr.CreateSession(r.ctx, p)
	require.NoError(r.t, err)
	_, err = r.mgr.RecordLaunch(r.ctx, sess.ID, fmt.Sprintf("muster-%d:@1", sess.ID), "%1")
	require.NoError(r.t, err)
	return sess
}

func (r *groupsRig) newGroup(name string) int64 {
	r.t.Helper()
	g, err := r.mgr.CreateGroup(r.ctx, name, nil)
	require.NoError(r.t, err)
	return g.ID
}

// fixtureSpec is the grouped fixture of railorder_group_test.go as manager state: label,
// group (0 = Ungrouped, 1 = A, 2 = B) and pin state, in railPos order.
var fixtureSpec = []struct {
	label  string
	group  int
	pinned bool
}{
	{"11", 1, true}, {"21", 2, true}, {"22", 2, false}, {"1", 0, true}, {"12", 1, true},
	{"2", 0, false}, {"23", 2, false}, {"13", 1, false}, {"3", 0, false},
}

// newFixtureRig builds groups A and B and nine sessions across them and Ungrouped, interleaved
// in railPos, with every section satisfying the invariant. It clears the log, so a test sees
// only the broadcasts its own action makes.
func newFixtureRig(t *testing.T) *groupsRig {
	t.Helper()
	r := newGroupsRig(t)
	r.groupA = r.newGroup("A")
	r.groupB = r.newGroup("B")
	groupOf := map[int]*int64{0: nil, 1: &r.groupA, 2: &r.groupB}
	for _, f := range fixtureSpec {
		r.labels[f.label] = r.launch(groupOf[f.group]).ID
	}
	for _, f := range fixtureSpec {
		if f.pinned {
			require.NoError(t, r.mgr.SetPinned(r.ctx, r.labels[f.label], true))
		}
	}
	for i, f := range fixtureSpec {
		got, ok := r.mgr.Get(r.labels[f.label])
		require.True(t, ok)
		require.Equal(t, int64(i), got.RailPos, "fixture railPos of %s", f.label)
		require.Equal(t, f.pinned, got.Pinned, "fixture pin of %s", f.label)
	}
	r.assertConsistent()
	r.log.reset()
	return r
}

func (r *groupsRig) id(label string) int64 {
	r.t.Helper()
	id, ok := r.labels[label]
	require.True(r.t, ok, "unknown fixture label %q", label)
	return id
}

func (r *groupsRig) ids(labels ...string) []int64 {
	out := make([]int64, len(labels))
	for i, l := range labels {
		out[i] = r.id(l)
	}
	return out
}

func (r *groupsRig) session(label string) *Session {
	r.t.Helper()
	s, ok := r.mgr.Get(r.id(label))
	require.True(r.t, ok, "session %s is gone", label)
	return s
}

// groupOf returns a session's section: 0 for Ungrouped.
func (r *groupsRig) groupOf(label string) int64 {
	return groupIDVal(r.session(label).GroupID)
}

// members returns the labels of a section's sessions in railPos order.
func (r *groupsRig) members(group int64) []string {
	r.t.Helper()
	byID := map[int64]string{}
	for label, id := range r.labels {
		byID[id] = label
	}
	sessions := r.mgr.List()
	slices.SortFunc(sessions, func(a, b *Session) int { return int(a.RailPos - b.RailPos) })
	out := []string{}
	for _, s := range sessions {
		if groupIDVal(s.GroupID) == group {
			out = append(out, byID[s.ID])
		}
	}
	return out
}

// snapshotAll captures (group, pinned, railPos, alive) per fixture label — the bystander
// baseline I3 compares against.
func (r *groupsRig) snapshotAll() map[string]sessionFacts {
	out := map[string]sessionFacts{}
	for label, id := range r.labels {
		if s, ok := r.mgr.Get(id); ok {
			out[label] = factsOf(s)
		}
	}
	return out
}

type sessionFacts struct {
	Group   int64
	Pinned  bool
	RailPos int64
	Alive   bool
}

func factsOf(s *Session) sessionFacts {
	return sessionFacts{groupIDVal(s.GroupID), s.Pinned, s.RailPos, s.Alive}
}

// assertBystandersUntouched is I3: every label outside touched holds exactly the facts it
// had in before, and no upsert or removal in the log names it.
func (r *groupsRig) assertBystandersUntouched(before map[string]sessionFacts, touched ...string) {
	r.t.Helper()
	skip := map[string]bool{}
	for _, l := range touched {
		skip[l] = true
	}
	named := map[int64]bool{}
	for _, e := range r.log.all() {
		if e.kind != "groups" {
			named[e.id] = true
		}
	}
	for label, was := range before {
		if skip[label] {
			continue
		}
		s, ok := r.mgr.Get(r.labels[label])
		if assert.True(r.t, ok, "bystander %s must still exist", label) {
			assert.Equal(r.t, was, factsOf(s), "bystander %s changed", label)
		}
		assert.False(r.t, named[r.labels[label]], "bystander %s was broadcast", label)
	}
}

// assertConsistent checks every invariant the plan states over the whole rail: I1 (the
// per-section pin invariant and unique railPos), I2 (every groupId names an existing group),
// that section positions are unique, and that the database holds exactly what memory does.
func (r *groupsRig) assertConsistent() {
	r.t.Helper()
	live := r.mgr.List()

	entries := make([]railEntry, len(live))
	for i, s := range live {
		entries[i] = railEntry{ID: s.ID, Pinned: s.Pinned, RailPos: s.RailPos, GroupID: groupIDVal(s.GroupID)}
		if s.GroupID != nil {
			assert.True(r.t, r.mgr.GroupExists(*s.GroupID), "I2: session %d names missing group %d", s.ID, *s.GroupID)
		}
	}
	assertSectionInvariants(r.t, entries)

	rows, err := r.st.ListSessions(r.ctx)
	require.NoError(r.t, err)
	require.Len(r.t, rows, len(live), "the database holds exactly the live sessions")
	byID := map[int64]*Session{}
	for _, s := range live {
		byID[s.ID] = s
	}
	for _, row := range rows {
		s := byID[row.ID]
		if assert.NotNil(r.t, s, "row %d has no live session", row.ID) {
			assert.Equal(r.t, sessionFacts{groupIDVal(s.GroupID), s.Pinned, s.RailPos, s.Alive}, factsOfRow(row), "session %d: database differs from memory", row.ID)
		}
		if row.GroupID != nil {
			assert.Contains(r.t, r.groupRowIDs(), *row.GroupID, "I2: row %d names a group with no row", row.ID)
		}
	}

	groups, ungrouped := r.mgr.Groups()
	pos := map[int64]bool{ungrouped.Pos: true}
	for _, g := range groups {
		assert.False(r.t, pos[g.Pos], "section pos %d is held twice", g.Pos)
		pos[g.Pos] = true
	}
	stored := map[int64]GroupRow{}
	for _, g := range r.groupRows() {
		stored[g.ID] = g
	}
	r.mgr.groupsMu.Lock()
	held := r.mgr.heldGroupIDsLocked()
	r.mgr.groupsMu.Unlock()
	assert.Len(r.t, stored, len(groups)+len(held), "the database holds the visible groups and the ones a launch holds back")
	for _, g := range groups {
		assert.Equal(r.t, GroupRow{ID: g.ID, Name: g.Name, Pos: g.Pos, Collapsed: g.Collapsed}, stored[g.ID])
	}
	for _, id := range held {
		assert.False(r.t, pos[stored[id].Pos], "held group %d shares section pos %d", id, stored[id].Pos)
		pos[stored[id].Pos] = true
	}
	layout, found, err := r.st.ReadUngroupedLayout(r.ctx)
	require.NoError(r.t, err)
	if found {
		assert.Equal(r.t, UngroupedLayout{Pos: layout.Pos, Collapsed: layout.Collapsed}, ungrouped)
	}
}

// GroupRow aliases the store row so assertions read in the session package's own terms.
type GroupRow = store.GroupRow

func factsOfRow(row store.SessionRow) sessionFacts {
	var g int64
	if row.GroupID != nil {
		g = *row.GroupID
	}
	return sessionFacts{g, row.Pinned, row.RailPos, row.Alive}
}

func (r *groupsRig) groupRows() []GroupRow {
	rows, err := r.st.ListGroups(r.ctx)
	require.NoError(r.t, err)
	return rows
}

func (r *groupsRig) groupRowIDs() []int64 {
	var ids []int64
	for _, g := range r.groupRows() {
		ids = append(ids, g.ID)
	}
	return ids
}

// groupNames returns the group names in section order, the Ungrouped section shown as "-".
func (r *groupsRig) sectionNames() []string {
	groups, ungrouped := r.mgr.Groups()
	order := sectionOrder(groups, ungrouped)
	names := map[int64]string{ungroupedSection: "-"}
	for _, g := range groups {
		names[g.ID] = g.Name
	}
	out := make([]string, len(order))
	for i, id := range order {
		out[i] = names[id]
	}
	return out
}

// tmuxName is the tmux session name of a launched session, as Remove's kill addresses it.
func tmuxName(id int64) string { return tmux.SessionName(id) }

package session

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func diffComment(id, body string) DiffComment {
	return DiffComment{
		ID: id, Path: "a/b.go", Start: DiffPos{Side: "new", Line: 3}, End: DiffPos{Side: "new", Line: 4},
		Quote: []string{"x", "y"}, Body: body,
	}
}

func (r *effortRig) review(id int64) DiffReview {
	r.t.Helper()
	got, err := r.mgr.DiffReview(id)
	require.NoError(r.t, err)
	return got
}

func (r *effortRig) reloadedReview(id int64) DiffReview {
	r.t.Helper()
	fresh := r.newManager()
	require.NoError(r.t, fresh.LoadAll(r.ctx))
	got, err := fresh.DiffReview(id)
	require.NoError(r.t, err)
	return got
}

func commentIDs(r DiffReview) []string {
	ids := []string{}
	for _, c := range r.Comments {
		ids = append(ids, c.ID)
	}
	return ids
}

func TestDiffReview_NeverWrittenIsEmptyNotNull(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")

	got := r.review(id)

	assert.NotNil(t, got.Comments)
	assert.NotNil(t, got.Ticks)
	assert.Empty(t, got.Comments)
	assert.Empty(t, got.Ticks)
	assert.Zero(t, got.OpenComments())
}

func TestDiffReview_UnknownSession(t *testing.T) {
	r := newEffortRig(t)

	_, err := r.mgr.DiffReview(999)
	require.ErrorIs(t, err, ErrUnknownSession)
	require.ErrorIs(t, r.mgr.PutDiffComment(r.ctx, 999, diffComment("c1", "b")), ErrUnknownSession)
	require.ErrorIs(t, r.mgr.DeleteDiffComment(r.ctx, 999, "c1"), ErrUnknownSession)
	require.ErrorIs(t, r.mgr.UpdateDiffTicks(r.ctx, 999, []string{"k"}, nil), ErrUnknownSession)
}

func TestPutDiffComment(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")

	require.NoError(t, r.mgr.PutDiffComment(r.ctx, id, diffComment("c1", "first")))
	require.NoError(t, r.mgr.PutDiffComment(r.ctx, id, diffComment("c2", "second")))
	created := r.review(id).Comments[0].CreatedAt

	t.Run("create stamps CreatedAt in UTC and keeps save order", func(t *testing.T) {
		got := r.review(id)
		assert.Equal(t, []string{"c1", "c2"}, commentIDs(got))
		assert.WithinDuration(t, time.Now(), created, time.Minute)
		assert.Equal(t, time.UTC, created.Location())
		assert.Equal(t, 2, got.OpenComments())
	})

	t.Run("replace keeps place and CreatedAt, takes everything else, ignores a supplied CreatedAt", func(t *testing.T) {
		replacement := diffComment("c1", "edited")
		replacement.Resolved = true
		replacement.CreatedAt = time.Date(1999, 1, 1, 0, 0, 0, 0, time.UTC)
		replacement.Path = "other.go"
		require.NoError(t, r.mgr.PutDiffComment(r.ctx, id, replacement))

		got := r.review(id)
		assert.Equal(t, []string{"c1", "c2"}, commentIDs(got))
		assert.Equal(t, created, got.Comments[0].CreatedAt)
		assert.Equal(t, "edited", got.Comments[0].Body)
		assert.Equal(t, "other.go", got.Comments[0].Path)
		assert.True(t, got.Comments[0].Resolved)
		assert.Equal(t, 1, got.OpenComments(), "resolved comments are not open")
	})

	t.Run("the store holds what memory holds", func(t *testing.T) {
		assert.Equal(t, r.review(id), r.reloadedReview(id))
	})

	t.Run("delete removes one, an absent id is a no-op", func(t *testing.T) {
		require.NoError(t, r.mgr.DeleteDiffComment(r.ctx, id, "c1"))
		require.NoError(t, r.mgr.DeleteDiffComment(r.ctx, id, "never-existed"))
		assert.Equal(t, []string{"c2"}, commentIDs(r.review(id)))
		assert.Equal(t, r.review(id), r.reloadedReview(id))
	})
}

func TestUpdateDiffTicks(t *testing.T) {
	steps := []struct {
		name        string
		add, remove []string
		want        []string
	}{
		{"add keeps first-ticked order", []string{"b", "a"}, nil, []string{"b", "a"}},
		{"adding a present key changes nothing", []string{"a", "c"}, nil, []string{"b", "a", "c"}},
		{"duplicates inside one request collapse", []string{"d", "d"}, nil, []string{"b", "a", "c", "d"}},
		{"removing an absent key changes nothing", nil, []string{"zzz"}, []string{"b", "a", "c", "d"}},
		{"remove and add in one request", []string{"e"}, []string{"a"}, []string{"b", "c", "d", "e"}},
		{"re-adding a removed key appends it", []string{"a"}, nil, []string{"b", "c", "d", "e", "a"}},
	}
	r := newEffortRig(t)
	id := r.launch("", "")
	for _, s := range steps {
		require.NoError(t, r.mgr.UpdateDiffTicks(r.ctx, id, s.add, s.remove), s.name)
		assert.Equal(t, s.want, r.review(id).Ticks, s.name)
		assert.Equal(t, s.want, r.reloadedReview(id).Ticks, s.name+" (store)")
	}
}

func TestDiffReview_WritesNeverBroadcastAndNoOpsDoNotWrite(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")
	before := len(r.rec.all())

	require.NoError(t, r.mgr.PutDiffComment(r.ctx, id, diffComment("c1", "b")))
	require.NoError(t, r.mgr.UpdateDiffTicks(r.ctx, id, []string{"k"}, nil))
	require.NoError(t, r.mgr.DeleteDiffComment(r.ctx, id, "c1"))
	require.NoError(t, r.mgr.UpdateDiffTicks(r.ctx, id, nil, []string{"k"}))

	assert.Len(t, r.rec.all(), before, "no session upsert for any review write")
	assert.Nil(t, r.get(id).DiffReview, "an emptied review stores NULL, not an empty document")
	assert.Nil(t, r.reloaded(id).DiffReview)
	require.NoError(t, r.mgr.DeleteDiffComment(r.ctx, id, "c1"), "deleting from an empty review")
}

func TestDiffReview_ConcurrentWritesToDifferentItemsAllLand(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")

	var wg sync.WaitGroup
	for i := range 12 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			assert.NoError(t, r.mgr.PutDiffComment(r.ctx, id, diffComment(fmt.Sprintf("c%d", i), "b")))
		}()
		go func() {
			defer wg.Done()
			assert.NoError(t, r.mgr.UpdateDiffTicks(r.ctx, id, []string{fmt.Sprintf("k%d", i)}, nil))
		}()
	}
	wg.Wait()

	got := r.review(id)
	assert.Len(t, got.Comments, 12, "no write lost another")
	assert.Len(t, got.Ticks, 12)
	assert.Equal(t, got, r.reloadedReview(id))
}

func TestDiffReview_ConcurrentWritesToOneCommentLeaveOneOfThem(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")

	var wg sync.WaitGroup
	for i := range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			assert.NoError(t, r.mgr.PutDiffComment(r.ctx, id, diffComment("same", fmt.Sprintf("writer %d", i))))
		}()
	}
	wg.Wait()

	got := r.review(id)
	require.Len(t, got.Comments, 1)
	assert.Equal(t, got, r.reloadedReview(id), "memory and store agree on the winner")
}

func TestDiffReview_RemoveDeletesItWithTheSessionAndLeavesAnothers(t *testing.T) {
	r := newEffortRig(t)
	id := r.launch("", "")
	other := r.launch("", "")
	for _, s := range []int64{id, other} {
		require.NoError(t, r.mgr.PutDiffComment(r.ctx, s, diffComment("c", fmt.Sprint("on ", s))))
		require.NoError(t, r.mgr.UpdateDiffTicks(r.ctx, s, []string{"k"}, nil))
	}
	r.die(id)

	require.NoError(t, r.mgr.Remove(r.ctx, id))

	_, err := r.mgr.DiffReview(id)
	require.ErrorIs(t, err, ErrUnknownSession)
	_, err = r.st.GetSession(r.ctx, id)
	require.Error(t, err, "the row, and the review column with it, is gone")
	assert.Equal(t, "on "+fmt.Sprint(other), r.review(other).Comments[0].Body)
	assert.Equal(t, []string{"k"}, r.reloadedReview(other).Ticks)
}

func TestDiffReview_CorruptStoredDocumentIsAnErrorNotAWipe(t *testing.T) {
	bad := "{not json"
	_, err := decodeDiffReview(&bad)
	require.Error(t, err)

	r := newEffortRig(t)
	id := r.launch("", "")
	row, err := r.st.GetSession(r.ctx, id)
	require.NoError(t, err)
	row.DiffReview = &bad
	require.NoError(t, r.st.UpdateSession(r.ctx, row))
	r.restart()

	_, err = r.mgr.DiffReview(id)
	require.Error(t, err)
	require.Error(t, r.mgr.PutDiffComment(r.ctx, id, diffComment("c", "b")), "a write refuses rather than overwriting the unreadable review")
	stored, err := r.st.GetSession(r.ctx, id)
	require.NoError(t, err)
	require.NotNil(t, stored.DiffReview)
	assert.Equal(t, bad, *stored.DiffReview)
}

func TestEncodeDiffReview_EmptyIsNil(t *testing.T) {
	got, err := encodeDiffReview(DiffReview{Comments: []DiffComment{}, Ticks: []string{}})
	require.NoError(t, err)
	assert.Nil(t, got)
}

// TestDiffReview_INV_ChangesOnlyThroughItsWrites crosses every input that is not a review
// write with every starting state (kb:lesson/invariant-missed-by-per-transition-tests): hooks,
// status posts, /clear rebinds, resume, liveness, reconcile, restart. The review, with a
// bystander session beside it, must come out untouched in memory and in the store.
func TestDiffReview_INV_ChangesOnlyThroughItsWrites(t *testing.T) {
	seed := func(r *effortRig, id int64, tag string) {
		require.NoError(r.t, r.mgr.PutDiffComment(r.ctx, id, diffComment("c-"+tag, "body "+tag)))
		require.NoError(r.t, r.mgr.UpdateDiffTicks(r.ctx, id, []string{"k-" + tag}, nil))
	}
	for _, start := range noteSourceStates() {
		for _, in := range noteInputs() {
			t.Run(start.name+"/"+in.name, func(t *testing.T) {
				t.Parallel()
				r := newEffortRig(t)
				other := r.launch("", "")
				seed(r, other, "other")
				id := start.build(r)
				require.Equal(t, start.wantState, r.get(id).State)
				require.Equal(t, start.wantAlive, r.get(id).Alive)
				seed(r, id, "target")
				wantTarget, wantOther := r.review(id), r.review(other)

				err := in.run(r, id)
				for _, ok := range in.okErrs {
					if errors.Is(err, ok) {
						err = nil
					}
				}
				require.NoError(t, err)

				assert.Equal(t, wantTarget, r.review(id), "the target's review")
				assert.Equal(t, wantOther, r.review(other), "the bystander's review")
				assert.Equal(t, wantTarget, r.reloadedReview(id), "the target's review in the store")
				assert.Equal(t, wantOther, r.reloadedReview(other), "the bystander's review in the store")
			})
		}
	}
}

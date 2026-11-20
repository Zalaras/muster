package session

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"
)

type DiffPos struct {
	Side string `json:"side"`
	Line int    `json:"line"`
}

type DiffComment struct {
	ID        string    `json:"id"`
	Path      string    `json:"path"`
	Start     DiffPos   `json:"start"`
	End       DiffPos   `json:"end"`
	Quote     []string  `json:"quote"`
	Body      string    `json:"body"`
	Resolved  bool      `json:"resolved"`
	CreatedAt time.Time `json:"createdAt"`
}

type DiffReview struct {
	Comments []DiffComment `json:"comments"`
	Ticks    []string      `json:"ticks"`
}

func (r DiffReview) OpenComments() int {
	open := 0
	for _, c := range r.Comments {
		if !c.Resolved {
			open++
		}
	}
	return open
}

func decodeDiffReview(raw *string) (DiffReview, error) {
	review := DiffReview{Comments: []DiffComment{}, Ticks: []string{}}
	if raw == nil {
		return review, nil
	}
	if err := json.Unmarshal([]byte(*raw), &review); err != nil {
		return DiffReview{}, fmt.Errorf("decoding diff review: %w", err)
	}
	if review.Comments == nil {
		review.Comments = []DiffComment{}
	}
	if review.Ticks == nil {
		review.Ticks = []string{}
	}
	return review, nil
}

func encodeDiffReview(review DiffReview) (*string, error) {
	if len(review.Comments) == 0 && len(review.Ticks) == 0 {
		return nil, nil
	}
	out, err := json.Marshal(review)
	if err != nil {
		return nil, fmt.Errorf("encoding diff review: %w", err)
	}
	text := string(out)
	return &text, nil
}

func (m *Manager) DiffReview(id int64) (DiffReview, error) {
	sess, ok := m.Get(id)
	if !ok {
		return DiffReview{}, ErrUnknownSession
	}
	return decodeDiffReview(sess.DiffReview)
}

func (m *Manager) PutDiffComment(ctx context.Context, id int64, c DiffComment) error {
	return m.mutateDiffReview(ctx, id, func(r *DiffReview) {
		if i := slices.IndexFunc(r.Comments, func(have DiffComment) bool { return have.ID == c.ID }); i >= 0 {
			c.CreatedAt = r.Comments[i].CreatedAt
			r.Comments[i] = c
			return
		}
		c.CreatedAt = time.Now().UTC().Truncate(time.Second)
		r.Comments = append(r.Comments, c)
	})
}

func (m *Manager) DeleteDiffComment(ctx context.Context, id int64, commentID string) error {
	return m.mutateDiffReview(ctx, id, func(r *DiffReview) {
		r.Comments = slices.DeleteFunc(r.Comments, func(c DiffComment) bool { return c.ID == commentID })
	})
}

func (m *Manager) UpdateDiffTicks(ctx context.Context, id int64, add, remove []string) error {
	return m.mutateDiffReview(ctx, id, func(r *DiffReview) {
		r.Ticks = slices.DeleteFunc(r.Ticks, func(key string) bool { return slices.Contains(remove, key) })
		for _, key := range add {
			if !slices.Contains(r.Ticks, key) {
				r.Ticks = append(r.Ticks, key)
			}
		}
	})
}

// mutateDiffReview reads, changes and writes a session's review under Manager.mu, so two
// writes to one session never lose each other; the write itself is ordered by the
// session's write turnstile like every whole-row setter. It never broadcasts.
func (m *Manager) mutateDiffReview(ctx context.Context, id int64, change func(*DiffReview)) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return ErrUnknownSession
	}

	review, err := decodeDiffReview(sess.DiffReview)
	if err != nil {
		m.mu.Unlock()
		return fmt.Errorf("session %d: %w", id, err)
	}
	change(&review)
	stored, err := encodeDiffReview(review)
	if err != nil {
		m.mu.Unlock()
		return fmt.Errorf("session %d: %w", id, err)
	}
	if stringPtrEqual(sess.DiffReview, stored) {
		m.mu.Unlock()
		return nil
	}

	prev := sess.Clone()
	sess.DiffReview = stored
	post := sess.Clone()
	if _, err := m.persistWholeRowLocked(ctx, id, sess, prev, post, false); err != nil {
		return fmt.Errorf("persisting diff review for session %d: %w", id, err)
	}
	return nil
}

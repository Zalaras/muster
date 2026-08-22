package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Zalaras/muster/internal/gitutil"
)

// repoWire is one GET /api/repos element (docs/protocol.md §3.2, additive REQ-5 fields).
type repoWire struct {
	ID                 int64   `json:"id"`
	Path               string  `json:"path"`
	Name               string  `json:"name"`
	IsGit              bool    `json:"isGit"`
	Branch             *string `json:"branch"`
	Pinned             bool    `json:"pinned"`
	LastLaunchedAt     string  `json:"lastLaunchedAt"`
	LaunchCount        int     `json:"launchCount"`
	LastModel          *string `json:"lastModel"`
	LastPermissionMode *string `json:"lastPermissionMode"`
}

// handleListRepos is GET /api/repos: the MRU directory picker list, ordered
// `pinned DESC, lastLaunchedAt DESC`, with branch read at request time (D20).
func (s *Server) handleListRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := s.store.ListRepos(r.Context())
	if err != nil {
		s.log.Error().Err(err).Msg("listing repos failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "could not list repos")
		return
	}

	out := make([]repoWire, 0, len(repos))
	for _, repo := range repos {
		var branch *string
		if repo.IsGit {
			branch = gitutil.Branch(r.Context(), repo.Path)
		}
		out = append(out, repoWire{
			ID:                 repo.ID,
			Path:               repo.Path,
			Name:               repo.Name,
			IsGit:              repo.IsGit,
			Branch:             branch,
			Pinned:             repo.Pinned,
			LastLaunchedAt:     repo.LastLaunchedAt.UTC().Format(time.RFC3339),
			LaunchCount:        repo.LaunchCount,
			LastModel:          repo.LastModel,
			LastPermissionMode: repo.LastPermissionMode,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(out)
}

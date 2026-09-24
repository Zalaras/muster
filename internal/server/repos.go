package server

import (
	"net/http"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/gitutil"
	"github.com/Zalaras/muster/internal/store"
)

// repoWire is one GET /api/repos element (kb:anchor/repos.list).
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

// reposFeature owns GET /api/repos.
type reposFeature struct {
	store *store.Store
	log   zerolog.Logger
}

func newReposFeature(st *store.Store, log zerolog.Logger) *reposFeature {
	return &reposFeature{store: st, log: log}
}

func (f *reposFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/repos", guard(http.HandlerFunc(f.handleListRepos)))
}

// handleListRepos is GET /api/repos: the MRU directory picker list
// (kb:adr/launch-hybrid-mru-directory-memory), ordered `pinned DESC, lastLaunchedAt
// DESC`, with branch read at request time.
func (f *reposFeature) handleListRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := f.store.ListRepos(r.Context())
	if err != nil {
		f.log.Error().Err(err).Msg("listing repos failed")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
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
			LastLaunchedAt:     wireTime(repo.LastLaunchedAt),
			LaunchCount:        repo.LaunchCount,
			LastModel:          repo.LastModel,
			LastPermissionMode: repo.LastPermissionMode,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

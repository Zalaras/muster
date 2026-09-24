package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/gitutil"
)

// Fixed 4xx reasons browseDirectory can fail with — the handler maps each to its wire
// status/code; anything else (home-directory resolution) is browseDirectory's one 500.
var (
	errBrowsePathNotAbsolute = errors.New("path must be an absolute directory path")
	errBrowseDirNotFound     = errors.New("directory does not exist or is not a directory")
	errBrowseDirNotReadable  = errors.New("directory is not readable")
)

// browseDirWire is one subdirectory entry in a GET /api/browse response.
type browseDirWire struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsGit bool   `json:"isGit"`
}

// browseResponse is GET /api/browse's 200 body (kb:anchor/browse.get).
type browseResponse struct {
	Path   string          `json:"path"`
	Parent *string         `json:"parent"`
	Dirs   []browseDirWire `json:"dirs"`
}

// browseFeature owns GET /api/browse (plan code-breakup REQ-6). root is Config's
// -browse-root flag value, fixed for the daemon's lifetime.
type browseFeature struct {
	root string
	log  zerolog.Logger
}

func newBrowseFeature(root string, log zerolog.Logger) *browseFeature {
	return &browseFeature{root: root, log: log}
}

func (f *browseFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("GET /api/browse", guard(http.HandlerFunc(f.handleBrowse)))
}

// handleBrowse is GET /api/browse: lists a directory's subdirectories for the launch
// modal's folder browser (REQ-6), since browsers never reveal a chosen folder's
// absolute path. The browse root (-browse-root; empty = the user's home directory)
// is the no-param default and the "Up" ceiling; explicit paths elsewhere stay allowed.
func (f *browseFeature) handleBrowse(w http.ResponseWriter, r *http.Request) {
	resp, err := browseDirectory(r.Context(), f.root, r.URL.Query().Get("path"))
	if err != nil {
		switch {
		case errors.Is(err, errBrowsePathNotAbsolute):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", err.Error())
		case errors.Is(err, errBrowseDirNotFound), errors.Is(err, errBrowseDirNotReadable):
			writeJSONError(w, http.StatusNotFound, "not_found", err.Error())
		default:
			f.log.Error().Err(err).Msg("determining home directory failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// browseDirectory is handleBrowse's domain call (§ Go "handlers decode, delegate,
// encode"; maintainability-cleanup review Minor 14): resolves the effective root,
// validates and cleans path, and lists path's non-dot subdirectories with each one's
// isGit probe, sorted, plus the "Up" parent (nil at the root).
func browseDirectory(ctx context.Context, root, path string) (browseResponse, error) {
	if root == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return browseResponse{}, fmt.Errorf("determining home directory: %w", err)
		}
		root = home
	}
	root = filepath.Clean(root)

	if path == "" {
		path = root
	} else if !filepath.IsAbs(path) {
		return browseResponse{}, errBrowsePathNotAbsolute
	}
	path = filepath.Clean(path)

	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return browseResponse{}, errBrowseDirNotFound
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return browseResponse{}, errBrowseDirNotReadable
	}

	dirs := make([]browseDirWire, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		sub := filepath.Join(path, e.Name())
		dirs = append(dirs, browseDirWire{Name: e.Name(), Path: sub, IsGit: gitutil.IsRepo(ctx, sub)})
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name < dirs[j].Name })

	var parent *string
	if p := filepath.Dir(path); p != path && path != root {
		parent = &p
	}

	return browseResponse{Path: path, Parent: parent, Dirs: dirs}, nil
}

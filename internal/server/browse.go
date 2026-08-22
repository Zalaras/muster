package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Zalaras/muster/internal/gitutil"
)

// browseDirWire is one subdirectory entry in a GET /api/browse response.
type browseDirWire struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsGit bool   `json:"isGit"`
}

// browseResponse is GET /api/browse's 200 body (docs/protocol.md §3.6).
type browseResponse struct {
	Path   string          `json:"path"`
	Parent *string         `json:"parent"`
	Dirs   []browseDirWire `json:"dirs"`
}

// handleBrowse is GET /api/browse: lists a directory's subdirectories for the launch
// modal's folder browser (REQ-6), since browsers never reveal a chosen folder's
// absolute path. The browse root (-browse-root; empty = the user's home directory)
// is the no-param default and the "Up" ceiling; explicit paths elsewhere stay allowed.
func (s *Server) handleBrowse(w http.ResponseWriter, r *http.Request) {
	root := s.browseRoot
	if root == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "internal_error", "could not determine home directory")
			return
		}
		root = home
	}
	root = filepath.Clean(root)

	path := r.URL.Query().Get("path")
	if path == "" {
		path = root
	} else if !filepath.IsAbs(path) {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "path must be an absolute directory path")
		return
	}
	path = filepath.Clean(path)

	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		writeJSONError(w, http.StatusNotFound, "not_found", "directory does not exist or is not a directory")
		return
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "not_found", "directory is not readable")
		return
	}

	dirs := make([]browseDirWire, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		sub := filepath.Join(path, e.Name())
		dirs = append(dirs, browseDirWire{Name: e.Name(), Path: sub, IsGit: gitutil.IsRepo(r.Context(), sub)})
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name < dirs[j].Name })

	var parent *string
	if p := filepath.Dir(path); p != path && path != root {
		parent = &p
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(browseResponse{Path: path, Parent: parent, Dirs: dirs})
}

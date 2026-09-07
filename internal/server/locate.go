package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/Zalaras/muster/internal/locate"
)

// maxLocateUploadBytes bounds POST /api/sessions/{id}/locate's body (docs/protocol.md
// §3.14): 50 MiB of file content plus 64 KiB of multipart overhead. Anything over this
// trips *http.MaxBytesError and answers 413 too_large.
const maxLocateUploadBytes = 50<<20 + 64<<10

// locateResponse is POST /api/sessions/{id}/locate's 200 body (docs/protocol.md §3.14).
type locateResponse struct {
	Path string `json:"path"`
}

// handleLocateFile is POST /api/sessions/{id}/locate (plan file-drop-fix, docs/protocol.md
// §3.14). It decodes the single multipart file part directly off the wire — never via
// ParseMultipartForm's memory/temp-file split — so the upload can never touch disk
// (INV-2), delegates to the Locator, and maps its outcome to the Protocol Contract's
// error codes. Business logic (candidate discovery, byte comparison) lives entirely in
// internal/locate; this handler only decodes, delegates and encodes.
func (s *Server) handleLocateFile(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, ok := s.manager.Get(id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "unknown_session", "unknown session id")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxLocateUploadBytes)

	mr, err := r.MultipartReader()
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_request", "request body is not multipart/form-data")
		return
	}

	name, upload, ferr := readFilePart(mr)
	if ferr != nil {
		var maxErr *http.MaxBytesError
		switch {
		case errors.As(ferr, &maxErr):
			writeJSONError(w, http.StatusRequestEntityTooLarge, "too_large", "upload exceeds the 50 MiB limit")
		case errors.Is(ferr, errNoFilePart):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "request has no file part")
		case errors.Is(ferr, errBadFilename):
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "file part's filename must be non-empty and contain no path separator")
		default:
			writeJSONError(w, http.StatusBadRequest, "invalid_request", "malformed multipart body")
		}
		return
	}

	// REQ-6/D6: a misconfigured server (Config.Locator left nil) answers 500 instead of
	// nil-dereferencing here. Placed after readFilePart succeeds so it guards only the
	// call it exists to protect — every 400/413 body-validation branch above must stay
	// reachable and unaffected regardless of whether a Locator is configured.
	if s.locator == nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "locating file")
		return
	}

	path, err := s.locator.Locate(r.Context(), sess.Directory, name, upload)
	if err != nil {
		var ambiguous *locate.ErrAmbiguous
		switch {
		case errors.Is(err, locate.ErrNotLocated):
			writeJSONError(w, http.StatusNotFound, "not_located", fmt.Sprintf("no file named %s with identical contents was found", name))
		case errors.As(err, &ambiguous):
			writeLocateAmbiguous(w, name, ambiguous.Paths)
		default:
			writeJSONError(w, http.StatusInternalServerError, "internal_error", "locating file")
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(locateResponse{Path: path})
}

var (
	errNoFilePart  = errors.New("locate: request has no file part")
	errBadFilename = errors.New("locate: file part has an invalid filename")
)

// readFilePart reads the first (and only) part named "file" off mr, entirely in memory
// (INV-2: the upload is a fingerprint, never staged to disk). Every other part is
// skipped unread — the Protocol Contract reads no other parts.
func readFilePart(mr *multipart.Reader) (string, []byte, error) {
	for {
		part, partErr := mr.NextPart()
		if errors.Is(partErr, io.EOF) {
			return "", nil, errNoFilePart
		}
		if partErr != nil {
			return "", nil, partErr
		}

		if part.FormName() != "file" {
			_ = part.Close()
			continue
		}

		filename := part.FileName()
		if filename == "" || strings.Contains(filename, "/") {
			_ = part.Close()
			return "", nil, errBadFilename
		}

		data, readErr := io.ReadAll(part)
		_ = part.Close()
		if readErr != nil {
			return "", nil, readErr
		}
		return filename, data, nil
	}
}

// writeLocateAmbiguous writes 409 ambiguous (docs/protocol.md §3.14): the standard
// error envelope with an extra paths field listing every verified match.
func writeLocateAmbiguous(w http.ResponseWriter, name string, paths []string) {
	var resp struct {
		Error struct {
			Code    string   `json:"code"`
			Message string   `json:"message"`
			Paths   []string `json:"paths"`
		} `json:"error"`
	}
	resp.Error.Code = "ambiguous"
	resp.Error.Message = fmt.Sprintf("%d identical files named %s", len(paths), name)
	resp.Error.Paths = paths

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	_ = json.NewEncoder(w).Encode(resp)
}

package server

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/locate"
	"github.com/Zalaras/muster/internal/session"
)

// maxLocateUploadBytes bounds POST /api/sessions/{id}/locate's body
// (kb:anchor/sessions.locate): 50 MiB of file content plus 64 KiB of multipart overhead. Anything over this
// trips *http.MaxBytesError and answers 413 too_large.
const maxLocateUploadBytes = 50<<20 + 64<<10

// locateResponse is POST /api/sessions/{id}/locate's 200 body (kb:anchor/sessions.locate).
type locateResponse struct {
	Path string `json:"path"`
}

// locateFeature owns POST /api/sessions/{id}/locate (plan code-breakup REQ-6). locator
// is nilable: a misconfigured server (Config.Locator left nil) answers 500 rather than
// nil-dereferencing (REQ-6/D6).
type locateFeature struct {
	manager *session.Manager
	locator *locate.Locator
	log     zerolog.Logger
}

func newLocateFeature(manager *session.Manager, locator *locate.Locator, log zerolog.Logger) *locateFeature {
	return &locateFeature{manager: manager, locator: locator, log: log}
}

func (f *locateFeature) mount(mux *http.ServeMux, guard func(http.Handler) http.Handler) {
	mux.Handle("POST /api/sessions/{id}/locate", guard(http.HandlerFunc(f.handleLocateFile)))
}

// handleLocateFile is POST /api/sessions/{id}/locate (plan file-drop-fix,
// kb:anchor/sessions.locate). It decodes the single multipart file part directly off the wire — never via
// ParseMultipartForm's memory/temp-file split — so the upload can never touch disk
// (INV-2), delegates to the Locator, and maps its outcome to the Protocol Contract's
// error codes. Business logic (candidate discovery, byte comparison) lives entirely in
// internal/locate; this handler only decodes, delegates and encodes.
func (f *locateFeature) handleLocateFile(w http.ResponseWriter, r *http.Request) {
	id, ok := parseSessionID(w, r)
	if !ok {
		return
	}
	sess, ok := sessionOr404(w, f.manager, id)
	if !ok {
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
	if f.locator == nil {
		f.log.Error().Msg("locating file failed: no Locator configured")
		writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		return
	}

	path, err := f.locator.Locate(r.Context(), sess.Directory, name, upload)
	if err != nil {
		var ambiguous *locate.ErrAmbiguous
		switch {
		case errors.Is(err, locate.ErrNotLocated):
			writeJSONError(w, http.StatusNotFound, "not_located", fmt.Sprintf("no file named %s with identical contents was found", name))
		case errors.As(err, &ambiguous):
			writeLocateAmbiguous(w, name, ambiguous.Paths)
		default:
			f.log.Error().Err(err).Msg("locating file failed")
			writeJSONError(w, http.StatusInternalServerError, "internal_error", msgInternalError)
		}
		return
	}

	writeJSON(w, http.StatusOK, locateResponse{Path: path})
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

// writeLocateAmbiguous writes 409 ambiguous (kb:anchor/sessions.locate): the standard
// error envelope with its extra paths field listing every verified match.
func writeLocateAmbiguous(w http.ResponseWriter, name string, paths []string) {
	writeJSONErrorPaths(w, http.StatusConflict, "ambiguous",
		fmt.Sprintf("%d identical files named %s", len(paths), name), paths)
}

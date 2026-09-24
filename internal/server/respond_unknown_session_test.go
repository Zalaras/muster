package server

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// wantUnknownSessionBody is respond.go's msgUnknownSession envelope, spelled out
// literally rather than built from writeUnknownSession's own constants — the point of
// this test is to catch a divergence at any of the sites respond.go's Minor 4 migration
// touched, so it must not share code with the thing it's checking. Every one of these
// sites shares the one writeJSON encoder respond.go already uses, so JSONEq's semantic
// comparison (this project's testifylint policy over a raw string Equal) and a literal
// byte comparison agree here — there is only one place this JSON could get formatted.
const wantUnknownSessionBody = `{"error":{"code":"unknown_session","message":"unknown session id"}}`

// authedRequest fires one cookie-authed request at srv's mux and returns the recorded
// response — sessionActionRequest's shape (sessions_test.go), generalised to carry a
// request body for the PUT endpoints this table also covers.
func authedRequest(t *testing.T, srv *testServer, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	req.AddCookie(&http.Cookie{Name: cookieName, Value: testUIToken})
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

// TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites covers respond.go's
// Minor 4 migration (parseSessionID moved from sessions.go, five sessions.go call sites
// and issue.go's handleCreateCapture switched from a hand-spelled writeJSONError to
// writeUnknownSession): every one of them must still answer 404 with the exact same
// {"error":{"code":"unknown_session","message":"unknown session id"}} body it did before
// the refactor — the migration was meant to be purely mechanical (one spelling instead of
// six), never a wire change.
//
// This table cannot be made to fail against the pre-FW-D3 code: the migration's own log
// records the output as byte-identical by construction (every site already spelled the
// exact same code+message before Minor 4, and issue.go's wireTime(now) resolves to the
// same string as the old now.Format(time.RFC3339) call because now is already UTC there)
// — confirmed directly, per daemon-tests-FW-D3.md: this same table run against
// sessions.go/respond.go/issue.go with parseSessionID restored to its pre-move body and
// handleCreateCapture's hand-rolled Get-or-404 restored passes identically. What this
// test guards against is a *future* divergence now that six sites share one spelling
// instead of six.
func TestUnknownSessionEnvelope_ByteIdenticalAcrossMigratedCallSites(t *testing.T) {
	const missingID = int64(999999)

	t.Run("sessions.go call sites", func(t *testing.T) {
		cases := []struct {
			name   string
			method string
			path   string
			body   string
		}{
			{"handleEndSession/unknown", http.MethodPost, fmt.Sprintf("/api/sessions/%d/end", missingID), ""},
			{"handleEndSession/malformed id", http.MethodPost, "/api/sessions/not-a-number/end", ""},
			{"handleRemoveSession/unknown", http.MethodDelete, fmt.Sprintf("/api/sessions/%d", missingID), ""},
			{"handleRemoveSession/malformed id", http.MethodDelete, "/api/sessions/not-a-number", ""},
			{"handlePaneSnapshot/unknown", http.MethodGet, fmt.Sprintf("/api/sessions/%d/pane", missingID), ""},
			{"handlePaneSnapshot/malformed id", http.MethodGet, "/api/sessions/not-a-number/pane", ""},
			{"handlePinSession/unknown", http.MethodPut, fmt.Sprintf("/api/sessions/%d/pin", missingID), `{"pinned":true}`},
			{"handleSetTitle/unknown", http.MethodPut, fmt.Sprintf("/api/sessions/%d/title", missingID), `{"title":"x"}`},
		}

		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				srv := newTestServer(t, ClaudeCodeInfo{})
				rec := authedRequest(t, srv, tc.method, tc.path, tc.body)

				assert.Equal(t, http.StatusNotFound, rec.Code)
				assert.JSONEq(t, wantUnknownSessionBody, rec.Body.String())
			})
		}
	})

	t.Run("issue.go handleCreateCapture", func(t *testing.T) {
		srv := newIssueTestServer(t, "http://example.invalid", "owner/repo", "tok")
		rec := postCaptureRequest(t, srv, fmt.Sprintf(`{"sessionId":%d}`, missingID))

		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.JSONEq(t, wantUnknownSessionBody, rec.Body.String())
	})
}

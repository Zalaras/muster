//go:build canary

package canary

import (
	"encoding/json"
	"net/http"
	"os"
	"os/user"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Zalaras/muster/internal/claudecode"
)

// live gates the live tier behind the same MUSTER_CANARY_OFFLINE skip harness(t) uses
// (REQ-10): offline means no session, no Keychain read, no network connection (INV-1).
// Unlike harness(t), a live-tier failure below this point is never a build failure to
// share across tests — each of the three tests below re-reads the real credential itself.
func live(t *testing.T) {
	t.Helper()
	if os.Getenv(offlineEnv) != "" {
		t.Skipf("%s is set: not reading the Keychain or the network", offlineEnv)
	}
	if skipReason != "" {
		t.Skip(skipReason)
	}
}

// liveToken resolves the production Keychain token the same way cmd/musterd/main.go's
// keychainUser + claudecode.KeychainTokenReader does. It FAILS the test (never skips) on
// ErrNoCredentials — decision 2026-09-10: a skip passes silently on the one machine this
// gate exists for (Edge Case 6). The token itself is never logged (REQ-2/INV-2).
func liveToken(t *testing.T) string {
	t.Helper()
	u, err := user.Current()
	require.NoError(t, err, "resolving current OS user")

	reader := claudecode.KeychainTokenReader(u.Username, claudecode.RunCommand)
	token, err := reader(t.Context())
	require.NoErrorf(t, err, "production Keychain reader returned no credentials for user %q", u.Username)
	require.NotEmpty(t, token, "Keychain token must be non-empty")
	return token
}

// TestKeychainCredentialShape runs the production Keychain reader for the current OS
// user (REQ-8/D9).
func TestKeychainCredentialShape(t *testing.T) {
	live(t)
	_ = liveToken(t)
}

// TestUsageAPIResponseShape calls the production FetchUsage and separately performs one
// raw GET with the two measured headers, asserting the wire shape REQ-8 lists. A 401/403
// fails the test (Edge Case 7); every assertion message carries key names and named
// scalars only, never a response body or the token (REQ-2/INV-2).
func TestUsageAPIResponseShape(t *testing.T) {
	live(t)
	testStart := time.Now()
	token := liveToken(t)
	client := &http.Client{Timeout: 10 * time.Second}

	report, err := claudecode.FetchUsage(t.Context(), client, "https://api.anthropic.com", token)
	require.NoError(t, err, "production FetchUsage call")
	require.NotEmpty(t, report.ModelScoped, "usage report carried no weekly_scoped model window")
	for i, w := range report.ModelScoped {
		assert.NotEmptyf(t, w.DisplayName, "usage window %d missing display_name", i)
		assert.GreaterOrEqualf(t, w.UsedPct, 0.0, "usage window %d used_pct below 0", i)
		assert.LessOrEqualf(t, w.UsedPct, 100.0, "usage window %d used_pct above 100", i)
		assert.Truef(t, w.ResetsAt.After(testStart), "usage window %d resets_at must be after the test started", i)
	}

	body := rawUsageGET(t, client, token)
	for _, k := range []string{"five_hour", "seven_day", "limits"} {
		assert.Containsf(t, keys(body), k, "usage response missing top-level %q; has %v", k, keys(body))
	}
	limits, ok := body["limits"].([]any)
	require.Truef(t, ok, "usage response limits must be an array; got %T", body["limits"])
	require.NotEmpty(t, limits, "usage response limits[] must be non-empty")

	sawWeeklyScoped := false
	for i, raw := range limits {
		l, ok := raw.(map[string]any)
		require.Truef(t, ok, "limits[%d] must be an object", i)
		for _, k := range []string{"kind", "percent", "resets_at"} {
			assert.Containsf(t, keys(l), k, "limits[%d] missing %q; has %v", i, k, keys(l))
		}
		resets, ok := l["resets_at"].(string)
		if assert.Truef(t, ok, "limits[%d].resets_at must be a string", i) {
			_, parseErr := time.Parse(time.RFC3339Nano, resets)
			assert.NoErrorf(t, parseErr, "limits[%d].resets_at does not parse as RFC3339Nano", i)
		}
		if kind, _ := l["kind"].(string); kind == "weekly_scoped" {
			if scope, ok := l["scope"].(map[string]any); ok {
				if model, ok := scope["model"].(map[string]any); ok {
					if _, ok := model["display_name"].(string); ok {
						sawWeeklyScoped = true
					}
				}
			}
		}
	}
	assert.True(t, sawWeeklyScoped, "no limits[] entry had kind==\"weekly_scoped\" with a string scope.model.display_name")
}

// rawUsageGET performs one GET against the real usage endpoint with the two measured
// headers (docs/history/spikes/canary-fields.md "GET /api/oauth/usage measured live") and decodes the
// body into a generic map — callers must read key names and scalars only (REQ-2/INV-2),
// never log the map itself.
func rawUsageGET(t *testing.T, client *http.Client, token string) map[string]any {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "https://api.anthropic.com/api/oauth/usage", nil)
	require.NoError(t, err, "building raw usage request")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("anthropic-beta", "oauth-2025-04-20")

	resp, err := client.Do(req)
	require.NoError(t, err, "raw usage GET")
	defer func() { _ = resp.Body.Close() }()
	require.Equalf(t, http.StatusOK, resp.StatusCode, "usage endpoint returned status %d (401/403 means the token was rejected)", resp.StatusCode)

	var body map[string]any
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body), "decoding raw usage response")
	return body
}

// TestThemeConfigParses asserts the production theme reader against the real global
// config file, read-only — ReadThemeFamily never opens its path for writing (REQ-8).
func TestThemeConfigParses(t *testing.T) {
	live(t)
	path, err := claudecode.DefaultConfigPath()
	require.NoError(t, err, "resolving Claude Code's default config path")
	family := claudecode.ReadThemeFamily(path)
	assert.NotEqualf(t, claudecode.ThemeUnknown, family, "ReadThemeFamily(%s) must not be ThemeUnknown", path)
}

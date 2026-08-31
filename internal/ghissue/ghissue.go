// Package ghissue is a minimal GitHub Issues client: obtaining a bearer token and
// filing one issue. It knows nothing about muster sessions, the daemon store, or Claude
// Code (plan issue-capture D5) — CreateIssue takes two strings (title, body) and posts
// them; the caller (internal/server) owns everything about what goes into those strings.
package ghissue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// ErrAuthFailed is returned by a TokenReader (and by CreateIssue, which returns it
// unwrapped when the failure happened at the token step) when a bearer token could not
// be obtained: gh missing, gh auth token exiting non-zero, or an empty token. Message
// never carries gh's stdout — that's where the token lives (REQ-11/INV-3).
type ErrAuthFailed struct {
	Message string
}

func (e *ErrAuthFailed) Error() string { return e.Message }

// ErrPostFailed is returned by CreateIssue when the request to GitHub itself failed:
// non-2xx, a transport error, or a 2xx body that would not parse. MaybeCreated is true
// whenever the request reached GitHub and may have created the issue — an unreadable or
// unusable 2xx body (plan Edge Case 9).
type ErrPostFailed struct {
	Message      string
	MaybeCreated bool
}

func (e *ErrPostFailed) Error() string { return e.Message }

// TokenReader returns a GitHub bearer token. It is re-read on every call — mirrors
// internal/claudecode.TokenReader (credentials.go); callers must never cache a value.
type TokenReader func(ctx context.Context) (string, error)

// ghTokenTimeout bounds `gh auth token` (plan Implementation Notes: "5s, matching
// versionCheckTimeout in main.go").
const ghTokenTimeout = 5 * time.Second

// execFunc abstracts running `gh` for GhCLITokenReader's tests — mirrors
// claudecode/credentials.go's own execFunc seam (no test may execute the real `gh`
// binary). Unlike that seam, both stdout and stderr are returned: a failure's message
// carries gh's trimmed stderr, never its stdout.
type execFunc func(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)

// RunCommand is the production execFunc: runs name with args, capturing stdout and
// stderr separately. Neither is ever logged by any caller (REQ-11).
func RunCommand(ctx context.Context, name string, args ...string) (stdout, stderr string, err error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	err = cmd.Run()
	return outBuf.String(), errBuf.String(), err
}

// GhCLITokenReader runs `gh auth token`, returning its trimmed stdout as the bearer
// token. lookPath and run are the test seams (production: exec.LookPath, RunCommand) —
// no test may execute the real `gh` binary. A missing gh, a non-zero exit, or an empty
// token all report *ErrAuthFailed carrying gh's trimmed stderr and naming
// `gh auth login`; gh's stdout is never included in an error.
func GhCLITokenReader(lookPath func(string) (string, error), run execFunc) TokenReader {
	return func(ctx context.Context) (string, error) {
		if _, err := lookPath("gh"); err != nil {
			return "", &ErrAuthFailed{Message: "gh is not installed or not on PATH; run `gh auth login`"}
		}

		cctx, cancel := context.WithTimeout(ctx, ghTokenTimeout)
		defer cancel()
		stdout, stderr, err := run(cctx, "gh", "auth", "token")
		if err != nil {
			msg := strings.TrimSpace(stderr)
			if msg == "" {
				msg = "gh auth token exited with an error"
			}
			return "", &ErrAuthFailed{Message: fmt.Sprintf("gh auth token: %s; run `gh auth login`", msg)}
		}

		token := strings.TrimSpace(stdout)
		if token == "" {
			return "", &ErrAuthFailed{Message: "gh auth token printed an empty token; run `gh auth login`"}
		}
		return token, nil
	}
}

// FileTokenReader reads the trimmed contents of path as the token — the
// -issue-token-file test seam (REQ-14), plain text (deliberately not the JSON shape of
// claudecode.FileTokenReader) that makes it structurally impossible for a test using it
// to fall through to a real `gh` invocation.
func FileTokenReader(path string) TokenReader {
	return func(_ context.Context) (string, error) {
		data, err := os.ReadFile(path)
		if err != nil {
			return "", &ErrAuthFailed{Message: fmt.Sprintf("reading issue token file: %v", err)}
		}
		token := strings.TrimSpace(string(data))
		if token == "" {
			return "", &ErrAuthFailed{Message: "issue token file is empty"}
		}
		return token, nil
	}
}

// createIssueTimeout bounds the GitHub POST (plan Implementation Notes: "10s"), derived
// from the caller's context so a client disconnect kills it too.
const createIssueTimeout = 10 * time.Second

// Client is a minimal GitHub Issues client. TokenReader is re-read on every CreateIssue
// call — REQ-8's "never stored, re-read on every use".
type Client struct {
	HTTPClient  *http.Client
	BaseURL     string
	TokenReader TokenReader
}

type createIssueRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type createIssueResponse struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
}

type githubErrorBody struct {
	Message string `json:"message"`
}

// CreateIssue obtains a fresh bearer token via c.TokenReader, then POSTs
// {c.BaseURL}/repos/{repo}/issues with title/body (docs/protocol.md §3.13's measured
// headers), returning the created issue's number and html_url. The token travels only in
// the Authorization header — never logged, never echoed into a returned error (INV-3);
// this holds whether the failure happened obtaining the token (*ErrAuthFailed, returned
// unwrapped) or posting to GitHub (*ErrPostFailed).
func (c *Client) CreateIssue(ctx context.Context, repo, title, body string) (number int, htmlURL string, err error) {
	token, err := c.TokenReader(ctx)
	if err != nil {
		return 0, "", err
	}

	ctx, cancel := context.WithTimeout(ctx, createIssueTimeout)
	defer cancel()

	payload, err := json.Marshal(createIssueRequest{Title: title, Body: body})
	if err != nil {
		return 0, "", fmt.Errorf("encoding issue request: %w", err)
	}

	url := fmt.Sprintf("%s/repos/%s/issues", c.BaseURL, repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return 0, "", fmt.Errorf("building issue request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Content-Type", "application/json")

	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, "", &ErrPostFailed{Message: fmt.Sprintf("requesting github: %v", err)}
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, readErr := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if msg := githubMessage(respBody); msg != "" {
			return 0, "", &ErrPostFailed{Message: fmt.Sprintf("github returned %d: %s", resp.StatusCode, msg)}
		}
		return 0, "", &ErrPostFailed{Message: fmt.Sprintf("github returned status %d", resp.StatusCode)}
	}
	if readErr != nil {
		return 0, "", &ErrPostFailed{Message: fmt.Sprintf("reading github response: %v", readErr), MaybeCreated: true}
	}

	var out createIssueResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return 0, "", &ErrPostFailed{
			Message:      "github returned a 2xx response muster could not parse; the issue may nonetheless have been created — check the repo",
			MaybeCreated: true,
		}
	}
	// A 2xx body that unmarshals cleanly but carries no usable issue (e.g. "{}") is not a
	// success either — it would otherwise surface as "Filed <repo>#0" linked to an empty
	// href, and the capture would be consumed for nothing (review cycle 1 Minor 4).
	if out.Number == 0 || out.HTMLURL == "" {
		return 0, "", &ErrPostFailed{
			Message:      "github returned a 2xx response with no issue number/URL; the issue may nonetheless have been created — check the repo",
			MaybeCreated: true,
		}
	}
	return out.Number, out.HTMLURL, nil
}

// githubMessage extracts GitHub's own error `message` field, tolerating a body that
// isn't JSON at all (some failure modes return HTML or plain text).
func githubMessage(body []byte) string {
	var eb githubErrorBody
	if err := json.Unmarshal(body, &eb); err != nil {
		return ""
	}
	return strings.TrimSpace(eb.Message)
}

// Command capture is the interface-probe capture server.
//
// It stands in for musterd: it accepts Claude Code HTTP hook posts at
// /hook/{event} and status-line posts at /statusline, and appends every request
// to a JSONL file for later inspection. Used by the /interface-probe skill and
// (from M4) the canary/E2E harness.
//
// Usage:
//
//	go build -o bin/probe-capture ./test/rig/capture
//	bin/probe-capture -port 8781 -instance 1 -dir test/rig/captures
//	bin/probe-capture -port 8781 -instance 1 -decision '{"decision":"allow"}'
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// sensitiveHeaders are never echoed to stdout and are stored redacted.
var sensitiveHeaders = []string{
	"authorization", "cookie", "set-cookie", "x-api-key", "api-key",
	"proxy-authorization", "x-auth-token", "token", "secret", "password",
}

type record struct {
	ReceivedAt string              `json:"received_at"`
	Path       string              `json:"path"`
	Method     string              `json:"method"`
	Event      string              `json:"event,omitempty"`
	Headers    map[string][]string `json:"headers"`
	BodyRaw    string              `json:"body_raw"`
	Body       any                 `json:"body,omitempty"`
	BodyValid  bool                `json:"body_is_json"`
}

type server struct {
	mu       sync.Mutex
	out      *os.File
	decision string
	stdout   *log.Logger
}

func isSensitive(name string) bool {
	l := strings.ToLower(name)
	for _, s := range sensitiveHeaders {
		if strings.Contains(l, s) {
			return true
		}
	}
	return false
}

// redactHeaders copies headers, replacing credential-shaped values.
func redactHeaders(h http.Header) map[string][]string {
	out := make(map[string][]string, len(h))
	for k, v := range h {
		if isSensitive(k) {
			out[k] = []string{"<redacted>"}
			continue
		}
		out[k] = append([]string(nil), v...)
	}
	return out
}

func (s *server) write(r record) {
	line, err := json.Marshal(r)
	if err != nil {
		s.stdout.Printf("marshal error: %v", err)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.out.Write(append(line, '\n')); err != nil {
		s.stdout.Printf("write error: %v", err)
		return
	}
	_ = s.out.Sync()
}

// capture reads and records the request.
func (s *server) capture(req *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(req.Body, 8<<20))
	_ = req.Body.Close()

	rec := record{
		ReceivedAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z07:00"),
		Path:       req.URL.Path,
		Method:     req.Method,
		Headers:    redactHeaders(req.Header),
		BodyRaw:    string(body),
	}
	if strings.HasPrefix(req.URL.Path, "/hook/") {
		rec.Event = strings.TrimPrefix(req.URL.Path, "/hook/")
	}
	var parsed any
	if err := json.Unmarshal(body, &parsed); err == nil {
		rec.Body = parsed
		rec.BodyValid = true
	}
	s.write(rec)

	// One-line stdout summary. Header values are never printed, and neither are
	// body values — payloads contain prompt text (CLAUDE.md hard rule).
	summary := ""
	if m, ok := rec.Body.(map[string]any); ok {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		summary = fmt.Sprintf(" keys=%v", keys)
	}
	s.stdout.Printf("%s %s %dB json=%t%s", req.Method, req.URL.Path, len(body), rec.BodyValid, summary)
}

func (s *server) handleHook(w http.ResponseWriter, req *http.Request) {
	s.capture(req)
	if s.decision != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, s.decision)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (s *server) handleStatusline(w http.ResponseWriter, req *http.Request) {
	s.capture(req)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "MUSTER-PROBE")
}

func main() {
	var (
		port     = flag.Int("port", 8781, "port to bind on 127.0.0.1")
		instance = flag.String("instance", "1", "instance id; names the capture file")
		dir      = flag.String("dir", "", "directory for capture files (default: cwd)")
		decision = flag.String("decision", os.Getenv("MUSTER_PROBE_DECISION"),
			"canned JSON body to return from /hook/* (e.g. permission decisions)")
	)
	flag.Parse()

	if *dir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		*dir = cwd
	}
	if err := os.MkdirAll(*dir, 0o755); err != nil {
		log.Fatalf("mkdir %s: %v", *dir, err)
	}

	path := filepath.Join(*dir, fmt.Sprintf("capture-%s.jsonl", *instance))
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		log.Fatalf("open %s: %v", path, err)
	}

	s := &server{
		out:      f,
		decision: *decision,
		stdout:   log.New(os.Stdout, fmt.Sprintf("[capture-%s] ", *instance), log.LstdFlags|log.Lmicroseconds),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/hook/", s.handleHook)
	mux.HandleFunc("/statusline", s.handleStatusline)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, "ok")
	})

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	s.stdout.Printf("listening on http://%s  capture=%s  decision=%t", addr, path, *decision != "")

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("serve: %v", err)
	}
}

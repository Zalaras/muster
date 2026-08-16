// Command failproxy is a fault-injection stand-in for the Anthropic API, used
// by interface probes to induce API errors inside a Claude Code turn
// (point ANTHROPIC_BASE_URL at it — honoured under subscription OAuth,
// spikes/FINDINGS.md §3).
//
// Modes:
//   - default: every request gets -status with an Anthropic-shaped error body.
//     Zero real tokens.
//   - -upstream https://api.anthropic.com: reverse-proxy to the real API, but
//     fail the Nth and later /v1/messages requests (-fail-after N). This is how
//     a *mid-turn* failure is induced: the first request succeeds so the turn
//     starts, a later one dies.
//
// It never reads, logs, or stores request headers — the Authorization header on
// these requests carries a live OAuth token. Only method, path and the injected
// status are logged.
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync/atomic"
	"time"
)

func main() {
	var (
		port      = flag.Int("port", 8794, "port to bind on 127.0.0.1")
		status    = flag.Int("status", 500, "HTTP status to inject")
		errType   = flag.String("error-type", "api_error", "Anthropic error .type to inject")
		upstream  = flag.String("upstream", "", "if set, reverse-proxy to this origin and only fail after -fail-after")
		failAfter = flag.Int("fail-after", 0, "with -upstream: number of /v1/messages requests to let through first")
	)
	flag.Parse()

	lg := log.New(log.Writer(), "[failproxy] ", log.LstdFlags|log.Lmicroseconds)

	body := fmt.Sprintf(`{"type":"error","error":{"type":%q,"message":"probe-induced failure"}}`, *errType)

	var seen int64
	var rp *httputil.ReverseProxy
	if *upstream != "" {
		u, err := url.Parse(*upstream)
		if err != nil {
			log.Fatalf("bad upstream: %v", err)
		}
		rp = &httputil.ReverseProxy{
			Rewrite: func(pr *httputil.ProxyRequest) {
				pr.SetURL(u)
				pr.Out.Host = u.Host
			},
			ErrorLog: log.New(io.Discard, "", 0),
		}
	}

	h := func(w http.ResponseWriter, r *http.Request) {
		isMessages := strings.Contains(r.URL.Path, "/v1/messages")
		fail := true
		if rp != nil {
			n := int64(0)
			if isMessages {
				n = atomic.AddInt64(&seen, 1)
			}
			fail = isMessages && n > int64(*failAfter)
		}
		if !fail && rp != nil {
			lg.Printf("PASS %s %s (messages#%d)", r.Method, r.URL.Path, atomic.LoadInt64(&seen))
			rp.ServeHTTP(w, r)
			return
		}
		lg.Printf("FAIL %s %s -> %d", r.Method, r.URL.Path, *status)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(*status)
		_, _ = io.WriteString(w, body)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	lg.Printf("listening on http://%s status=%d error-type=%s upstream=%q fail-after=%d",
		addr, *status, *errType, *upstream, *failAfter)
	srv := &http.Server{
		Addr:              addr,
		Handler:           http.HandlerFunc(h),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

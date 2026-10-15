package triage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// stubScorer writes a shell script speaking the JSON-lines protocol and returns a Scorer for it.
func stubScorer(t *testing.T, body string) *Scorer {
	t.Helper()
	path := filepath.Join(t.TempDir(), "scorer.sh")
	script := "#!/bin/sh\nread -r line\nid=$(printf '%s' \"$line\" | sed 's/.*\"id\":\\([0-9]*\\).*/\\1/')\n" + body + "\n"
	if err := os.WriteFile(path, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return &Scorer{Argv: []string{"/bin/sh", path}, Timeout: 5 * time.Second}
}

func TestScorerProtocol(t *testing.T) {
	a := Artifact{Number: 56, Title: "t", Body: "b"}
	t.Run("a number comes back", func(t *testing.T) {
		p, err := stubScorer(t, `echo "{\"id\":$id,\"p\":0.9}"`).Score(context.Background(), a)
		if err != nil || p != 0.9 {
			t.Fatalf("Score = %v, %v", p, err)
		}
	})
	t.Run("the text is what the scorer reads", func(t *testing.T) {
		// The script echoes 1.0 only when the title and body both arrived on its stdin.
		sc := stubScorer(t, `case "$line" in *'"text":"t\nb"'*) echo "{\"id\":$id,\"p\":1}";; *) echo "{\"id\":$id,\"p\":0}";; esac`)
		p, err := sc.Score(context.Background(), a)
		if err != nil || p != 1 {
			t.Fatalf("Score = %v, %v; the request did not carry title and body", p, err)
		}
	})
	for _, tc := range []struct{ name, body, want string }{
		{"wrong id", `echo '{"id":1,"p":0.9}'`, "for issue 1"},
		{"out of range", `echo "{\"id\":$id,\"p\":1.5}"`, "outside [0,1]"},
		{"not json", `echo nope`, "not {"},
		{"non-zero exit", `exit 3`, "exit status 3"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := stubScorer(t, tc.body).Score(context.Background(), a)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want it to mention %q", err, tc.want)
			}
		})
	}
	t.Run("timeout", func(t *testing.T) {
		sc := stubScorer(t, `sleep 5; echo "{\"id\":$id,\"p\":0.9}"`)
		sc.Timeout = 200 * time.Millisecond
		if _, err := sc.Score(context.Background(), a); err == nil {
			t.Fatal("want a timeout error")
		}
	})
}

func TestApplyScoreRoutes(t *testing.T) {
	fresh := func(route Path) Artifact {
		return Artifact{Number: 1, AuthorAssociation: "NONE", Route: route}
	}
	t.Run("below restrict leaves the route", func(t *testing.T) {
		a := fresh(PathRestricted)
		a.ApplyScore(0.1, nil)
		if a.Route != PathRestricted || !a.Flags.Scored || a.Flags.Score != 0.1 {
			t.Errorf("artifact = %+v", a)
		}
	})
	t.Run("a low score never demotes the owner", func(t *testing.T) {
		a := fresh(PathNormal)
		a.AuthorAssociation = OwnerAssociation
		a.ApplyScore(0.1, nil)
		if a.Route != PathNormal {
			t.Errorf("Route = %v, want normal", a.Route)
		}
	})
	t.Run("at restrict demotes the owner", func(t *testing.T) {
		a := fresh(PathNormal)
		a.AuthorAssociation = OwnerAssociation
		a.ApplyScore(0.5, nil)
		if a.Route != PathRestricted {
			t.Errorf("Route = %v, want restricted", a.Route)
		}
	})
	t.Run("at hold holds", func(t *testing.T) {
		a := fresh(PathRestricted)
		a.ApplyScore(0.8, nil)
		if a.Route != PathHeld {
			t.Errorf("Route = %v, want held", a.Route)
		}
	})
	t.Run("failure flags and leaves the route", func(t *testing.T) {
		a := fresh(PathRestricted)
		a.ApplyScore(0, context.DeadlineExceeded)
		if a.Route != PathRestricted || !a.Flags.ScorerFailed || a.Flags.Scored {
			t.Errorf("artifact = %+v", a)
		}
	})
	t.Run("a held issue is never promoted", func(t *testing.T) {
		a := fresh(PathHeld)
		a.Flags.Tripwire = "role_hijack"
		a.ApplyScore(0.0, nil)
		if a.Route != PathHeld || a.Flags.Scored {
			t.Errorf("artifact = %+v", a)
		}
	})
}

func TestScorerFromEnv(t *testing.T) {
	t.Setenv(ScorerEnv, "")
	if _, ok := ScorerFromEnv(""); ok {
		t.Error("no flag and no env must mean no scorer")
	}
	t.Setenv(ScorerEnv, "python3 -I env.py")
	sc, ok := ScorerFromEnv("")
	if !ok || strings.Join(sc.Argv, " ") != "python3 -I env.py" {
		t.Errorf("env scorer = %v, %v", sc, ok)
	}
	sc, ok = ScorerFromEnv("flag.sh --x")
	if !ok || strings.Join(sc.Argv, " ") != "flag.sh --x" {
		t.Errorf("flag must win over the environment: %v, %v", sc, ok)
	}
	if sc.Timeout <= 0 {
		t.Error("a default timeout must be set")
	}
}

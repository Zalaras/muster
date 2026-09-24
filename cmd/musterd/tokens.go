package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Zalaras/muster/internal/store"
)

// bootstrapTokens loads the UI and ingest tokens from kv, generating and persisting them
// on first run (REQ-2).
func bootstrapTokens(ctx context.Context, st *store.Store) (uiToken, ingestToken string, err error) {
	uiToken, err = getOrCreateToken(ctx, st, "ui_token")
	if err != nil {
		return "", "", err
	}
	ingestToken, err = getOrCreateToken(ctx, st, "ingest_token")
	if err != nil {
		return "", "", err
	}
	return uiToken, ingestToken, nil
}

func getOrCreateToken(ctx context.Context, st *store.Store, key string) (string, error) {
	if value, ok, err := st.KVGet(ctx, key); err != nil {
		return "", fmt.Errorf("reading %s: %w", key, err)
	} else if ok {
		return value, nil
	}

	token, err := randomToken()
	if err != nil {
		return "", err
	}
	if err := st.KVSet(ctx, key, token); err != nil {
		return "", fmt.Errorf("persisting %s: %w", key, err)
	}
	return token, nil
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating random token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

type tokensFile struct {
	DashboardURL string `json:"dashboardUrl"`
	UIToken      string `json:"uiToken"`
	IngestToken  string `json:"ingestToken"`
}

// writeTokensFile writes <data-dir>/tokens.json (mode 0600) on every startup — the
// launcher/E2E handoff (REQ-3). Rewritten identically across restarts since the tokens
// themselves persist in kv.
func writeTokensFile(dataDir, dashboardURL, uiToken, ingestToken string) error {
	tf := tokensFile{
		DashboardURL: dashboardURL,
		UIToken:      uiToken,
		IngestToken:  ingestToken,
	}
	b, err := json.MarshalIndent(tf, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding tokens file: %w", err)
	}

	path := filepath.Join(dataDir, "tokens.json")
	if err := os.WriteFile(path, b, 0o600); err != nil {
		return fmt.Errorf("writing %s: %w", path, err)
	}
	// os.WriteFile only applies the mode to a newly-created file; force it on every
	// startup regardless (REQ-3: "mode 0600" is a standing property, not a one-time one).
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("chmod %s: %w", path, err)
	}
	return nil
}

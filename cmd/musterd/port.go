package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/rs/zerolog"

	"github.com/Zalaras/muster/internal/atomicfile"
)

const (
	defaultPort       = 8765
	defaultPortWord   = "default"
	savedPortFileName = "port"
)

type portFlag struct {
	value int
	given bool
}

type portChoice struct {
	listen    int
	offerSave bool
}

func portFromArg(arg *string) (portFlag, error) {
	if arg == nil {
		return portFlag{}, nil
	}
	value, err := parsePortFlag(*arg)
	if err != nil {
		return portFlag{}, err
	}
	return portFlag{value: value, given: true}, nil
}

func parsePortFlag(s string) (int, error) {
	if s == defaultPortWord {
		return defaultPort, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 || n > 65535 {
		return 0, fmt.Errorf("invalid -port value %q: must be a number from 0 to 65535, or %q", s, defaultPortWord)
	}
	return n, nil
}

func savedPortPath(dataDir string) string {
	return filepath.Join(dataDir, savedPortFileName)
}

func loadSavedPort(dataDir string) (port int, ok bool, err error) {
	path := savedPortPath(dataDir)
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, fmt.Errorf("reading saved port %s: %w", path, err)
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil || n < 1 || n > 65535 {
		return 0, false, fmt.Errorf("saved port file %s does not hold a port from 1 to 65535", path)
	}
	return n, true, nil
}

func resolvePort(flagPort portFlag, dataDir string) (portChoice, error) {
	saved, hasSaved, loadErr := loadSavedPort(dataDir)
	if !flagPort.given {
		if loadErr != nil {
			return portChoice{}, fmt.Errorf("%w; delete it, or start with -port %s to override it", loadErr, defaultPortWord)
		}
		if hasSaved {
			return portChoice{listen: saved}, nil
		}
		return portChoice{listen: defaultPort}, nil
	}

	baseline := defaultPort
	if hasSaved {
		baseline = saved
	}
	offer := flagPort.value != 0 && (loadErr != nil || flagPort.value != baseline)
	return portChoice{listen: flagPort.value, offerSave: offer}, nil
}

func savePort(dataDir string, port int) error {
	path := savedPortPath(dataDir)
	if port == defaultPort {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("clearing saved port %s: %w", path, err)
		}
		return nil
	}
	if err := atomicfile.Write(path, []byte(strconv.Itoa(port)+"\n"), 0o600); err != nil {
		return fmt.Errorf("saving port to %s: %w", path, err)
	}
	return nil
}

func maybeOfferSavePort(ctx context.Context, f *cliFlags, in *lineInput, restarted bool, serving *servingEnv, stderr io.Writer, log zerolog.Logger) (stop func()) {
	if !serving.offerSavePort || restarted || !in.tty {
		return func() {}
	}
	promptCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		defer close(done)
		offerSavePort(promptCtx, in, stderr, f.dataDir, serving.port, log)
	}()
	return func() {
		cancel()
		<-done
	}
}

func offerSavePort(ctx context.Context, in *lineInput, stderr io.Writer, dataDir string, port int, log zerolog.Logger) {
	if !in.confirm(ctx, stderr, fmt.Sprintf("Save port %d for future starts? [y/N] ", port)) {
		return
	}

	if err := savePort(dataDir, port); err != nil {
		log.Warn().Err(err).Msg("port not saved")
		return
	}
	if port == defaultPort {
		log.Info().Int("port", port).Msg("saved port cleared; future starts use the default")
		return
	}
	log.Info().Int("port", port).Msg("port saved for future starts")
}

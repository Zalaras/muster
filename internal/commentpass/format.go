package commentpass

import (
	"context"
	"fmt"
	"go/format"
	"path/filepath"
	"strings"
)

// formatGo is gofmt in process: the same go/printer path golangci-lint's gofmt check
// enforces, so a lint-clean file is a fixed point.
func formatGo(src []byte) ([]byte, error) { return format.Source(src) }

// npxBiome runs the repo's formatter over repo-relative web/src files, from web/ so
// web/biome.json applies.
func npxBiome(ctx context.Context, root string, rels []string) error {
	if len(rels) == 0 {
		return nil
	}
	args := []string{"biome", "format", "--write"}
	for _, r := range rels {
		args = append(args, strings.TrimPrefix(r, "web/"))
	}
	_, stderr, err := realRun(ctx, filepath.Join(root, "web"), "npx", args...)
	if err != nil {
		return fmt.Errorf("biome format: %w: %s", err, strings.TrimSpace(string(stderr)))
	}
	return nil
}

package locate

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildQuery(t *testing.T) {
	tests := []struct {
		name     string
		fileName string
		size     int64
		want     string
	}{
		{
			name:     "plain name",
			fileName: "screenshot.png",
			size:     12345,
			want:     `kMDItemFSName == 'screenshot.png' && kMDItemFSSize == 12345`,
		},
		{
			name:     "D10: embedded single quote is escaped",
			fileName: "it's.png",
			size:     12,
			want:     `kMDItemFSName == 'it\'s.png' && kMDItemFSSize == 12`,
		},
		{
			name:     "multiple embedded quotes all escaped",
			fileName: "it's a 'test'.txt",
			size:     0,
			want:     `kMDItemFSName == 'it\'s a \'test\'.txt' && kMDItemFSSize == 0`,
		},
		{
			// Review Minor 5: the previous fixture ("Bildschirmfoto.png") is pure ASCII
			// and duplicated the plain-name case above without exercising anything about
			// non-ASCII handling. This name carries a genuine multi-byte UTF-8 character
			// (an emoji, per the plan's own edge case 14 example) to prove BuildQuery
			// passes non-ASCII bytes through untouched rather than escaping or mangling
			// them.
			name:     "non-ASCII name is passed through unescaped",
			fileName: "Bildschirmfoto 📸.png",
			size:     42,
			want:     `kMDItemFSName == 'Bildschirmfoto 📸.png' && kMDItemFSSize == 42`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, BuildQuery(tt.fileName, tt.size))
		})
	}
}

func TestSpotlightFinder_Find_NoCandidatesNoErrorWhenMdfindAbsent(t *testing.T) {
	f := &SpotlightFinder{
		timeout:  time.Second,
		lookPath: func(string) (string, error) { return "", errors.New("not found in PATH") },
		run: func(context.Context, string, ...string) ([]byte, error) {
			t.Fatal("run must not be called when mdfind is not on PATH")
			return nil, nil
		},
	}

	candidates, err := f.Find(context.Background(), "/some/dir", "name.txt", 10)

	require.NoError(t, err)
	assert.Nil(t, candidates)
}

func TestSpotlightFinder_Find_NoCandidatesNoErrorWhenRunFails(t *testing.T) {
	// D11: any failure from mdfind itself — timeout, non-zero exit, killed — degrades
	// to (nil, nil); only the walk finder's own errors are real errors.
	f := &SpotlightFinder{
		timeout:  time.Second,
		lookPath: func(string) (string, error) { return "/usr/bin/mdfind", nil },
		run: func(context.Context, string, ...string) ([]byte, error) {
			return nil, context.DeadlineExceeded
		},
	}

	candidates, err := f.Find(context.Background(), "/some/dir", "name.txt", 10)

	require.NoError(t, err)
	assert.Nil(t, candidates)
}

func TestSpotlightFinder_Find_TimesOutAndDegradesRatherThanBlocking(t *testing.T) {
	f := &SpotlightFinder{
		timeout:  5 * time.Millisecond,
		lookPath: func(string) (string, error) { return "/usr/bin/mdfind", nil },
		run: func(ctx context.Context, _ string, _ ...string) ([]byte, error) {
			<-ctx.Done() // block until the timeout context fires
			return nil, ctx.Err()
		},
	}

	start := time.Now()
	candidates, err := f.Find(context.Background(), "/some/dir", "name.txt", 10)
	elapsed := time.Since(start)

	require.NoError(t, err)
	assert.Nil(t, candidates)
	assert.Less(t, elapsed, time.Second, "Find must return once its own timeout fires, not hang")
}

func TestSpotlightFinder_Find_ParsesOneCandidatePerLineAndSkipsBlankLines(t *testing.T) {
	f := &SpotlightFinder{
		timeout:  time.Second,
		lookPath: func(string) (string, error) { return "/usr/bin/mdfind", nil },
		run: func(context.Context, string, ...string) ([]byte, error) {
			return []byte("/Users/damian/Desktop/a.png\n/Users/damian/Downloads/a.png\n\n"), nil
		},
	}

	candidates, err := f.Find(context.Background(), "/some/dir", "a.png", 10)

	require.NoError(t, err)
	assert.Equal(t, []string{"/Users/damian/Desktop/a.png", "/Users/damian/Downloads/a.png"}, candidates)
}

func TestSpotlightFinder_Find_NoOutputYieldsNoCandidates(t *testing.T) {
	f := &SpotlightFinder{
		timeout:  time.Second,
		lookPath: func(string) (string, error) { return "/usr/bin/mdfind", nil },
		run: func(context.Context, string, ...string) ([]byte, error) {
			return []byte(""), nil
		},
	}

	candidates, err := f.Find(context.Background(), "/some/dir", "a.png", 10)

	require.NoError(t, err)
	assert.Nil(t, candidates)
}

func TestSpotlightFinder_Find_UsesBuildQueryAsTheSoleArgument(t *testing.T) {
	var gotArgs []string
	f := &SpotlightFinder{
		timeout:  time.Second,
		lookPath: func(string) (string, error) { return "/usr/bin/mdfind", nil },
		run: func(_ context.Context, name string, args ...string) ([]byte, error) {
			assert.Equal(t, "mdfind", name)
			gotArgs = args
			return nil, nil
		},
	}

	_, err := f.Find(context.Background(), "/some/dir", "it's.png", 12)

	require.NoError(t, err)
	require.Len(t, gotArgs, 1)
	assert.Equal(t, BuildQuery("it's.png", 12), gotArgs[0])
}

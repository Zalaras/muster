package tmuxtest

import (
	"context"
	"os/exec"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// maxSunPathLen is AF_UNIX's sun_path limit on macOS (Socket's own doc comment) — the
// bound this test proves Socket stays under regardless of the calling test's own name.
const maxSunPathLen = 104

// TestSocket_StaysUnderSunPathLimitEvenForAVeryLongTestName covers D5: a t.TempDir()
// path is rooted under the calling (sub)test's full name, which is exactly what would
// overflow sun_path for a name this long — Socket must not inherit that property.
func TestSocket_StaysUnderSunPathLimitEvenForAVeryLongTestName(t *testing.T) {
	// A name deliberately far longer than sun_path's own ~104-byte budget once nested
	// under a parent test and given a "/tmux.sock" suffix — t.TempDir() would overflow
	// here; Socket must not.
	t.Run("ThisSubtestNameIsDeliberatelyVeryLongToProbeTheAFUNIXSunPathLimitOnMacOSWhichIsExactlyWhatTTempDirWouldOverflowIfSocketUsedItInstead", func(t *testing.T) {
		socket := Socket(t)

		assert.Less(t, len(socket), maxSunPathLen, "D5: the socket path must stay under AF_UNIX's sun_path limit regardless of the test's own name length")

		// D5 in practice, not just in byte-count: a real tmux command must actually be
		// able to bind this exact path, not merely satisfy the length check.
		out, err := exec.CommandContext(context.Background(), "tmux", "-S", socket, "new-session", "-d", "-s", "tmuxtest-probe").CombinedOutput()
		require.NoError(t, err, "tmux must be able to create a session on this socket: %s", out)
	})
}

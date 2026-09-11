package selfupdate

import (
	"crypto/sha256"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testChecksumsFile = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  musterd_0.11.0_darwin_arm64.tar.gz\n" +
	"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  musterd_0.11.0_darwin_amd64.tar.gz\n"

// TestVerifyChecksums_AcceptsBothSignatureModes covers D10's accepted half: a valid
// legacy ("Ed") and a valid prehashed ("ED") signature both verify transparently through
// one call, with no branching needed by the caller (REQ-15).
func TestVerifyChecksums_AcceptsBothSignatureModes(t *testing.T) {
	key := newTestKeypair(t)
	checksums := []byte(testChecksumsFile)

	t.Run("legacy Ed mode", func(t *testing.T) {
		sig := key.signLegacy(checksums)
		assert.NoError(t, VerifyChecksums(key.pubFile, checksums, sig))
	})

	t.Run("prehashed ED mode", func(t *testing.T) {
		sig := key.signPrehashed(checksums)
		assert.NoError(t, VerifyChecksums(key.pubFile, checksums, sig))
	})
}

// TestVerifyChecksums_Refusals covers D10's refusal half: a tampered file, a foreign
// key, and a truncated signature must all refuse with ErrBadSignature (or an error at
// least, for the malformed-input case) — never silently accept.
func TestVerifyChecksums_Refusals(t *testing.T) {
	key := newTestKeypair(t)
	checksums := []byte(testChecksumsFile)

	t.Run("tampered checksums file no longer verifies", func(t *testing.T) {
		sig := key.signLegacy(checksums)
		tampered := []byte(testChecksumsFile + "extra line that was never signed\n")

		err := VerifyChecksums(key.pubFile, tampered, sig)

		assert.ErrorIs(t, err, ErrBadSignature)
	})

	t.Run("signature from a foreign key does not verify", func(t *testing.T) {
		foreign := newTestKeypair(t)
		sig := foreign.signLegacy(checksums)

		err := VerifyChecksums(key.pubFile, checksums, sig)

		assert.ErrorIs(t, err, ErrBadSignature)
	})

	t.Run("truncated signature refuses rather than panicking", func(t *testing.T) {
		sig := key.signLegacy(checksums)
		truncated := sig[:len(sig)/2]

		err := VerifyChecksums(key.pubFile, checksums, truncated)

		assert.Error(t, err)
	})

	t.Run("malformed public key file refuses", func(t *testing.T) {
		sig := key.signLegacy(checksums)

		err := VerifyChecksums([]byte("not a minisign public key"), checksums, sig)

		assert.Error(t, err)
	})
}

// TestChecksumFor_ExtractsTheRecordedHash covers ChecksumFor's happy path: the recorded
// hex digest for the named asset, decoded into raw bytes, matched by exact basename.
func TestChecksumFor_ExtractsTheRecordedHash(t *testing.T) {
	got, err := ChecksumFor([]byte(testChecksumsFile), "musterd_0.11.0_darwin_arm64.tar.gz")

	require.NoError(t, err)
	want := [32]byte{}
	for i := range want {
		want[i] = 0xaa
	}
	assert.Equal(t, want, got)
}

// TestChecksumFor_OneOrTwoSpacesBothAccepted covers the plan's carried-over measurement:
// strings.Fields splits on any run of whitespace, so both GoReleaser's own two-space
// format and a hand-edited one-space line parse identically.
func TestChecksumFor_OneOrTwoSpacesBothAccepted(t *testing.T) {
	oneSpace := strings.Repeat("cc", 32) + " musterd_0.11.0_darwin_arm64.tar.gz\n"

	got, err := ChecksumFor([]byte(oneSpace), "musterd_0.11.0_darwin_arm64.tar.gz")

	require.NoError(t, err)
	want := [32]byte{}
	for i := range want {
		want[i] = 0xcc
	}
	assert.Equal(t, want, got)
}

// TestChecksumFor_NoLineForAssetIsErrNoChecksumLine covers D10/REQ-17's missing-line
// refusal (edge case 17): checksums.txt verifies fine but has no entry for this
// platform's asset.
func TestChecksumFor_NoLineForAssetIsErrNoChecksumLine(t *testing.T) {
	_, err := ChecksumFor([]byte(testChecksumsFile), "musterd_0.11.0_linux_amd64.tar.gz")

	assert.ErrorIs(t, err, ErrNoChecksumLine)
}

// TestChecksumFor_MalformedHexHashIsAnError covers a corrupt (but line-shaped) entry: a
// hash that isn't valid hex, or isn't 32 bytes decoded, must error rather than silently
// returning a zero/partial checksum a caller could mistake for a real match.
func TestChecksumFor_MalformedHexHashIsAnError(t *testing.T) {
	tests := []struct {
		name string
		line string
	}{
		{"not hex at all", "not-hex-at-all  musterd_0.11.0_darwin_arm64.tar.gz\n"},
		{"too short to be a sha256", "aabb  musterd_0.11.0_darwin_arm64.tar.gz\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := ChecksumFor([]byte(tt.line), "musterd_0.11.0_darwin_arm64.tar.gz")
			assert.Error(t, err)
		})
	}
}

// TestSHA256Of covers SHA256Of against the stdlib's own sha256.Sum256 directly — pinning
// it to the standard algorithm rather than merely "returns something 32 bytes long", and
// asserting it's deterministic and sensitive to every byte of input.
func TestSHA256Of(t *testing.T) {
	data := []byte("hello, muster")
	assert.Equal(t, sha256.Sum256(data), SHA256Of(data))
	assert.NotEqual(t, SHA256Of(data), SHA256Of([]byte("hello, musterX")))
}

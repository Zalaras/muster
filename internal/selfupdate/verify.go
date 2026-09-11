package selfupdate

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"aead.dev/minisign"
)

// ErrBadSignature, ErrChecksumMismatch and ErrNoChecksumLine are VerifyChecksums'/
// ChecksumFor's sentinel refusals (REQ-15/16/17) — every message doubles as the UI
// status line's failure text (Text rules: "Update failed: <error>"), so each names both
// the fact and the remedy in one sentence.
var (
	ErrBadSignature     = errors.New("signature on checksums.txt did not verify — the release may be tampered with; nothing was installed")
	ErrChecksumMismatch = errors.New("downloaded archive's checksum does not match the signed checksums.txt; nothing was installed")
	ErrNoChecksumLine   = errors.New("checksums.txt has no line for this platform's asset; nothing was installed")
)

// VerifyChecksums verifies minisig (a checksums.txt.minisig file's raw bytes) as a
// signature over checksums (checksums.txt's raw bytes), against pubKey (a compiled-in
// minisign public key file's raw bytes). Both minisign signature modes verify
// transparently through the one call: minisign.Verify re-hashes the message with
// BLAKE2b-512 internally whenever the parsed signature's algorithm says prehashed
// (`ED`), and compares directly for the legacy `Ed` mode — REQ-15's "both modes
// accepted" needs no branching here.
func VerifyChecksums(pubKey, checksums, minisig []byte) error {
	var key minisign.PublicKey
	if err := key.UnmarshalText(pubKey); err != nil {
		return fmt.Errorf("parsing embedded minisign public key: %w", err)
	}
	if !minisign.Verify(key, checksums, minisig) {
		return ErrBadSignature
	}
	return nil
}

// ChecksumFor returns the SHA-256 recorded in an already-verified checksums.txt for
// asset, matched by exact basename against GoReleaser's "<hex>  <asset>" lines — one or
// two spaces both accepted, since strings.Fields splits on any run of whitespace (plan's
// carried-over measurement).
func ChecksumFor(checksums []byte, asset string) ([32]byte, error) {
	var zero [32]byte
	for _, line := range strings.Split(string(checksums), "\n") {
		fields := strings.Fields(line)
		if len(fields) != 2 || fields[1] != asset {
			continue
		}
		raw, err := hex.DecodeString(fields[0])
		if err != nil || len(raw) != sha256.Size {
			return zero, fmt.Errorf("checksums.txt has a malformed hash for %s", asset)
		}
		var sum [32]byte
		copy(sum[:], raw)
		return sum, nil
	}
	return zero, ErrNoChecksumLine
}

// SHA256Of hashes data — used to compare a downloaded archive against ChecksumFor's
// result before extraction (REQ-16).
func SHA256Of(data []byte) [32]byte {
	return sha256.Sum256(data)
}

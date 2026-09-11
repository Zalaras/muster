package selfupdate

import (
	"bytes"
	"io"
	"testing"

	"aead.dev/minisign"
	"github.com/stretchr/testify/require"
)

// testKeypair holds an in-process-generated minisign keypair plus its public key file's
// bytes (verify.go's pubKey argument shape) — daemon-tests never handles Damian's real
// private key (per the orchestrator's brief); every fixture here signs with a disposable
// keypair generated fresh per test.
type testKeypair struct {
	pub     minisign.PublicKey
	priv    minisign.PrivateKey
	pubFile []byte
}

// newTestKeypair generates a fresh Ed25519 minisign keypair and marshals the public half
// to the file format VerifyChecksums/PublicKey() expect.
func newTestKeypair(t *testing.T) testKeypair {
	t.Helper()
	pub, priv, err := minisign.GenerateKey(nil)
	require.NoError(t, err)
	pubFile, err := pub.MarshalText()
	require.NoError(t, err)
	return testKeypair{pub: pub, priv: priv, pubFile: pubFile}
}

// signLegacy signs message in minisign's legacy "Ed" mode (unhashed, minisign.Sign's own
// shape) — one of the two modes REQ-15 requires accepting.
func (k testKeypair) signLegacy(message []byte) []byte {
	return minisign.Sign(k.priv, message)
}

// signPrehashed signs message in minisign's prehashed "ED" mode (BLAKE2b-512 then
// Ed25519, via minisign.Reader — the shape a real `minisign -S` binary produces) — the
// other of the two modes REQ-15 requires accepting.
func (k testKeypair) signPrehashed(message []byte) []byte {
	r := minisign.NewReader(bytes.NewReader(message))
	_, _ = io.ReadAll(r) // drains the reader so its internal digest covers the whole message
	return r.Sign(k.priv)
}

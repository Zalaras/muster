package selfupdate

import _ "embed"

//go:embed minisign.pub
var embeddedPublicKey []byte

// PublicKey returns the compiled-in minisign public key file's raw bytes — the trust
// root every production verification uses (kb:adr/update-trust-root-minisign-signed-checksums).
// -update-public-key-file overrides this with
// a file's contents instead (a test seam: E2E signs with its own throwaway key;
// production always uses this embedded one).
func PublicKey() []byte {
	return embeddedPublicKey
}

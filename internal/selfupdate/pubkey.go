package selfupdate

import _ "embed"

//go:embed minisign.pub
var embeddedPublicKey []byte

// PublicKey returns the compiled-in minisign public key file's raw bytes — the trust
// root every production verification uses. -update-public-key-file overrides this with
// a file's contents instead (a test seam: E2E signs with its own throwaway key;
// production always uses this embedded one, REQ-15/REQ-23).
func PublicKey() []byte {
	return embeddedPublicKey
}

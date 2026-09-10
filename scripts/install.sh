#!/bin/sh
# Install a released musterd binary, verifying it against the release's published SHA-256.
#
# The front door for https://github.com/Zalaras/muster — README.md § Install. Only possible
# since the repo went public on 2026-09-10 (docs/go-public.md): while it was private neither
# the script fetch nor the asset download could be anonymous, which is why the by-hand
# fences this replaces all went through `gh release download`.
#
# Flags, env vars and defaults: `--help` (usage() below is their single source).
#
# Deliberate choices:
#   - POSIX sh, no bashisms: /bin/sh on macOS is bash 3.2 in POSIX mode.
#   - "latest" resolves through the /releases/latest redirect rather than the API.
#     Unauthenticated api.github.com allows 60 requests/hour per IP; the redirect is
#     unmetered. --version skips the resolution entirely.
#   - The archive's SHA-256 is checked against the release's own checksums.txt. GoReleaser
#     publishes it already, so verifying costs one small download — and an unverified
#     `curl | sh` is the standard criticism of this install shape.
#   - Downloads land in a fresh `mktemp -d`, which is not cosmetic. Issue #7 was a README
#     recipe that downloaded into the cwd: a re-run then needed --clobber, and last
#     version's archive stayed behind, so `musterd_*.tar.gz` matched several files and tar
#     was handed a list of archives plus a member name ("Not found in archive"). An empty
#     dir per run makes the glob single by construction.
#   - `tar ... musterd` selects the member on purpose: the archive also contains README.md
#     (.goreleaser.yaml archives.files).
#   - No sudo, and no confirmation prompt. Piped to sh, stdin *is* the script, so a prompt
#     would have to read /dev/tty for no benefit; an unwritable --bin-dir fails with the
#     remedy instead of escalating.
set -eu

REPO="Zalaras/muster"
BASE_URL="${MUSTER_BASE_URL:-https://github.com/$REPO/releases}"
BIN_DIR="${MUSTER_BIN_DIR:-$HOME/.local/bin}"
VERSION="${MUSTER_VERSION:-latest}"
ARCH="${MUSTER_ARCH:-}"

die() { printf 'install: %s\n' "$*" >&2; exit 1; }

# A heredoc rather than self-parsing the header: piped to sh, "$0" is not this script, so
# reading it printed nothing on the first --help run (measured 2026-09-10).
usage() {
  cat <<'USAGE'
Install a released musterd into ~/.local/bin, verified against its published SHA-256.

  curl -fsSL https://raw.githubusercontent.com/Zalaras/muster/main/scripts/install.sh | sh
  sh scripts/install.sh [--version vX.Y.Z] [--bin-dir DIR] [--arch amd64|arm64]

  --version vX.Y.Z   release tag to install (default: latest)   env MUSTER_VERSION
  --bin-dir DIR      where musterd lands (default ~/.local/bin) env MUSTER_BIN_DIR
  --arch amd64|arm64 override uname -m detection                env MUSTER_ARCH
  --base-url URL     releases base URL, for testing             env MUSTER_BASE_URL
  --help             print this and exit

Flags win over the env vars. Full notes: README.md § Install.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)   VERSION="${2:?--version needs a tag}"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    --bin-dir)   BIN_DIR="${2:?--bin-dir needs a directory}"; shift 2 ;;
    --bin-dir=*) BIN_DIR="${1#*=}"; shift ;;
    --arch)      ARCH="${2:?--arch needs amd64 or arm64}"; shift 2 ;;
    --arch=*)    ARCH="${1#*=}"; shift ;;
    --base-url)  BASE_URL="${2:?--base-url needs a URL}"; shift 2 ;;
    --base-url=*) BASE_URL="${1#*=}"; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           die "unknown option: $1 (try --help)" ;;
  esac
done

command -v curl >/dev/null   || die "curl not found, and it is how this script downloads"
command -v shasum >/dev/null || die "shasum not found, and it is how the download is verified"

# ---- platform -------------------------------------------------------------------------
os="$(uname -s)"
[ "$os" = Darwin ] || die "Muster is macOS-only; uname -s reports $os (SPEC.md)"

if [ -z "$ARCH" ]; then
  machine="$(uname -m)"
  case "$machine" in
    x86_64)        ARCH=amd64 ;;
    arm64|aarch64) ARCH=arm64 ;;
    *)             die "unsupported architecture $machine; releases ship darwin amd64 and arm64 only" ;;
  esac
fi
case "$ARCH" in
  amd64|arm64) ;;
  *) die "--arch must be amd64 or arm64, got $ARCH" ;;
esac

# ---- resolve the release ---------------------------------------------------------------
if [ "$VERSION" = latest ]; then
  resolved="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$BASE_URL/latest")" ||
    die "could not reach $BASE_URL/latest — check your connection, or pass --version"
  TAG="${resolved##*/}"
  case "$TAG" in
    v[0-9]*) ;;
    *) die "expected $BASE_URL/latest to redirect to a version tag, got '$resolved'" ;;
  esac
else
  TAG="$VERSION"
fi

asset="musterd_${TAG#v}_darwin_${ARCH}.tar.gz"
download="$BASE_URL/download/$TAG"

# ---- destination, before spending a download on it -------------------------------------
mkdir -p "$BIN_DIR" || die "cannot create $BIN_DIR"
[ -w "$BIN_DIR" ] || die "$BIN_DIR is not writable — pass --bin-dir DIR for somewhere you own"

# ---- download and verify ---------------------------------------------------------------
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

printf 'fetching %s %s\n' "$TAG" "$asset"
curl -fsSL -o "$tmp/$asset" "$download/$asset" ||
  die "could not download $asset (curl's reason above) — $BASE_URL/tag/$TAG lists what release $TAG publishes"
curl -fsSL -o "$tmp/checksums.txt" "$download/checksums.txt" ||
  die "release $TAG publishes no checksums.txt, so the download cannot be verified"

if ! grep " $asset\$" "$tmp/checksums.txt" > "$tmp/want.txt"; then
  die "checksums.txt for $TAG carries no line for $asset"
fi
( cd "$tmp" && shasum -a 256 -c want.txt >/dev/null ) ||
  die "SHA-256 mismatch on $asset — the download is corrupt or tampered with; do not use it"
printf 'verified %s\n' "$(cut -c1-16 < "$tmp/want.txt")..."

# ---- install ----------------------------------------------------------------------------
tar -xzf "$tmp/$asset" -C "$BIN_DIR" musterd

target="$BIN_DIR/musterd"
if [ "$ARCH" = "$(uname -m | sed 's/^x86_64$/amd64/; s/^aarch64$/arm64/')" ]; then
  printf 'installed %s (%s)\n' "$target" "$("$target" -version)"
else
  printf 'installed %s (built for darwin/%s, not this machine — not run)\n' "$target" "$ARCH"
fi

# ---- warn about the two ways the install can look like it did nothing --------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'warning: %s is not on your PATH, so `musterd` will not be found\n' "$BIN_DIR"
     printf '         add it to your shell profile, or re-run with --bin-dir on a PATH dir\n' ;;
esac

resolved_bin="$(command -v musterd || true)"
if [ -n "$resolved_bin" ] && [ "$resolved_bin" != "$target" ]; then
  printf "warning: 'musterd' on your PATH resolves to %s, not the copy just installed\n" "$resolved_bin"
  printf '         that older binary shadows this one - remove it, or install over it instead\n'
fi

// Fake GitHub Releases host for the auto-update plan (REQ-5/REQ-14/REQ-15/REQ-16),
// modelled on helpers/ghapi.ts's FakeGitHubAPI. musterd's `-update-base-url` points here
// instead of the real `github.com/Zalaras/muster/releases`, so no E2E run ever reaches
// the real host or a real GitHub rate limit (mirrors CLAUDE.md's "no real claude" hard
// rule, extended to a real GitHub Release). Every daemon this file's `publish()` targets
// verifies against an in-process Ed25519 keypair this server generates itself — never
// the real committed `internal/selfupdate/minisign.pub` (D5's production key, which no
// test may reference: this file's `writePublicKey()` is the ONLY public key any scratch
// daemon here is ever pointed at, via `-update-public-key-file`, plan REQ-15's test seam).
//
// Wire shapes: REQ-5 ("latest" is the last path segment of `{base}/latest`'s redirect
// `Location`, absolute or relative both accepted), REQ-14 (asset layout under
// `{base}/download/{tag}/`), REQ-16 (`checksums.txt`'s `<hex>  <asset>` two-space
// format, GoReleaser's own `checksum` artefact shape). The minisign byte layout below
// (Implementation Notes > Minisign) was cross-checked against a REAL `minisign` 0.12
// binary during authoring: a keypair and signature produced by this file's own Node
// `crypto` calls verify cleanly under `minisign -V`, and a byte flipped anywhere in the
// signed file makes that same real verifier refuse — so a daemon using
// `github.com/aead/minisign` (legacy `Ed` mode) has a genuine, not merely
// self-consistent, signature to check.
import { execFile } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign as ed25519Sign } from "node:crypto";
import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { KeyObject } from "node:crypto";

const execFileAsync = promisify(execFile);

/**
 * Maps this test process's own `process.arch` to the Go `runtime.GOARCH` string the
 * daemon under test resolves internally (there is no flag for it — REQ-14 says "for
 * `runtime.GOARCH`"). Both sides run on the SAME machine, so they must agree without
 * either hardcoding one. Extend the switch, don't hardcode a literal, if this ever runs
 * on a third architecture.
 */
export function goArch(): string {
  switch (process.arch) {
    case "arm64":
      return "arm64";
    case "x64":
      return "amd64";
    default:
      throw new Error(
        `goArch(): unmapped Node process.arch ${process.arch} — add a case before running here`,
      );
  }
}

/** GoReleaser's `name_template` (REQ-14): `musterd_<ver>_<os>_<arch>.tar.gz`, `<ver>`
 * bare (no leading "v"), `<os>` always "darwin" for this harness. */
export function archiveAssetName(version: string, arch: string, goos = "darwin"): string {
  return `musterd_${version}_${goos}_${arch}.tar.gz`;
}

interface MinisignKeypair {
  privateKey: KeyObject;
  keyId: Buffer;
  publicKeyBytes: Buffer;
}

function generateMinisignKeypair(): MinisignKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (jwk.x === undefined)
    throw new Error("generateMinisignKeypair(): could not export a raw Ed25519 public key");
  const publicKeyBytes = Buffer.from(jwk.x, "base64url");
  if (publicKeyBytes.length !== 32) {
    throw new Error(
      `generateMinisignKeypair(): unexpected public key length ${publicKeyBytes.length}`,
    );
  }
  return { privateKey, keyId: randomBytes(8), publicKeyBytes };
}

/** Minisign public-key-file format (Implementation Notes > Minisign): line 1 an
 * `untrusted comment:`, line 2 base64 of `"Ed"` (2) ‖ `key_id` (8) ‖ `pk` (32) = 42
 * raw bytes. */
function minisignPublicKeyFile(kp: MinisignKeypair): string {
  const raw = Buffer.concat([Buffer.from("Ed"), kp.keyId, kp.publicKeyBytes]);
  const keyIdHex = kp.keyId.toString("hex").toUpperCase();
  return `untrusted comment: minisign public key ${keyIdHex}\n${raw.toString("base64")}\n`;
}

/**
 * Minisign signature-file format, legacy `Ed` mode only (Implementation Notes >
 * Minisign: "the fake can use legacy `Ed` and skip BLAKE2b" — the prehashed `ED` path a
 * real `minisign -S` writes is exercised by D10's Go unit test, not here). Line 1
 * `untrusted comment:`; line 2 base64 of `alg`(2, literal `"Ed"`) ‖ `key_id`(8) ‖
 * `sig`(64) where `sig` is Ed25519 over the raw file bytes; line 3 `trusted comment:
 * <text>`; line 4 base64 of Ed25519 over `sig` ‖ the trusted comment's TEXT bytes
 * (confirmed against a real minisign-produced file during authoring: the global
 * signature covers the text after "trusted comment: ", not the whole line).
 */
function minisignSign(kp: MinisignKeypair, data: Buffer, trustedComment: string): string {
  const sig = ed25519Sign(null, data, kp.privateKey);
  const sigRaw = Buffer.concat([Buffer.from("Ed"), kp.keyId, sig]);
  const globalSig = ed25519Sign(
    null,
    Buffer.concat([sig, Buffer.from(trustedComment, "utf-8")]),
    kp.privateKey,
  );
  return (
    `untrusted comment: signature from minisign secret key\n${sigRaw.toString("base64")}\n` +
    `trusted comment: ${trustedComment}\n${globalSig.toString("base64")}\n`
  );
}

/** Builds `musterd_<ver>_<os>_<arch>.tar.gz` containing `binaryPath`'s bytes as
 * `musterd` (mode 0755) plus a `README.md` (REQ-14/plan Affected Files) — shells out to
 * the system `tar` (BSD tar on every macOS runner this harness targets) rather than
 * adding a tar dependency for one fixture builder. */
async function buildTarGz(binaryPath: string): Promise<Buffer> {
  const stageDir = await mkdtemp(join(tmpdir(), "muster-e2e-release-"));
  try {
    const stagedBin = join(stageDir, "musterd");
    await copyFile(binaryPath, stagedBin);
    await chmod(stagedBin, 0o755);
    await writeFile(
      join(stageDir, "README.md"),
      "Muster e2e fixture release archive. Not the real README.\n",
      "utf-8",
    );
    const dest = join(stageDir, "out.tar.gz");
    await execFileAsync("tar", ["-czf", dest, "-C", stageDir, "musterd", "README.md"]);
    return await readFile(dest);
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

export interface PublishOptions {
  /** Release tag, e.g. `"v0.2.0"` — the `{base}/tag/<tag>` `setLatest()` points at and
   * the `{base}/download/<tag>/...` prefix every asset is served under. */
  tag: string;
  /** A real, already-built `musterd` binary (`helpers/daemon.ts`'s
   * `buildVersionedMusterd`) — packaged verbatim as the archive's `musterd` member, so a
   * genuine `-version`/SHA-256 oracle exists after a test drives an apply. */
  binaryPath: string;
  /** Go arch string for the asset name (REQ-14's `runtime.GOARCH`). Defaults to this
   * machine's own (`goArch()`) — the daemon under test resolves the SAME machine's
   * arch, so the two must agree without either side hardcoding one. */
  arch?: string;
}

export type TamperKind = "checksums" | "missing-minisig" | "foreign-key" | "sha-mismatch";

interface PublishedRelease {
  version: string;
  assetName: string;
  archiveBytes: Buffer;
  checksumsBytes: Buffer;
  minisigBytes: Buffer;
  minisigMissing: boolean;
}

/**
 * A fake GitHub Releases host. `/latest` (any method — the real daemon issues HEAD,
 * `scripts/install.sh` issues `curl -I`) 302s to `{self}/tag/<tag>` per `setLatest()`;
 * `/download/<tag>/<asset>` serves whatever `publish()` built for that tag. Every
 * request is counted by its exact path (`requestCount`), so a test can prove a check
 * never fired (E2/E8) or fired exactly once (E3/E11/E15).
 */
export class FakeReleaseServer {
  private readonly server: Server;
  port = 0;
  private readonly keypair = generateMinisignKeypair();
  private latestTag: string | undefined;
  private readonly releases = new Map<string, PublishedRelease>();
  private readonly counts = new Map<string, number>();
  private held = false;
  private pending: Array<() => void> = [];

  private constructor(server: Server) {
    this.server = server;
  }

  static async start(): Promise<FakeReleaseServer> {
    return await new Promise((resolvePromise, reject) => {
      const server = createServer();
      const fake = new FakeReleaseServer(server);
      server.on("request", (req, res) => fake.handle(req, res));
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          fake.port = address.port;
          resolvePromise(fake);
        } else {
          reject(new Error("FakeReleaseServer could not bind a port"));
        }
      });
    });
  }

  get baseURL(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Sets which tag `{base}/latest` redirects to (REQ-5). Call after `publish(tag)` so
   * the redirect always names a release this server can actually serve assets for. */
  setLatest(tag: string): void {
    this.latestTag = tag;
  }

  /** Requests recorded against an exact request path (e.g. `"/latest"`, or
   * `` `/download/${tag}/${asset}` ``) — E2/E3/E8/E11/E15's request-count oracle. Never
   * matched by substring, so a caller must spell the full path. */
  requestCount(path: string): number {
    return this.counts.get(path) ?? 0;
  }

  /** Holds every subsequent request open (no response sent) until `release()` —
   * deterministic phase observation (E4) and the concurrent-apply fixture (E11).
   * Mirrors `FakeGitHubAPI.hold()`/`FakeUsageAPI.hold()`. */
  hold(): void {
    this.held = true;
  }

  /** Releases every currently-held request (answered from whatever state exists at
   * release time) and stops holding future ones. */
  release(): void {
    this.held = false;
    const waiting = this.pending;
    this.pending = [];
    for (const respond of waiting) respond();
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    this.counts.set(path, (this.counts.get(path) ?? 0) + 1);
    const respond = (): void => {
      this.route(path, res);
    };
    if (this.held) {
      this.pending.push(respond);
      return;
    }
    respond();
  }

  private route(path: string, res: ServerResponse): void {
    if (path === "/latest") {
      if (this.latestTag === undefined) {
        res.writeHead(404);
        res.end();
        return;
      }
      // REQ-5: absolute-or-relative Location both parse to the last path segment — an
      // absolute Location (this server's own baseURL) exercises that branch for real,
      // matching the real GitHub host's own absolute redirect.
      res.writeHead(302, { Location: `${this.baseURL}/tag/${this.latestTag}` });
      res.end();
      return;
    }
    const m = /^\/download\/([^/]+)\/(.+)$/.exec(path);
    if (m) {
      const tag = m[1];
      const asset = m[2];
      const release = tag !== undefined ? this.releases.get(tag) : undefined;
      if (!release || asset === undefined) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (asset === release.assetName) {
        res.writeHead(200, { "Content-Type": "application/gzip" });
        res.end(release.archiveBytes);
        return;
      }
      if (asset === "checksums.txt") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(release.checksumsBytes);
        return;
      }
      if (asset === "checksums.txt.minisig") {
        if (release.minisigMissing) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(release.minisigBytes);
        return;
      }
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  }

  /** Writes this server's own minisign public key file — the ONLY key any daemon this
   * file starts should be pointed at (`-update-public-key-file`, REQ-15's test seam).
   * Never the real committed `internal/selfupdate/minisign.pub`. */
  async writePublicKey(path: string): Promise<void> {
    await writeFile(path, minisignPublicKeyFile(this.keypair), "utf-8");
  }

  /**
   * Builds and publishes one release for `opts.tag`: the archive, a `checksums.txt`
   * with the archive's real SHA-256 (`<hex>  <asset>`, REQ-16), and a
   * `checksums.txt.minisig` signed in legacy `Ed` mode with this server's own keypair.
   * The trusted comment mirrors GoReleaser's own `signs:` args (Implementation Notes:
   * `-t "muster {{ .Version }}"`).
   */
  async publish(opts: PublishOptions): Promise<{ assetName: string; archiveSha256: string }> {
    const arch = opts.arch ?? goArch();
    const version = opts.tag.replace(/^v/, "");
    const assetName = archiveAssetName(version, arch);
    const archiveBytes = await buildTarGz(opts.binaryPath);
    const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
    const checksumsBytes = Buffer.from(`${archiveSha256}  ${assetName}\n`, "utf-8");
    const trustedComment = `muster ${version}`;
    const minisigBytes = Buffer.from(
      minisignSign(this.keypair, checksumsBytes, trustedComment),
      "utf-8",
    );
    this.releases.set(opts.tag, {
      version,
      assetName,
      archiveBytes,
      checksumsBytes,
      minisigBytes,
      minisigMissing: false,
    });
    return { assetName, archiveSha256 };
  }

  /**
   * Corrupts an already-`publish()`ed release in place, for E7's four refusal
   * fixtures — each leaves every OTHER file exactly as `publish()` left it, so only the
   * named check fails:
   *  - `"checksums"`: flips a byte in `checksums.txt` after it was signed, so the
   *    (untouched) signature no longer verifies against the (changed) content — REQ-15.
   *  - `"missing-minisig"`: `checksums.txt.minisig` 404s from then on — REQ-24.
   *  - `"foreign-key"`: re-signs the SAME `checksums.txt` bytes with a fresh, unrelated
   *    keypair — internally well-formed, but not the key in the daemon's
   *    `-update-public-key-file` — REQ-15.
   *  - `"sha-mismatch"`: appends a byte to the archive after `checksums.txt` was
   *    computed, so the archive's real SHA-256 no longer matches the (validly signed)
   *    line — REQ-16.
   */
  tamper(tag: string, kind: TamperKind): void {
    const release = this.releases.get(tag);
    if (!release) throw new Error(`tamper(): no release published for tag ${tag}`);
    switch (kind) {
      case "checksums": {
        const mutated = Buffer.from(release.checksumsBytes);
        mutated[0] = (mutated[0] ?? 0) ^ 0xff;
        release.checksumsBytes = mutated;
        return;
      }
      case "missing-minisig": {
        release.minisigMissing = true;
        return;
      }
      case "foreign-key": {
        const foreign = generateMinisignKeypair();
        const trustedComment = `muster ${release.version}`;
        release.minisigBytes = Buffer.from(
          minisignSign(foreign, release.checksumsBytes, trustedComment),
          "utf-8",
        );
        return;
      }
      case "sha-mismatch": {
        release.archiveBytes = Buffer.concat([release.archiveBytes, Buffer.from("tampered")]);
        return;
      }
    }
  }

  /** Releases any still-held requests (so client sockets don't linger) and closes the
   * server. */
  async stop(): Promise<void> {
    this.release();
    await new Promise<void>((resolvePromise) => this.server.close(() => resolvePromise()));
  }
}

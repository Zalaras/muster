.DEFAULT_GOAL := help
SHELL := /bin/bash

BIN     := bin/musterd
PKG     := ./...
# The machine-wide gate lock (tools/gatelock): a Playwright sweep needs the machine to itself,
# unit-test runs may overlap each other but never a sweep (kb:lesson/concurrent-e2e-across-worktrees-goes-red).
# A busy lock waits (default 240 s), naming its holder; nested calls under a holder no-op.
# Built, never `go run`: go run exits 1 for any non-zero program exit, which would mask the
# child's code and the tool's own 75 (busy).
GATELOCK := bin/gatelock
$(GATELOCK): $(wildcard tools/gatelock/*.go)
	go build -o $@ ./tools/gatelock
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build the daemon into ./bin/musterd
	go build -ldflags "-X main.version=$(VERSION)" -o $(BIN) ./cmd/musterd

.PHONY: test
test: $(GATELOCK) ## Run unit tests (uncached — every gate must be a fresh run; shared gate lock)
	$(GATELOCK) run --shared -- go test -count=1 $(PKG)

.PHONY: test-race
test-race: $(GATELOCK) ## Unit tests under the race detector (~161 s vs ~94 s plain, measured 2026-09-26) — the gates run this; testers run the fast one
	$(GATELOCK) run --shared -- go test -race -count=1 $(PKG)

.PHONY: lint
lint: ## Run golangci-lint
	golangci-lint run

.PHONY: fmt
fmt: ## Format Go sources
	golangci-lint fmt

.PHONY: tidy
tidy: ## Tidy go.mod/go.sum
	go mod tidy

.PHONY: web
web: ## Frontend dev server
	cd web && npm run dev

.PHONY: web-build
web-build: ## Build the frontend into internal/webui/assets (embedded into the binary)
	cd web && npm run build

.PHONY: web-test
web-test: ## Frontend unit tests (Vitest)
	cd web && npm test

.PHONY: web-lint
web-lint: ## Biome lint + format check over web/src, web/e2e and web/scripts
	cd web && npm run -s lint

.PHONY: web-fmt
web-fmt: ## Apply Biome's formatting and safe fixes to web/ (the write half of web-lint)
	cd web && npm run -s lint:fix

.PHONY: contrast
contrast: ## Contrast/hue/literal gate over web/src/style.css (REQ-4, plan new-ui-design-colors)
	cd web && npm run contrast

.PHONY: e2e-lint
e2e-lint: ## Mechanical checks on web/e2e (fixtures only from helpers/fixtures.ts, no fixed sleeps)
	cd web && npm run -s e2e:lint

# e2e and e2e-soak take the exclusive gate lock around the build AND the sweep, so a build
# never rewrites the served bundle under a neighbour's run (kb:lesson/concurrent-build-invalidates-running-e2e).
# Order inside is load-bearing: web-build must produce fresh internal/webui/assets before
# build compiles them into the binary via go:embed, or the E2E-embedded spec (embedded.spec.ts)
# runs against stale assets (plan embed-dashboard Edge Case 3/8 — this repo never runs
# make -j, so make's serial default is what makes this ordering hold).
.PHONY: e2e
e2e: $(GATELOCK) ## Playwright E2E suite under the exclusive gate lock (builds first; runs e2e-lint via npm run e2e)
	$(GATELOCK) run --exclusive -- $(MAKE) web-build build e2e-run

.PHONY: e2e-run
e2e-run: ## The Playwright sweep alone, no build (make e2e runs this under the lock; globalSetup no-ops the nested lock)
	cd web && npm run e2e

# Proof for a flake fix, not a retry: every repetition must be green (retries stay 0 in
# playwright.config.ts). --repeat-each makes each repetition its own test entry, so copies
# of the same test run concurrently across the 4 workers — the load that widens races —
# each on its own scratch daemon. Usage: make e2e-soak SPEC=terminal.spec.ts N=20
N ?= 10
.PHONY: e2e-soak
e2e-soak: $(GATELOCK) ## Repeat one spec file N times in parallel to prove a flake fix (SPEC=<file>.spec.ts, N=10)
	@test -n "$(SPEC)" || { echo "usage: make e2e-soak SPEC=<file>.spec.ts [N=10]"; exit 2; }
	$(GATELOCK) run --exclusive -- $(MAKE) web-build build e2e-soak-run SPEC=$(SPEC) N=$(N)

.PHONY: e2e-soak-run
e2e-soak-run: ## The soak alone, no build (make e2e-soak runs this under the lock)
	cd web && npm run e2e -- $(SPEC) --repeat-each=$(N)

.PHONY: e2e-fixture-leak-check
e2e-fixture-leak-check: ## Self-test: a failed ScratchDaemon.start() leaves no process, tmux server or tmpdir behind (REQ-4/W1/W3, plan post-worktree-spike-issues)
	cd web && npm run -s e2e:fixture-leak-check

.PHONY: run
run: build web-build ## Run musterd against the real data dir, serving the disk override so the frontend dev loop needs no Go relink
	./$(BIN) -web-dist internal/webui/assets

.PHONY: canary
canary: $(GATELOCK) ## Drive the real claude (6 haiku turns incl. resume + zero-token unauth/fail-server/model/live checks), assert every field Muster depends on, then extend the verified range on a green run outside it; MUSTER_CANARY_OFFLINE=1 = compile + classify + static binary check only. Exclusive gate lock: a sweep beside it is the same hazard
	$(GATELOCK) run --exclusive -- go test -tags=canary -count=1 -timeout 25m -v ./test/canary/... && go run ./tools/versions bump

.PHONY: gen-versions
gen-versions: ## Regenerate the Claude Code version-range fragments in README.md and docs/claude-code-versions.md
	go run ./tools/versions gen

.PHONY: check-versions
check-versions: ## Fail if any Claude Code version-range fragment is stale (run by make check)
	go run ./tools/versions check

.PHONY: gen-kb
gen-kb: ## Regenerate the knowledge-base index files, per-feature contract slices, .claude/rules/*.md and CLAUDE.md kb fragments from record frontmatter
	go run ./tools/kb gen

.PHONY: check-kb
check-kb: ## Fail on a malformed record, an unresolved kb: citation, an unregistered feature, a stale or hand-edited generated kb file, or a budget breach (run by make check)
	go run ./tools/kb check

.PHONY: refs
refs: ## Every repo path, make target and musterd flag cited in docs or comments must exist (run by make check)
	python3 .claude/skills/orchestrate/scripts/dead-refs.py --all

.PHONY: size-warn
size-warn: ## Warn-only: long functions (funlen), duplicated blocks (dupl) and files over 500 lines, whole tree; never fails (the gates run it scoped to the branch)
	.claude/skills/orchestrate/scripts/size-warn.sh

.PHONY: check
check: lint test web-lint web-test contrast e2e-lint check-versions check-kb refs ## Lint + test + web-lint + web-test + contrast + e2e-lint + check-versions + check-kb + refs

.PHONY: hooks
hooks: ## Arm the commit-msg + pre-commit guards (.githooks/) and the blame-ignore list for this clone — docs/conventions.md § Commits
	git config core.hooksPath .githooks
	git config blame.ignoreRevsFile .git-blame-ignore-revs

# Wraps scripts/install.sh, which is also the curl | sh front door (README.md § Install),
# so the arch resolution, temp dir, tar member-select, SHA-256 check and shadow warning
# exist in exactly one place. MUSTER_BIN_DIR and MUSTER_VERSION pass through to it.
.PHONY: install
install: ## Install the latest released musterd into ~/.local/bin (MUSTER_BIN_DIR overrides)
	@sh scripts/install.sh

.PHONY: release-check
release-check: ## Validate .goreleaser.yaml and build a local snapshot release into ./dist
	goreleaser check
	# --skip=sign: a local snapshot has no MINISIGN_KEY_FILE/MINISIGN_PASSWORD (those are
	# CI secrets, plan auto-update, 2026-09-10) — signing only ever runs in release.yml.
	goreleaser release --snapshot --clean --skip=sign

.PHONY: clean
clean: ## Remove build output (preserves internal/webui/assets/.gitkeep so a post-clean build still embeds)
	# Historic: web/dist is pre-embed-dashboard's Vite output dir; stale checkouts may still have one.
	rm -rf bin web/dist dist
	find internal/webui/assets -mindepth 1 ! -name .gitkeep -delete

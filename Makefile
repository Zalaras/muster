.DEFAULT_GOAL := help
SHELL := /bin/bash

BIN     := bin/musterd
PKG     := ./...
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build the daemon into ./bin/musterd
	go build -ldflags "-X main.version=$(VERSION)" -o $(BIN) ./cmd/musterd

.PHONY: test
test: ## Run unit tests (uncached — every gate must be a fresh run)
	go test -count=1 $(PKG)

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

.PHONY: contrast
contrast: ## Contrast/hue/literal gate over web/src/style.css (REQ-4, plan new-ui-design-colors)
	cd web && npm run contrast

# Order is load-bearing: web-build must produce fresh internal/webui/assets before build
# compiles them into the binary via go:embed, or the E2E-embedded spec (embedded.spec.ts)
# runs against stale assets (plan embed-dashboard Edge Case 3/8 — this repo never runs
# make -j, so make's serial default is what makes this ordering hold).
.PHONY: e2e-lint
e2e-lint: ## Mechanical checks on web/e2e (fixtures only from helpers/fixtures.ts, no fixed sleeps)
	cd web && npm run -s e2e:lint

.PHONY: e2e
e2e: web-build build ## Playwright E2E suite (runs e2e-lint first via npm run e2e)
	cd web && npm run e2e

# Proof for a flake fix, not a retry: every repetition must be green (retries stay 0 in
# playwright.config.ts). --repeat-each makes each repetition its own test entry, so copies
# of the same test run concurrently across the 4 workers — the load that widens races —
# each on its own scratch daemon. Usage: make e2e-soak SPEC=terminal.spec.ts N=20
N ?= 10
.PHONY: e2e-soak
e2e-soak: web-build build ## Repeat one spec file N times in parallel to prove a flake fix (SPEC=<file>.spec.ts, N=10)
	@test -n "$(SPEC)" || { echo "usage: make e2e-soak SPEC=<file>.spec.ts [N=10]"; exit 2; }
	cd web && npm run e2e -- $(SPEC) --repeat-each=$(N)

.PHONY: e2e-fixture-leak-check
e2e-fixture-leak-check: ## Self-test: a failed ScratchDaemon.start() leaves no process, tmux server or tmpdir behind (REQ-4/W1/W3, plan post-worktree-spike-issues)
	cd web && npm run -s e2e:fixture-leak-check

.PHONY: run
run: build web-build ## Run musterd against the real data dir, serving the disk override so the frontend dev loop needs no Go relink
	./$(BIN) -web-dist internal/webui/assets

.PHONY: canary
canary: ## Drive the real claude (4 haiku turns + zero-token unauth/resume/live checks), assert every field Muster depends on, then extend the verified range on a green run outside it; MUSTER_CANARY_OFFLINE=1 = compile + classify + static binary check only
	go test -tags=canary -count=1 -v ./test/canary/... && go run ./tools/versions bump

.PHONY: gen-versions
gen-versions: ## Regenerate the Claude Code version-range fragments in README.md, spikes/canary-fields.md and docs/claude-code-versions.md
	go run ./tools/versions gen

.PHONY: check-versions
check-versions: ## Fail if any Claude Code version-range fragment is stale (run by make check)
	go run ./tools/versions check

.PHONY: refs
refs: ## Every repo path, make target and musterd flag cited in docs or comments must exist (run by make check)
	python3 .claude/skills/orchestrate/scripts/dead-refs.py --all

.PHONY: check
check: lint test contrast e2e-lint check-versions refs ## Lint + test + contrast + e2e-lint + check-versions + refs

.PHONY: hooks
hooks: ## Arm the commit-msg + pre-commit guards (.githooks/) for this clone — docs/conventions.md § Commits
	git config core.hooksPath .githooks

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

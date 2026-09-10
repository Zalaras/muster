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

.PHONY: e2e-fixture-leak-check
e2e-fixture-leak-check: ## Self-test: a failed ScratchDaemon.start() leaves no process, tmux server or tmpdir behind (REQ-4/W1/W3, plan post-worktree-spike-issues)
	cd web && npm run -s e2e:fixture-leak-check

.PHONY: run
run: build web-build ## Run musterd against the real data dir, serving the disk override so the frontend dev loop needs no Go relink
	./$(BIN) -web-dist internal/webui/assets

.PHONY: canary
canary: ## Drive the real claude (4 haiku turns + zero-token unauth/resume/live checks) and assert every field Muster depends on; MUSTER_CANARY_OFFLINE=1 = compile + pin + static binary check only
	go test -tags=canary -count=1 -v ./test/canary/...

.PHONY: check
check: lint test contrast e2e-lint ## Lint + test + contrast + e2e-lint

.PHONY: hooks
hooks: ## Arm the commit-msg guard (.githooks/) for this clone — enforces docs/conventions.md § Commits
	git config core.hooksPath .githooks

# gh (unlike a browser) does not set the com.apple.quarantine xattr, so the unsigned binary
# runs without a Gatekeeper prompt. Arch is resolved here because releases ship one archive
# per arch rather than a universal binary.
.PHONY: install
install: ## Install the latest released musterd into ~/.local/bin
	@set -e; \
	arch=$$(uname -m | sed 's/^x86_64$$/amd64/; s/^aarch64$$/arm64/'); \
	tmp=$$(mktemp -d); \
	trap 'rm -rf "$$tmp"' EXIT; \
	echo "fetching latest musterd_*_darwin_$$arch.tar.gz"; \
	gh release download --repo Zalaras/muster \
		--pattern "musterd_*_darwin_$$arch.tar.gz" --dir "$$tmp"; \
	mkdir -p $(HOME)/.local/bin; \
	tar -xzf "$$tmp"/*.tar.gz -C $(HOME)/.local/bin musterd; \
	echo "installed $(HOME)/.local/bin/musterd ($$($(HOME)/.local/bin/musterd -version))"; \
	resolved=$$(command -v musterd || true); \
	if [ -n "$$resolved" ] && [ "$$resolved" != "$(HOME)/.local/bin/musterd" ]; then \
		echo "warning: 'musterd' on your PATH resolves to $$resolved, not the copy just installed"; \
		echo "         that older binary shadows this one - remove it, or install over it instead"; \
	fi

.PHONY: release-check
release-check: ## Validate .goreleaser.yaml and build a local snapshot release into ./dist
	goreleaser check
	goreleaser release --snapshot --clean

.PHONY: clean
clean: ## Remove build output (preserves internal/webui/assets/.gitkeep so a post-clean build still embeds)
	# Historic: web/dist is pre-embed-dashboard's Vite output dir; stale checkouts may still have one.
	rm -rf bin web/dist dist
	find internal/webui/assets -mindepth 1 ! -name .gitkeep -delete

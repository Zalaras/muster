.DEFAULT_GOAL := help
SHELL := /bin/bash

BIN     := bin/musterd
PKG     := ./...
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: help
help: ## List targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

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

# Order is load-bearing: web-build must produce fresh internal/webui/assets before build
# compiles them into the binary via go:embed, or the E2E-embedded spec (embedded.spec.ts)
# runs against stale assets (plan embed-dashboard Edge Case 3/8 — this repo never runs
# make -j, so make's serial default is what makes this ordering hold).
.PHONY: e2e
e2e: web-build build ## Playwright E2E suite
	cd web && npm run e2e

.PHONY: run
run: build web-build ## Run musterd against the real data dir, serving the disk override so the frontend dev loop needs no Go relink
	./$(BIN) -web-dist internal/webui/assets

.PHONY: canary
canary: ## Drive the real claude (3 haiku turns + 1 zero-token) and assert every field Muster depends on; MUSTER_CANARY_OFFLINE=1 = compile + pin check only
	go test -tags=canary -count=1 -v ./test/canary/...

.PHONY: check
check: lint test ## Lint + test

.PHONY: clean
clean: ## Remove build output (preserves internal/webui/assets/.gitkeep so a post-clean build still embeds)
	rm -rf bin web/dist
	find internal/webui/assets -mindepth 1 ! -name .gitkeep -delete

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
web-build: ## Build the frontend into web/dist
	cd web && npm run build

.PHONY: web-test
web-test: ## Frontend unit tests (Vitest)
	cd web && npm test

.PHONY: e2e
e2e: build web-build ## Playwright E2E suite
	cd web && npm run e2e

.PHONY: run
run: build web-build ## Run musterd against the real data dir and web/dist
	./$(BIN) -web-dist web/dist

.PHONY: canary
canary: ## Assert the pinned Claude Code still emits every field Muster depends on
	go test -tags=canary -count=1 -v ./test/canary/...

.PHONY: check
check: lint test ## Lint + test

.PHONY: clean
clean: ## Remove build output
	rm -rf bin web/dist

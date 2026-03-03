# Makefile for ZGX Toolkit VS Code Extension 
# Equivalent to GitHub Actions CI/CD Pipeline

.PHONY: help clean install install-system-deps lint compile test unit-tests integration-tests coverage package release all all-ci ci ci-full debug-display

# Configuration
SHELL := /bin/bash
NODE := node
NPM := npm
NPXCMD := npx
TSC := $(NPXCMD) tsc
ESLINT := $(NPXCMD) eslint
JEST := $(NPXCMD) jest
VSCE := $(NPXCMD) @vscode/vsce

# Directories
SRC_DIR := src
OUT_DIR := out
COVERAGE_DIR := coverage
DIST_DIR := dist

# Files
TSCONFIG := tsconfig.json
PACKAGE_JSON := package.json

# Version management
GIT_BRANCH=$(shell git rev-parse --abbrev-ref HEAD)
GIT_COMMIT_HASH=$(shell git rev-parse HEAD)
GIT_TAG_VERSION=$(shell git describe --abbrev=0 --tags 2> /dev/null)
BUILD_VERSION=$(shell if ! [ -z ${VERSION} ]; then echo $(VERSION); else if [ -z ${GIT_TAG_VERSION} ]; then echo $(GIT_COMMIT_HASH); else if [ "${GIT_BRANCH}" = "main" ]; then echo $(GIT_TAG_VERSION); else echo $(GIT_TAG_VERSION)-$(GIT_COMMIT_HASH); fi; fi; fi)

# Colors for output
COLOR_RESET := \033[0m
COLOR_BOLD := \033[1m
COLOR_GREEN := \033[32m
COLOR_YELLOW := \033[33m
COLOR_BLUE := \033[34m
COLOR_RED := \033[31m

# Default target
help: ## Show this help message
	@echo "$(COLOR_BOLD)ZGX Toolkit - Makefile targets:$(COLOR_RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(COLOR_BLUE)%-20s$(COLOR_RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(COLOR_BOLD)Current configuration:$(COLOR_RESET)"
	@echo "  Version:     $(GIT_TAG_VERSION)"
	@echo "  Build Version:     $(BUILD_VERSION)"
	@echo "  Branch:      $(GIT_BRANCH)"
	@echo "  Commit:      $(GIT_COMMIT_HASH)"
	@echo "  Node:        $$(node --version 2>/dev/null || echo 'not found')"
	@echo "  NPM:         $$(npm --version 2>/dev/null || echo 'not found')"

all: clean install lint compile test package ## Run complete CI/CD pipeline

all-ci: clean install lint compile unit-tests coverage package ## Run CI-friendly pipeline (no integration tests)

ci: verify-node install lint compile unit-tests coverage ## Run CI pipeline (without integration tests)

ci-full: verify-node install-system-deps install lint compile unit-tests integration-tests coverage ## Run full CI pipeline (with integration tests)

# Environment verification
verify-node: ## Verify Node.js and npm are installed
	@echo "$(COLOR_BOLD)Verifying Node.js environment...$(COLOR_RESET)"
	@echo "Running on: $$(uname -s 2>/dev/null || echo Windows)"
	@echo "Node.js version: $$($(NODE) --version)"
	@echo "npm version: $$($(NPM) --version)"
	@echo "$(COLOR_GREEN)✓ Node.js environment verified$(COLOR_RESET)"

# Installation
install: ## Install dependencies (npm ci)
	@echo "$(COLOR_BOLD)Installing dependencies...$(COLOR_RESET)"
	$(NPM) ci
	@echo "$(COLOR_GREEN)✓ Dependencies installed$(COLOR_RESET)"

install-dev: ## Install dependencies (npm install)
	@echo "$(COLOR_BOLD)Installing dependencies (dev mode)...$(COLOR_RESET)"
	$(NPM) install
	@echo "$(COLOR_GREEN)✓ Dependencies installed$(COLOR_RESET)"

# Linting
lint: ## Run ESLint on source files
	@echo "$(COLOR_BOLD)Running linting...$(COLOR_RESET)"
	$(ESLINT) $(SRC_DIR) --ext ts
	@echo "$(COLOR_GREEN)✓ Linting passed$(COLOR_RESET)"

lint-fix: ## Run ESLint with auto-fix
	@echo "$(COLOR_BOLD)Running linting with auto-fix...$(COLOR_RESET)"
	$(ESLINT) $(SRC_DIR) --ext ts --fix
	@echo "$(COLOR_GREEN)✓ Linting completed with fixes$(COLOR_RESET)"

# Compilation
compile: ## Compile TypeScript to JavaScript
	@echo "$(COLOR_BOLD)Compiling TypeScript...$(COLOR_RESET)"
	$(TSC) -p ./
	@echo "$(COLOR_GREEN)✓ TypeScript compiled$(COLOR_RESET)"

compile-watch: ## Compile TypeScript in watch mode
	@echo "$(COLOR_BOLD)Compiling TypeScript in watch mode...$(COLOR_RESET)"
	$(TSC) -watch -p ./

# Testing
unit-tests: ## Run unit tests with Jest
	@echo "$(COLOR_BOLD)Running unit tests...$(COLOR_RESET)"
	$(JEST)
	@echo "$(COLOR_GREEN)✓ Unit tests passed$(COLOR_RESET)"

unit-tests-watch: ## Run unit tests in watch mode
	@echo "$(COLOR_BOLD)Running unit tests in watch mode...$(COLOR_RESET)"
	$(JEST) --watch

coverage: ## Run unit tests with coverage report
	@echo "$(COLOR_BOLD)Running unit tests with coverage...$(COLOR_RESET)"
	$(JEST) --coverage
	@echo "$(COLOR_GREEN)✓ Coverage report generated$(COLOR_RESET)"
	@if [ -d "$(COVERAGE_DIR)" ]; then \
		echo "$(COLOR_BOLD)Coverage summary:$(COLOR_RESET)"; \
		find $(COVERAGE_DIR) -name "*.info" -o -name "*.json" | head -5; \
	fi

integration-tests: compile ## Run integration tests
	@echo "$(COLOR_BOLD)Running integration tests...$(COLOR_RESET)"
	@if command -v xvfb-run >/dev/null 2>&1; then \
		echo "Running with xvfb-run for virtual display..."; \
		export DISPLAY=:99; \
		xvfb-run -a --server-args=':99 -screen 0, 1024x768x24' $(NPM) run test:integration; \
	else \
		echo "xvfb-run not available, running tests directly..."; \
		$(NPM) run test:integration; \
	fi
	@echo "$(COLOR_GREEN)✓ Integration tests passed$(COLOR_RESET)"

test: unit-tests integration-tests ## Run all tests (unit + integration)
	@echo "$(COLOR_GREEN)✓ All tests passed$(COLOR_RESET)"

# Packaging
package: compile ## Package extension as VSIX
	@echo "$(COLOR_BOLD)Packaging extension...$(COLOR_RESET)"
	@mkdir -p $(DIST_DIR)
	@CLEAN_VERSION="$(BUILD_VERSION)"; \
	PACKAGE_NAME=$$(node -p "require('./package.json').name"); \
	OUTPUT_FILE="$$PACKAGE_NAME-$$CLEAN_VERSION.vsix"; \
	echo "Creating package: $$OUTPUT_FILE"; \
	npx --yes @vscode/vsce package --out $(DIST_DIR)/$$OUTPUT_FILE
	@echo "$(COLOR_GREEN)✓ Extension packaged$(COLOR_RESET)"
	@ls -lh $(DIST_DIR)/*.vsix 2>/dev/null || ls -lh *.vsix


# Release process
release: clean install lint compile test coverage package ## Full release process (version, build, package)
	@echo "$(COLOR_BOLD)Building release summary...$(COLOR_RESET)"
	@echo "=== Build Summary ==="
	@ls -lh $(DIST_DIR)/*.vsix 2>/dev/null || ls -lh *.vsix
	@NEW_VERSION=$$(node -p "require('./package.json').version"); \
	echo "Extension version: $$NEW_VERSION"; \
	if [ "$(GIT_BRANCH)" = "main" ]; then \
		echo "$(COLOR_GREEN)✅ Extension ready for GitHub release$(COLOR_RESET)"; \
		echo "Should publish to GitHub: true"; \
	else \
		echo "$(COLOR_YELLOW)📦 Extension packaged for testing (branch: $(GIT_BRANCH))$(COLOR_RESET)"; \
		echo "Should publish to GitHub: false"; \
	fi

release-tag: ## Create git tag for release (main branch only)
	@if [ "$(GIT_BRANCH)" != "main" ]; then \
		echo "$(COLOR_RED)Error: Release tags can only be created from main branch$(COLOR_RESET)"; \
		exit 1; \
	fi
	@NEW_VERSION=$$(node -p "require('./package.json').version"); \
	TAG_NAME="v$$NEW_VERSION"; \
	echo "Creating git tag: $$TAG_NAME"; \
	git tag -a "$$TAG_NAME" -m "Release $$TAG_NAME"; \
	echo "$(COLOR_GREEN)✓ Tag $$TAG_NAME created$(COLOR_RESET)"; \
	echo "Push tag with: git push origin $$TAG_NAME"

# Cleanup
clean: ## Remove build artifacts and dependencies
	@echo "$(COLOR_BOLD)Cleaning build artifacts...$(COLOR_RESET)"
	rm -rf $(OUT_DIR)
	rm -rf $(COVERAGE_DIR)
	rm -rf $(DIST_DIR)
	rm -rf node_modules
	rm -f *.vsix
	@echo "$(COLOR_GREEN)✓ Cleaned$(COLOR_RESET)"

clean-build: ## Remove only build artifacts (keep node_modules)
	@echo "$(COLOR_BOLD)Cleaning build artifacts...$(COLOR_RESET)"
	rm -rf $(OUT_DIR)
	rm -rf $(COVERAGE_DIR)
	rm -rf $(DIST_DIR)
	rm -f *.vsix
	@echo "$(COLOR_GREEN)✓ Build artifacts cleaned$(COLOR_RESET)"

# Development helpers
watch: ## Run TypeScript compiler in watch mode
	@echo "$(COLOR_BOLD)Starting watch mode...$(COLOR_RESET)"
	$(NPM) run watch

dev: install compile ## Setup development environment
	@echo "$(COLOR_GREEN)✓ Development environment ready$(COLOR_RESET)"

# Archive integration test logs (equivalent to GitHub Actions artifact upload)
archive-logs: ## Archive integration test logs
	@echo "$(COLOR_BOLD)Archiving integration test logs...$(COLOR_RESET)"
	@mkdir -p logs-archive
	@if [ -d "$(OUT_DIR)/__tests__" ]; then \
		find $(OUT_DIR)/__tests__ -name "*.log" -o -name "*.txt" | while read file; do \
			cp "$$file" logs-archive/ 2>/dev/null || true; \
		done; \
		echo "$(COLOR_GREEN)✓ Logs archived to logs-archive/$(COLOR_RESET)"; \
	else \
		echo "$(COLOR_YELLOW)No test logs found$(COLOR_RESET)"; \
	fi

# Display coverage summary (equivalent to GitHub Actions coverage display)
display-coverage: ## Display coverage summary
	@echo "$(COLOR_BOLD)=== Coverage Results Summary ===$(COLOR_RESET)"
	@if [ -d "$(COVERAGE_DIR)" ]; then \
		echo "Coverage reports generated:"; \
		find $(COVERAGE_DIR) -name "*.info" -o -name "*.json" | head -5; \
		if [ -f "$(COVERAGE_DIR)/lcov-report/index.html" ]; then \
			echo ""; \
			echo "Open coverage report: $(COVERAGE_DIR)/lcov-report/index.html"; \
		fi; \
	else \
		echo "$(COLOR_YELLOW)No coverage reports found. Run 'make coverage' first.$(COLOR_RESET)"; \
	fi

# Multi-OS simulation (for local testing of different environments)
test-ubuntu-22: ## Simulate Ubuntu 22.04 environment tests (requires Docker)
	@echo "$(COLOR_BOLD)Running tests in Ubuntu 22.04 environment...$(COLOR_RESET)"
	@if command -v docker >/dev/null 2>&1; then \
		docker run --rm -v "$$(pwd)":/workspace -w /workspace ubuntu:22.04 bash -c "\
			set -e && \
			apt-get update && \
			apt-get install -y curl ca-certificates && \
			curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
			apt-get install -y nodejs && \
			echo 'Ubuntu 22.04 simulation' && \
			node --version && npm --version && \
			npm ci && \
			npx eslint src --ext ts && \
			npx tsc -p ./ && \
			npx jest && \
			npx jest --coverage"; \
	else \
		echo "$(COLOR_RED)Docker not available. Skipping containerized test.$(COLOR_RESET)"; \
	fi

test-ubuntu-24: ## Simulate Ubuntu 24.04 environment tests (requires Docker)
	@echo "$(COLOR_BOLD)Running tests in Ubuntu 24.04 environment...$(COLOR_RESET)"
	@if command -v docker >/dev/null 2>&1; then \
		docker run --rm -v "$$(pwd)":/workspace -w /workspace ubuntu:24.04 bash -c "\
			set -e && \
			echo 'Ubuntu 24.04 simulation' && \
			apt-get update && \
			apt-get install -y curl ca-certificates && \
			curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
			apt-get install -y nodejs && \
			node --version && npm --version && \
			npm ci && \
			npx eslint src --ext ts && \
			npx tsc -p ./ && \
			npx jest && \
			npx jest --coverage"; \
	else \
		echo "$(COLOR_RED)Docker not available. Skipping containerized test.$(COLOR_RESET)"; \
	fi

# CI/CD pipeline simulation (runs everything like GitHub Actions)
pipeline: verify-node ## Run full CI/CD pipeline simulation
	@echo "$(COLOR_BOLD)========================================$(COLOR_RESET)"
	@echo "$(COLOR_BOLD)Starting CI/CD Pipeline Simulation$(COLOR_RESET)"
	@echo "$(COLOR_BOLD)========================================$(COLOR_RESET)"
	@echo ""
	@echo "$(COLOR_BOLD)Stage 1: Unit Tests$(COLOR_RESET)"
	@$(MAKE) install
	@$(MAKE) lint
	@$(MAKE) compile
	@$(MAKE) unit-tests
	@$(MAKE) coverage
	@echo ""
	@echo "$(COLOR_BOLD)Stage 2: Integration Tests$(COLOR_RESET)"
	@$(MAKE) integration-tests
	@$(MAKE) archive-logs
	@echo ""
	@echo "$(COLOR_BOLD)Stage 3: Coverage Results$(COLOR_RESET)"
	@$(MAKE) display-coverage
	@echo ""
	@echo "$(COLOR_BOLD)Stage 4: Build and Publish$(COLOR_RESET)"
	@$(MAKE) package
	@echo ""
	@echo "$(COLOR_BOLD)========================================$(COLOR_RESET)"
	@echo "$(COLOR_GREEN)✓ Pipeline completed successfully$(COLOR_RESET)"
	@echo "$(COLOR_BOLD)========================================$(COLOR_RESET)"


# Documentation
docs: ## Generate documentation
	@echo "$(COLOR_BOLD)Documentation available in docs/ directory$(COLOR_RESET)"
	@ls -la docs/

.DEFAULT_GOAL := help

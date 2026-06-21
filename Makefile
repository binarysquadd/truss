.PHONY: dev dev-api dev-dashboard dev-docs build build-dashboard build-docs build-all start-api migrate-up migrate-down install test test-unit test-deps test-int test-int-auth test-e2e test-down test-all check e2e seed-stress docker-login docker-build docker-push docker-release clean diagram

# ─── Development ───
dev:
	npx concurrently -k -n api,dash,docs -c blue,green,cyan "npm:dev:api" "npm:dev:dashboard" "npm:dev:docs"

dev-api:
	npm run dev -w @truss/api

dev-dashboard:
	npm run dev -w @truss/dashboard

dev-docs:
	npm run dev -w @truss/docs

# ─── Build ───
build: build-dashboard

build-dashboard:
	npm run build -w @truss/dashboard

build-docs:
	npm run build -w @truss/docs

build-all: build-dashboard build-docs

# ─── API ───
start-api:
	npm run start -w @truss/api

# ─── Migrations ───
migrate-up:
	npm run migrate:up -w @truss/api

migrate-down:
	npm run migrate:down -w @truss/api

# ─── Install ───
install:
	npm install

# ─── Test ───
test:
	npm test

check:
	npm run check

# ─── Test harness (local, dual-layer) ───
# COMPOSE_TEST = the self-hosted stack + test override, under an isolated project.
COMPOSE_TEST = docker compose -p truss-test -f docker-compose.selfhosted.yml -f docker-compose.test.yml --env-file .env.selfhosted
# COMPOSE_TEST_AUTH = same stack flipped into auth-required mode.
COMPOSE_TEST_AUTH = docker compose -p truss-test -f docker-compose.selfhosted.yml -f docker-compose.test.yml -f docker-compose.test-auth.yml --env-file .env.selfhosted
TEST_API_URL ?= http://localhost:8788
E2E_BASE_URL ?= http://localhost:3001
TEST_DB_PASS = $(shell grep -E '^DB_PASSWORD=' .env.selfhosted 2>/dev/null | cut -d= -f2-)
TEST_DB_URL ?= postgres://truss:$(TEST_DB_PASS)@localhost:55432/truss?sslmode=disable

# Unit tests — pure functions, no infra, sub-second.
test-unit:
	npm run test:unit -w @truss/api

# Bring up the isolated test stack (deps + API in dev/test mode) and wait for health.
test-deps:
	$(COMPOSE_TEST) up -d --build --wait
	@echo "waiting for test API on $(TEST_API_URL) ..."
	@for i in $$(seq 1 30); do curl -fsS $(TEST_API_URL)/api/health >/dev/null 2>&1 && { echo "ready"; break; }; sleep 2; done

# Integration smoke suite (dev mode) against the test stack.
test-int: test-deps
	TEST_API_URL=$(TEST_API_URL) TEST_DB_URL="$(TEST_DB_URL)" npm test

# Auth-required path: recreate the stack in auth mode, run the login/session/admin test.
test-int-auth:
	$(COMPOSE_TEST_AUTH) down -v
	$(COMPOSE_TEST_AUTH) up -d --build --wait
	@for i in $$(seq 1 30); do curl -fsS $(TEST_API_URL)/api/health >/dev/null 2>&1 && break; sleep 2; done
	TEST_AUTH_MODE=1 TEST_API_URL=$(TEST_API_URL) npm run test:auth -w @truss/api

# E2E (Playwright) against the test stack dashboard.
test-e2e: test-deps
	E2E_BASE_URL=$(E2E_BASE_URL) npm run test:e2e -w @truss/dashboard

# Tear the test stack down and wipe its ephemeral volumes.
test-down:
	$(COMPOSE_TEST_AUTH) down -v

# Unit + integration in one go (e2e + auth are opt-in).
test-all: test-unit test-int

# ─── E2E Tests (Playwright) ───
e2e:
	npm run test:e2e -w @truss/dashboard

# ─── Seed (dev/stress data) ───
seed-stress:
	node scripts/seed-stress.mjs

# ─── Docker (self-host images; set DOCKER_* in .env) ───
-include .env
export

docker-login:
	@echo "$$DOCKER_ACCESS_TOKEN" | docker login -u "$$DOCKER_USERNAME" --password-stdin

docker-build:
	$(eval TS := $(shell date +%Y%m%d-%H%M))
	@echo "$(TS)" > .docker-ts
	docker build -t "$$DOCKER_IMAGE_API:beta" -t "$$DOCKER_IMAGE_API:beta-$(TS)" -f Dockerfile .
	docker build -t "$$DOCKER_IMAGE_DASHBOARD:beta" -t "$$DOCKER_IMAGE_DASHBOARD:beta-$(TS)" -f selfhosted/Dockerfile.dashboard .

docker-push:
	$(eval TS := $(shell cat .docker-ts 2>/dev/null || date +%Y%m%d-%H%M))
	docker push "$$DOCKER_IMAGE_API:beta"
	docker push "$$DOCKER_IMAGE_API:beta-$(TS)"
	docker push "$$DOCKER_IMAGE_DASHBOARD:beta"
	docker push "$$DOCKER_IMAGE_DASHBOARD:beta-$(TS)"

docker-release: docker-login docker-build docker-push
	$(eval TS := $(shell cat .docker-ts 2>/dev/null || date +%Y%m%d-%H%M))
	@echo "Released beta and beta-$(TS) for api and dashboard"

# ─── Clean ───
clean:
	rm -rf apps/dashboard/dist apps/docs/dist node_modules/.cache

diagram:
	@docs/render-diagram.sh

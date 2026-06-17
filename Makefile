.PHONY: dev dev-api dev-dashboard dev-docs build build-dashboard build-docs build-all start-api migrate-up migrate-down install test check e2e seed-stress docker-login docker-build docker-push docker-release clean diagram

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

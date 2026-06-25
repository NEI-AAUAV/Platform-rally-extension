.PHONY: help dev dev-backend dev-db dev-down dev-build dev-logs dev-restart dev-clean dev-ps web-dev web-build prod prod-pull prod-build prod-down prod-logs staging staging-pull staging-down staging-logs test test-backend test-web lock

DEV_COMPOSE     := docker compose --project-name nei-rally-dev -f compose.yml --env-file .env
PROD_COMPOSE    := docker compose --project-name nei-rally-prod -f deploy/docker-compose.prod.yaml --env-file .env.prod
STAGING_COMPOSE := docker compose --project-name nei-rally-staging -f deploy/docker-compose.staging.yaml --env-file .env.staging

help:
	@echo "Available commands:"
	@echo ""
	@echo "Development Environment:"
	@echo "  make dev          - Start all services (DB, API, WebApp, proxy)"
	@echo "  make dev-backend  - Start backend services (DB, API)"
	@echo "  make dev-db       - Start only the database"
	@echo "  make dev-down     - Stop all services"
	@echo "  make dev-build    - Build all services"
	@echo "  make dev-logs     - Follow logs from all services"
	@echo "  make dev-restart  - Restart services"
	@echo "  make dev-clean    - Stop services and remove volumes"
	@echo "  make dev-ps       - List running services"
	@echo ""
	@echo "Web:"
	@echo "  make web-dev      - Start web dev server (HMR)"
	@echo "  make web-build    - Build web for production"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start all services with .env.prod"
	@echo "  make prod-pull    - Pull latest production images"
	@echo "  make prod-build   - Build latest production images"
	@echo "  make prod-down    - Stop production services"
	@echo "  make prod-logs    - Follow production logs"
	@echo ""
	@echo "Staging (self-contained, bundled nginx, .env.staging):"
	@echo "  make staging      - Start staging stack"
	@echo "  make staging-pull - Pull latest images"
	@echo "  make staging-down - Stop staging services"
	@echo "  make staging-logs - Follow staging logs"
	@echo ""
	@echo "Tests:"
	@echo "  make test         - Run backend + web tests"
	@echo "  make test-backend - Run api-rally pytest suite"
	@echo "  make test-web     - Run web-rally vitest suite"
	@echo ""
	@echo "Misc:"
	@echo "  make lock         - Regenerate api-rally poetry.lock"

## --- Development Environment

dev:
	$(DEV_COMPOSE) up -d --remove-orphans

dev-backend:
	$(DEV_COMPOSE) up -d --remove-orphans db_pg api_rally

dev-db:
	$(DEV_COMPOSE) up -d --remove-orphans db_pg

dev-down:
	$(DEV_COMPOSE) down --remove-orphans

dev-build:
	$(DEV_COMPOSE) build

dev-logs:
	$(DEV_COMPOSE) logs -f

dev-restart:
	$(DEV_COMPOSE) restart

dev-clean:
	$(DEV_COMPOSE) down -v --remove-orphans

dev-ps:
	$(DEV_COMPOSE) ps

## --- Web

web-dev:
	cd web-rally && pnpm dev

web-build:
	cd web-rally && pnpm build

## --- Production

prod:
	@if [ ! -f .env.prod ]; then \
		echo "Error: .env.prod file not found. Create it from .env.example"; \
		exit 1; \
	fi
	$(PROD_COMPOSE) up -d --remove-orphans

prod-pull:
	@if [ ! -f .env.prod ]; then \
		echo "Error: .env.prod file not found. Create it from .env.example"; \
		exit 1; \
	fi
	$(PROD_COMPOSE) pull

prod-build:
	@if [ ! -f .env.prod ]; then \
		echo "Error: .env.prod file not found. Create it from .env.example"; \
		exit 1; \
	fi
	$(PROD_COMPOSE) build

prod-down:
	$(PROD_COMPOSE) down --remove-orphans

prod-logs:
	$(PROD_COMPOSE) logs -f

## --- Staging Environment

staging:
	@if [ ! -f .env.staging ]; then \
		echo "Error: .env.staging file not found. Create it from .env.example"; \
		exit 1; \
	fi
	$(STAGING_COMPOSE) up -d --remove-orphans

staging-pull:
	@if [ ! -f .env.staging ]; then \
		echo "Error: .env.staging file not found. Create it from .env.example"; \
		exit 1; \
	fi
	$(STAGING_COMPOSE) pull

staging-down:
	$(STAGING_COMPOSE) down --remove-orphans

staging-logs:
	$(STAGING_COMPOSE) logs -f

## --- Tests

test: test-backend test-web

test-backend:
	cd api-rally && poetry run pytest

test-web:
	cd web-rally && pnpm test

## --- Misc

lock:
	cd api-rally && poetry lock

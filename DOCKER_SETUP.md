# Project Sol (SolTransit) — Docker Compose Infrastructure Guide

**Deliverable:** Deliverable 10 (Docker Compose Architecture for PostgreSQL/PostGIS & Redis)  
**Target OS:** Windows 11 + Docker Desktop (Linux Containers / WSL2 backend)  
**Budget:** ₹0 (100% local containers, zero cloud DB spend)

---

## Deliverable 10 Metadata

- **What will be built:** `infra/docker-compose.yml` (linked from root or run via `docker compose -f infra/docker-compose.yml` + convenience root scripts and root `docker-compose.yml` symlink/include/wrapper), `infra/.env.example`, PostgreSQL 16 + PostGIS 3.4 service (`transport_dev`), Redis 7 service with password authentication, persistent named volumes, healthchecks, and Windows PowerShell runbook commands.
- **Why it is required:** Gives every developer and AI agent an identical, zero-cost, reproducible spatial database and volatile state store bound strictly to `127.0.0.1` without accidentally exposing unauthenticated dev ports or wiping volumes.
- **Dependencies:** Docker Desktop on Windows 11.
- **Technologies:** Docker Compose v2, `postgis/postgis:16-3.4-alpine` (or `16-3.4`), `redis:7-alpine`, `.env` configuration.
- **Expected output:** Running healthy `sol_postgres` (`127.0.0.1:5432`) and `sol_redis` (`127.0.0.1:6379`) containers with `postgis` extension enabled inside `transport_dev`.
- **Acceptance criteria:** Both containers report `healthy`, `SELECT PostGIS_Version();` returns `3.4`, `redis-cli -a $REDIS_PASSWORD PING` returns `PONG`, ports bind exclusively to `127.0.0.1`, and `docker compose down` preserves data across restarts.
- **Relevant tests:** `infra` healthcheck verification, NestJS `/api/v1/health/ready` live integration test, and restart-recovery test (confirming PG persists trips while NestJS handles Redis flush).

---

## 1. Architecture Decisions

- **Canonical Compose Location:** `master-prompt.md` §11 references `docker-compose.yml` in the project root while the scaffold placed empty `infra/docker-compose.yml` and `infra/.env`. We resolve this cleanly by placing the canonical service definitions in `infra/docker-compose.yml` AND adding a root `docker-compose.yml` that uses Compose `include: [infra/docker-compose.yml]` (or matching wrapper) plus root `package.json` scripts (`pnpm docker:up`, `pnpm docker:down`, `pnpm docker:health`) so commands work identically from either `project_sol/` or `infra/`.
- **Localhost-Only Port Binding:** `127.0.0.1:${POSTGRES_PORT:-5433}:5432` (default host `5433` to avoid colliding with any native Windows PostgreSQL installation on `5432`) and `127.0.0.1:6379:6379` prevent LAN exposure during unauthenticated pre-Phase 8 development.
- **Persistent Named Volumes:** `sol_pg_data` and `sol_redis_data` survive `docker compose down` and container upgrades. Never run `docker compose down -v` outside explicit full resets.
- **Credentials Hygiene:** `infra/.env.example` documents every variable with safe local defaults; `infra/.env` is gitignored and never committed.

---

## 2. Service Specifications

| Service | Container Name | Image | Port Binding | Volume | Healthcheck |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `postgres` | `sol_postgres` | `postgis/postgis:16-3.4` | `127.0.0.1:5432:5432` | `sol_pg_data:/var/lib/postgresql/data` | `pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}` |
| `redis` | `sol_redis` | `redis:7.4-alpine` | `127.0.0.1:6379:6379` | `sol_redis_data:/data` | `redis-cli -a ${REDIS_PASSWORD} ping` |

---

## 3. Windows 11 PowerShell Operations Runbook

*(Run from repo root `d:\prac\project_sol`)*

### Start & Stop
```powershell
# If DOCKER_HOST is set in your shell (e.g. tcp://127.0.0.1:2375), clear it or pass --context desktop-linux:
$env:DOCKER_HOST=$null
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml stop
docker compose -f infra/docker-compose.yml down   # Preserves volumes!
```

### Check Service Health & Logs
```powershell
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f postgres redis
```

### Connect to PostgreSQL + PostGIS & Redis
```powershell
docker exec -it sol_postgres psql -U sol_admin -d transport_dev -c "SELECT PostGIS_Version();"
docker exec -it sol_redis redis-cli -a sol_dev_redis_pass PING
```

### Apply Drizzle Migrations & Seed Synthetic Data
```powershell
pnpm --filter backend db:generate
pnpm --filter backend db:migrate
pnpm --filter backend db:seed
```

### Backup & Restore Local Test Data
```powershell
# Backup
docker exec -t sol_postgres pg_dump -U sol_admin -d transport_dev -F c -f /tmp/transport_dev.dump
docker cp sol_postgres:/tmp/transport_dev.dump ./infra/backups/transport_dev.dump

# Restore
docker cp ./infra/backups/transport_dev.dump sol_postgres:/tmp/transport_dev.dump
docker exec -t sol_postgres pg_restore -U sol_admin -d transport_dev --clean --if-exists /tmp/transport_dev.dump
```

### Explicit Development Data Reset (Destructive — Confirmation Required)
```powershell
# Re-truncates business rows and re-seeds synthetic Hyderabad data without dropping container volume:
pnpm --filter backend db:reset
```

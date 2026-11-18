# ADR-001: NestJS 12 ESM, Drizzle ORM, StandardSchemaValidationPipe & Vitest

- **Status:** Accepted
- **Date:** 2026-11-16

## Context
`master-prompt.md` §5 specifies NestJS + TypeScript + Drizzle ORM + Zod + Jest, whereas the scaffolded `backend/` directory (`backend/AGENTS.md` and `backend/package.json`) uses NestJS 12 ESM (`"type": "module"`, relative `.js` imports), Vitest 4 (`vi.fn()`), and `oxlint`. Additionally, Drizzle, BullMQ, Swagger, Socket.IO, and Zod were initially installed in root `package.json` instead of `backend/package.json`, while `pnpm-workspace.yaml` lacked `packages:`.

## Decision
1. Standardize `backend/` on **NestJS 12 ESM + Vitest 4 + `oxlint` + Drizzle ORM 0.45 + Zod 4**.
2. Use NestJS 12's native `StandardSchemaValidationPipe` (`@nestjs/common`) with Zod schemas alongside Swagger DTO metadata, avoiding separate unmaintained validation wrappers.
3. Configure `pnpm-workspace.yaml` (`packages: ['backend', 'web']`) and move backend dependencies into `backend/package.json`.
4. Implement explicit, transparent `DatabaseModule`, `IdempotencyInterceptor`, and `OutboxService` under `backend/src/infrastructure/` rather than relying on non-installed `@nestjs/drizzle`/`@nestjs/idempotency`/`@nestjs/outbox` packages.

## Consequences
- Native ESM + Vitest gives fast execution and clean alignment with NestJS 12 (`backend/AGENTS.md`).
- Relative TypeScript imports inside `backend/` MUST end in `.js`.


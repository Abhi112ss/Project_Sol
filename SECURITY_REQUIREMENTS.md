# Project Sol (SolTransit) — Security, Multi-Tenancy & Privacy Requirements

**Policy Authority:** `master-prompt.md` §§14, 20, 24  
**Auth Strategy:** Authorization boundaries & `organization_id` isolation enforced from Day 1; full JWT/SSO login enforcement completed in Phase 8.

---

## 1. Multi-Tenant Data Isolation (`organization_id`)

- Every tenant-owned table includes a non-null `organization_id` foreign key (`organizations.id`).
- All repository queries require an explicit `TenantContext { organizationId, userId, role }` passed from the controller/guard layer—never read from an unvalidated body parameter when scoped by token/context.
- `PLATFORM_SUPER_ADMIN` is the sole cross-organization administrative role; all other 7 roles are hard-scoped to their active `memberships.organization_id` (and `vendor_id` for `VENDOR_SUPERVISOR`, `driver_id` for `DRIVER`, `employee_id` for `EMPLOYEE`).
- Cross-tenant resource requests return `403 TENANT_FORBIDDEN` or `404 RESOURCE_NOT_FOUND` without leaking existence across organizations.

---

## 2. Pre-Phase 8 Local Development Guard vs. Phase 8 Production Auth

| Aspect | Phases 1–7 (Local Development) | Phase 8 (Production Ready) |
| :--- | :--- | :--- |
| **Identity Extraction** | `RequestContextGuard` resolves seeded dev identity from `X-Dev-User-Id`, `X-Dev-Org-Id`, `X-Dev-Role` headers (verified against `users` + `memberships` in DB) | Validated RS256/EdDSA JWT Bearer token + SSO / OIDC / OTP login flow |
| **Safety Lock** | Guard refuses `X-Dev-*` headers automatically if `NODE_ENV === 'production'` (fails closed with `401`) | `DEV_AUTH_BYPASS` removed / unreachable in prod |
| **Network Exposure** | NestJS, Postgres (`127.0.0.1:5432`), and Redis (`127.0.0.1:6379`) bound strictly to localhost; never exposed to public internet | TLS termination, strict CORS allowlist, Helmet CSP headers, Redis ACL/TLS |
| **RBAC Enforcement** | `@Roles(...)` decorator + `RolesGuard` active on every controller route from Phase 1 | Identical `@Roles(...)` + `RolesGuard` preserved seamlessly |

---

## 3. Sensitive Personal Data & Location Privacy

- **PII Classification:** Employee home pickup coordinates (`employee_locations`), personal phone numbers, emergency contacts, and driver `gps_locations` trails are treated as sensitive personal data.
- **No Off-Duty Tracking:** Driver foreground location collection runs strictly during `trips.status = 'IN_PROGRESS'`.
- **Retention Enforcement:** BullMQ `scheduled-jobs` executes periodic purging/anonymization of historical `gps_locations` older than `organization_settings.gps_retention_days` (default `90` days) while keeping aggregated trip summaries.
- **OTP Security:** `otp_records` stores salted SHA-256 hashes (`otp_code_hash`), enforces expiration (`expires_at`) and max attempt counters (`attempts <= 5`), and never logs plaintext OTPs in `audit_logs`.
- **Immutable Audit Trail:** `audit_logs` captures before/after snapshots, actor, role, correlation ID, and reason for every approval, dispatch override, driver suspension, and no-show appeal resolution.


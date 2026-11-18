import type { ApiEnvelope, DevSessionIdentity, PaginationMeta } from "./types";

export const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001/api/v1";

export const SEEDED_DEV_PERSONAS: DevSessionIdentity[] = [
  {
    orgId: "11111111-1111-4111-8111-111111111101",
    orgName: "Acme Tech Park (Hyderabad)",
    userId: "55555555-5555-4555-8555-555555555502",
    userName: "Vikram Nair",
    role: "ORG_ADMIN",
    label: "Org Admin · Vikram Nair",
  },
  {
    orgId: "11111111-1111-4111-8111-111111111101",
    orgName: "Acme Tech Park (Hyderabad)",
    userId: "55555555-5555-4555-8555-555555555504",
    userName: "Karthik Reddy",
    role: "TRANSPORT_MANAGER",
    label: "Transport Manager · Karthik Reddy",
  },
  {
    orgId: "11111111-1111-4111-8111-111111111101",
    orgName: "Acme Tech Park (Hyderabad)",
    userId: "55555555-5555-4555-8555-555555555503",
    userName: "Ananya Iyer",
    role: "DUTY_APPROVER",
    label: "Duty Approver · Ananya Iyer",
  },
  {
    orgId: "11111111-1111-4111-8111-111111111101",
    orgName: "Acme Tech Park (Hyderabad)",
    userId: "55555555-5555-4555-8555-555555555505",
    userName: "Srinivas Rao",
    role: "VENDOR_SUPERVISOR",
    label: "Vendor Supervisor · Srinivas Rao",
  },
  {
    orgId: "11111111-1111-4111-8111-111111111101",
    orgName: "Acme Tech Park (Hyderabad)",
    userId: "55555555-5555-4555-8555-555555555506",
    userName: "Meera Kulkarni",
    role: "AUDITOR",
    label: "Compliance Auditor · Meera Kulkarni",
  },
];

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  idempotent?: boolean;
}

export function buildQueryString(
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") {
      params.set(k, String(v));
    }
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

export async function apiRequestWithMeta<T>(
  path: string,
  identity: DevSessionIdentity,
  options: ApiRequestOptions = {},
): Promise<{ data: T; pagination?: PaginationMeta; serverTime: string }> {
  const { method = "GET", body, query, idempotent = false } = options;
  const qs = buildQueryString(query);
  const url = `${DEFAULT_API_BASE_URL}${path}${qs}`;

  const headers: Record<string, string> = {
    "X-Dev-User-Id": identity.userId,
    "X-Dev-Org-Id": identity.orgId,
    "X-Dev-Role": identity.role,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (idempotent && method === "POST") {
    headers["X-Idempotency-Key"] = crypto.randomUUID();
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !payload || !payload.success) {
    const code = payload?.error?.code ?? "HTTP_ERROR";
    const message =
      payload?.error?.message ?? `Request failed (${res.status} ${res.statusText})`;
    throw new ApiClientError(res.status, code, message, payload?.error?.details);
  }

  return {
    data: payload.data,
    pagination: payload.meta.pagination,
    serverTime: payload.meta.serverTime,
  };
}

export async function apiRequest<T>(
  path: string,
  identity: DevSessionIdentity,
  options: ApiRequestOptions = {},
): Promise<T> {
  const res = await apiRequestWithMeta<T>(path, identity, options);
  return res.data;
}

export function formatInrFromPaise(paise: number): string {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function formatLocalTime(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDelayBadge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds === 0) return "0s";
  const sign = seconds > 0 ? "+" : "-";
  const abs = Math.abs(seconds);
  if (abs < 60) return `${sign}${abs}s`;
  const mins = Math.floor(abs / 60);
  const rem = abs % 60;
  return rem === 0 ? `${sign}${mins}m` : `${sign}${mins}m ${rem}s`;
}

export async function apiDownloadCsv(
  path: string,
  identity: DevSessionIdentity,
  fallbackFilename: string,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<void> {
  const qs = buildQueryString(query);
  const url = `${DEFAULT_API_BASE_URL}${path}${qs}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Dev-User-Id": identity.userId,
      "X-Dev-Org-Id": identity.orgId,
      "X-Dev-Role": identity.role,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
    const code = payload?.error?.code ?? "HTTP_ERROR";
    const message =
      payload?.error?.message ?? `CSV download failed (${res.status} ${res.statusText})`;
    throw new ApiClientError(res.status, code, message, payload?.error?.details);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";\n]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}


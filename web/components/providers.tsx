"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { SEEDED_DEV_PERSONAS } from "@/lib/api";
import type { DevSessionIdentity } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "soltransit.devSession.v1";
const SESSION_CHANGE_EVENT = "soltransit-dev-session-change";

function subscribeDevRole(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(SESSION_CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SESSION_CHANGE_EVENT, handler);
  };
}

function getClientDevRoleSnapshot(): DevSessionIdentity["role"] {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const match = SEEDED_DEV_PERSONAS.find((p) => p.role === saved);
    if (match) return match.role;
  } catch {
    // ignore localStorage unavailable
  }
  return SEEDED_DEV_PERSONAS[0].role;
}

function getServerDevRoleSnapshot(): DevSessionIdentity["role"] {
  return SEEDED_DEV_PERSONAS[0].role;
}

interface DevSessionContextValue {
  identity: DevSessionIdentity;
  setPersonaByRole: (role: DevSessionIdentity["role"]) => void;
  personas: DevSessionIdentity[];
  canWriteOperations: boolean;
  canApprove: boolean;
  canEditOrgSettings: boolean;
  activeOfficeId: string;
  setActiveOfficeId: (officeId: string) => void;
}

const DevSessionContext = createContext<DevSessionContextValue | null>(null);

export interface ToastItem {
  id: string;
  tone: "success" | "error" | "info";
  title: string;
  description?: string;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useDevSession() {
  const ctx = useContext(DevSessionContext);
  if (!ctx) {
    throw new Error("useDevSession must be used inside Providers");
  }
  return ctx;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside Providers");
  }
  return ctx;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const activeRole = useSyncExternalStore(
    subscribeDevRole,
    getClientDevRoleSnapshot,
    getServerDevRoleSnapshot,
  );
  const identity =
    SEEDED_DEV_PERSONAS.find((p) => p.role === activeRole) ??
    SEEDED_DEV_PERSONAS[0];

  const [activeOfficeId, setActiveOfficeId] = useState<string>("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const setPersonaByRole = useCallback((role: DevSessionIdentity["role"]) => {
    const match = SEEDED_DEV_PERSONAS.find((p) => p.role === role);
    if (!match) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, match.role);
      window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
    } catch {
      // ignore
    }
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const canWriteOperations =
    identity.role === "ORG_ADMIN" ||
    identity.role === "TRANSPORT_MANAGER" ||
    identity.role === "PLATFORM_SUPER_ADMIN";

  const canApprove =
    canWriteOperations || identity.role === "DUTY_APPROVER";

  const canEditOrgSettings =
    identity.role === "ORG_ADMIN" || identity.role === "PLATFORM_SUPER_ADMIN";

  return (
    <QueryClientProvider client={queryClient}>
      <DevSessionContext.Provider
        value={{
          identity,
          setPersonaByRole,
          personas: SEEDED_DEV_PERSONAS,
          canWriteOperations,
          canApprove,
          canEditOrgSettings,
          activeOfficeId,
          setActiveOfficeId,
        }}
      >
        <ToastContext.Provider value={{ pushToast }}>
          {children}
          <div
            aria-live="polite"
            className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0 pointer-events-none"
          >
            {toasts.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card px-3.5 py-3 shadow-lg",
                  item.tone === "error"
                    ? "border-[#FECDD3] bg-[#FFF1F2]/95 text-[#9F1239]"
                    : item.tone === "success"
                      ? "border-[#99F6E4] bg-[#F0FDFA]/95 text-[#115E59]"
                      : "border-border text-foreground",
                )}
              >
                {item.tone === "success" ? (
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-[#0D9488]" aria-hidden="true" />
                ) : item.tone === "error" ? (
                  <AlertTriangle className="size-4 shrink-0 mt-0.5 text-[#E11D48]" aria-hidden="true" />
                ) : (
                  <Info className="size-4 shrink-0 mt-0.5 text-[#2563EB]" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs opacity-90">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismissToast(item.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </ToastContext.Provider>
      </DevSessionContext.Provider>
    </QueryClientProvider>
  );
}

"use client";

/**
 * Cliente de la API de administración (solo navegador).
 * Maneja tokens en localStorage con refresh automático ante 401.
 */
import { TENANT_SLUG } from "./api";
import type {
  AppointmentAdmin,
  ProfessionalAdmin,
  PerformanceStats,
  ClientNote,
  ClientProfile,
  DashboardData,
  GiftCodeAdmin,
  MediaAsset,
  PaymentAdminRow,
  PaymentSettingsAdmin,
  ProductAdmin,
  SecurityEventRow,
  ServiceAdmin,
  TimeOff,
  TokenPair,
} from "./types";

const STORAGE_KEY = "badboys.auth";

export interface StoredAuth {
  access_token: string;
  refresh_token: string;
  role: "admin";
  username: string;
}

export function getAuth(): StoredAuth | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function setAuth(auth: StoredAuth | null): void {
  if (auth) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else window.localStorage.removeItem(STORAGE_KEY);
}

function base(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function tryRefresh(): Promise<boolean> {
  const auth = getAuth();
  if (!auth) return false;
  const response = await fetch(`${base()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: auth.refresh_token }),
  });
  if (!response.ok) {
    setAuth(null);
    return false;
  }
  const pair = (await response.json()) as TokenPair;
  setAuth({ ...auth, access_token: pair.access_token, refresh_token: pair.refresh_token });
  return true;
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const auth = getAuth();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (!(init?.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${auth.access_token}`;

  const response = await fetch(`${base()}${path}`, { ...init, headers });

  if (response.status === 401 && retry && (await tryRefresh())) {
    return request<T>(path, init, false);
  }
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (body.detail?.message) message = body.detail.message;
    } catch {
      /* sin cuerpo JSON */
    }
    throw new AdminApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  login: async (
    username: string,
    password: string,
    extra?: { website?: string; captcha_token?: string | null },
  ): Promise<StoredAuth> => {
    const response = await fetch(`${base()}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, tenant_slug: TENANT_SLUG, ...extra }),
    });
    if (!response.ok) {
      if (response.status === 429) {
        throw new AdminApiError(
          429,
          "Demasiados intentos. Espera unos minutos e intenta de nuevo.",
        );
      }
      let message = "Usuario o contraseña incorrectos";
      try {
        const body = await response.json();
        if (response.status !== 401 && typeof body.detail === "string") message = body.detail;
      } catch {
        /* sin cuerpo JSON */
      }
      throw new AdminApiError(response.status, message);
    }
    const pair = (await response.json()) as TokenPair;
    const auth: StoredAuth = {
      access_token: pair.access_token,
      refresh_token: pair.refresh_token,
      role: pair.role,
      username: pair.username,
    };
    setAuth(auth);
    return auth;
  },
  logout: () => setAuth(null),

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    const pair = await request<TokenPair>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    const auth = getAuth();
    if (auth) {
      // El cambio revoca los refresh tokens viejos: se guarda el par nuevo
      setAuth({ ...auth, access_token: pair.access_token, refresh_token: pair.refresh_token });
    }
  },

  dashboard: () => request<DashboardData>("/api/v1/admin/dashboard"),
  agenda: (start: string, end: string) =>
    request<{
      appointments: AppointmentAdmin[];
      schedule: Record<string, { start: string; end: string } | null>;
      time_off: { id: number; date: string; reason: string | null }[];
    }>(`/api/v1/admin/agenda?start=${start}&end=${end}`),

  appointments: (params: Record<string, string>) =>
    request<AppointmentAdmin[]>(
      `/api/v1/admin/appointments?${new URLSearchParams(params).toString()}`,
    ),
  createAppointment: (payload: object) =>
    request<AppointmentAdmin>("/api/v1/admin/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  walkIn: (payload: {
    service_ids: number[];
    customer_name: string;
    customer_whatsapp?: string | null;
  }) =>
    request<AppointmentAdmin>("/api/v1/admin/appointments/walk-in", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reschedule: (id: number, payload: { date: string; time: string }) =>
    request<AppointmentAdmin>(`/api/v1/admin/appointments/${id}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  cancelAppointment: (id: number, reason?: string) =>
    request<AppointmentAdmin>(`/api/v1/admin/appointments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    }),
  setStatus: (id: number, status: string) =>
    request<AppointmentAdmin>(`/api/v1/admin/appointments/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  clientProfile: (phone: string) =>
    request<ClientProfile>(`/api/v1/admin/clients/${encodeURIComponent(phone)}`),
  addClientNote: (phone: string, note: string) =>
    request<ClientNote>(`/api/v1/admin/clients/${encodeURIComponent(phone)}/notes`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  deleteClientNote: (noteId: number) =>
    request<void>(`/api/v1/admin/client-notes/${noteId}`, { method: "DELETE" }),

  profile: () => request<ProfessionalAdmin>("/api/v1/admin/profile"),
  updateProfile: (payload: object) =>
    request<ProfessionalAdmin>("/api/v1/admin/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  timeOff: () => request<TimeOff[]>("/api/v1/admin/time-off"),
  addTimeOff: (date: string, reason?: string) =>
    request<TimeOff>("/api/v1/admin/time-off", {
      method: "POST",
      body: JSON.stringify({ date, reason: reason ?? null }),
    }),
  removeTimeOff: (timeOffId: number) =>
    request<void>(`/api/v1/admin/time-off/${timeOffId}`, { method: "DELETE" }),

  services: () => request<ServiceAdmin[]>("/api/v1/admin/services"),
  createService: (payload: object) =>
    request<ServiceAdmin>("/api/v1/admin/services", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateService: (id: number, payload: object) =>
    request<ServiceAdmin>(`/api/v1/admin/services/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  products: () => request<ProductAdmin[]>("/api/v1/admin/products"),
  createProduct: (payload: object) =>
    request<ProductAdmin>("/api/v1/admin/products", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProduct: (id: number, payload: object) =>
    request<ProductAdmin>(`/api/v1/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  paymentSettings: () =>
    request<PaymentSettingsAdmin>("/api/v1/admin/payment-settings"),
  updatePaymentSettings: (payload: Partial<PaymentSettingsAdmin>) =>
    request<PaymentSettingsAdmin>("/api/v1/admin/payment-settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  payments: () => request<PaymentAdminRow[]>("/api/v1/admin/payments"),

  stats: (days: number) =>
    request<PerformanceStats>(`/api/v1/admin/stats?days=${days}`),

  securityEvents: (kind?: string) =>
    request<SecurityEventRow[]>(
      `/api/v1/admin/security-events?limit=200${kind ? `&kind=${kind}` : ""}`,
    ),

  giftCodes: () => request<GiftCodeAdmin[]>("/api/v1/admin/gift-codes"),
  createGiftCode: (description: string, expiresDays?: number) =>
    request<GiftCodeAdmin>("/api/v1/admin/gift-codes", {
      method: "POST",
      body: JSON.stringify({ description, expires_days: expiresDays ?? null }),
    }),

  media: (kind?: string) =>
    request<MediaAsset[]>(`/api/v1/admin/media${kind ? `?kind=${kind}` : ""}`),
  deleteMedia: (id: number) => request<void>(`/api/v1/admin/media/${id}`, { method: "DELETE" }),

  /** Subida unificada: presign decide si va directo a S3 o multipart al backend. */
  uploadImage: async (kind: string, file: File): Promise<MediaAsset> => {
    const presign = await request<{
      mode: "presigned" | "direct";
      key: string;
      upload: { url: string; fields?: Record<string, string> };
    }>("/api/v1/admin/media/presign", {
      method: "POST",
      body: JSON.stringify({ kind, filename: file.name, content_type: file.type }),
    });

    if (presign.mode === "presigned") {
      const form = new FormData();
      Object.entries(presign.upload.fields ?? {}).forEach(([k, v]) => form.append(k, v));
      form.append("file", file);
      const s3 = await fetch(presign.upload.url, { method: "POST", body: form });
      if (!s3.ok) throw new AdminApiError(s3.status, "La subida a S3 falló");
      return request<MediaAsset>("/api/v1/admin/media/confirm", {
        method: "POST",
        body: JSON.stringify({ key: presign.key, kind, title: file.name }),
      });
    }

    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return request<MediaAsset>("/api/v1/admin/media/upload", { method: "POST", body: form });
  },
};

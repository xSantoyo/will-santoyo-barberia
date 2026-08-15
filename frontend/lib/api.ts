/**
 * Cliente de la API pública.
 *
 * - En el navegador usa NEXT_PUBLIC_API_URL (http://localhost:8000 en dev).
 * - En Server Components / SSR usa API_URL_INTERNAL si existe (en docker-compose
 *   el backend se resuelve como http://backend:8000 desde el contenedor).
 */
import type {
  AppointmentPublic,
  ProfessionalPublic,
  Trayectoria,
  DayAvailability,
  MediaAsset,
  PortalResponse,
  ProductPublic,
  QueueBoard,
  ReviewPublic,
  ReviewsResponse,
  ServicePublic,
  TenantPublic,
  TicketQueue,
} from "./types";

export const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG ?? "will-santoyo";

export function apiBase(): string {
  if (typeof window === "undefined") {
    // 127.0.0.1 y no localhost: en Node el fetch no hace fallback IPv6→IPv4
    // (en Windows localhost resuelve primero a ::1 y uvicorn escucha en IPv4).
    return process.env.API_URL_INTERNAL ?? "http://127.0.0.1:8000";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

/** Prefija URLs relativas de media (modo local) con la base del backend. */
export function mediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}${url}`;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let code = "error";
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
      else if (body.detail?.message) {
        message = body.detail.message;
        code = body.detail.code ?? code;
      }
    } catch {
      /* cuerpo no-JSON: se mantiene el mensaje genérico */
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const PUBLIC = `/api/v1/public/${TENANT_SLUG}`;

export const publicApi = {
  tenant: () => request<TenantPublic>(PUBLIC, { next: { revalidate: 300 } } as RequestInit),
  professional: () =>
    request<ProfessionalPublic>(`${PUBLIC}/professional`, { cache: "no-store" }),
  services: () => request<ServicePublic[]>(`${PUBLIC}/services`, { cache: "no-store" }),
  media: (kind?: string) =>
    request<MediaAsset[]>(`${PUBLIC}/media${kind ? `?kind=${kind}` : ""}`, {
      cache: "no-store",
    }),
  timeOff: (start: string, end: string) =>
    request<{ dates: string[] }>(
      `${PUBLIC}/time-off?start=${start}&end=${end}`,
      { cache: "no-store" },
    ),
  availability: (date: string, serviceIds: number[], party = 1) =>
    request<DayAvailability>(`${PUBLIC}/availability`, {
      method: "POST",
      body: JSON.stringify({ date, service_ids: serviceIds, party }),
    }),
  book: (payload: {
    service_ids: number[];
    date: string;
    time: string;
    customer_name: string;
    customer_whatsapp: string;
    customer_email?: string | null;
    referral_code?: string | null;
    gift_code?: string | null;
    website?: string;
    captcha_token?: string | null;
  }) =>
    request<AppointmentPublic>(`${PUBLIC}/appointments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  bookGroup: (payload: {
    date: string;
    time: string;
    customer_whatsapp: string;
    customers: { name: string; service_ids: number[] }[];
    website?: string;
    captcha_token?: string | null;
  }) =>
    request<{ appointments: AppointmentPublic[] }>(`${PUBLIC}/appointments/group`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  rebook: (code: string, weeks: number) =>
    request<AppointmentPublic>(
      `${PUBLIC}/appointments/${encodeURIComponent(code)}/rebook`,
      { method: "POST", body: JSON.stringify({ weeks }) },
    ),
  products: () =>
    request<ProductPublic[]>(`${PUBLIC}/products`, { cache: "no-store" }),
  trayectoria: () =>
    request<Trayectoria>(`${PUBLIC}/trayectoria`, { cache: "no-store" }),
  appointment: (code: string) =>
    request<AppointmentPublic>(`${PUBLIC}/appointments/${encodeURIComponent(code)}`, {
      cache: "no-store",
    }),
  find: (phone: string, code: string) =>
    request<AppointmentPublic>(`${PUBLIC}/appointments/find`, {
      method: "POST",
      body: JSON.stringify({ customer_whatsapp: phone, manage_code: code }),
    }),
  cancel: (code: string, reason?: string) =>
    request<AppointmentPublic>(
      `${PUBLIC}/appointments/${encodeURIComponent(code)}/cancel`,
      { method: "POST", body: JSON.stringify({ reason: reason ?? null }) },
    ),
  confirmAttendance: (code: string) =>
    request<AppointmentPublic>(
      `${PUBLIC}/appointments/${encodeURIComponent(code)}/confirm`,
      { method: "POST" },
    ),
  /* Tanda 3: cliente con memoria */
  portal: (phone: string, code: string) =>
    request<PortalResponse>(`${PUBLIC}/portal`, {
      method: "POST",
      body: JSON.stringify({ customer_whatsapp: phone, manage_code: code }),
    }),
  leaveReview: (code: string, rating: number, comment?: string) =>
    request<ReviewPublic>(
      `${PUBLIC}/appointments/${encodeURIComponent(code)}/review`,
      { method: "POST", body: JSON.stringify({ rating, comment: comment ?? null }) },
    ),
  reviews: () =>
    request<ReviewsResponse>(`${PUBLIC}/reviews`, { cache: "no-store" }),
  /* La Fila en vivo */
  queue: () => request<QueueBoard>(`${PUBLIC}/queue`, { cache: "no-store" }),
  ticketQueue: (code: string) =>
    request<TicketQueue>(
      `${PUBLIC}/appointments/${encodeURIComponent(code)}/queue`,
      { cache: "no-store" },
    ),
};

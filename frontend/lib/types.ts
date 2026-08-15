/** Tipos espejo de los esquemas Pydantic del backend. */

export interface TenantPublic {
  name: string;
  slug: string;
  whatsapp_number: string | null;
  timezone: string;
  brand_config: {
    tagline?: string;
    address?: string;
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    maps_url?: string;
    [key: string]: unknown;
  };
  business_hours: Record<string, { start: string; end: string } | null>;
}

export type WeeklySchedule = Record<string, { start: string; end: string } | null>;

export interface ProfessionalPublic {
  name: string;
  headline: string | null;
  instagram: string | null;
  photo_url: string | null;
  schedule: WeeklySchedule;
}

export interface ServicePublic {
  id: number;
  name: string;
  price_cop: number;
  duration_min: number;
}

export interface DayAvailability {
  date: string;
  is_day_off: boolean;
  slots: string[];
}

export interface AppointmentServiceOut {
  name: string;
  price_cop: number;
  duration_min: number;
}

export interface AppointmentPublic {
  manage_code: string;
  status: AppointmentStatus;
  daily_number: number;
  date_local: string;
  time_local: string;
  customer_name: string;
  services: AppointmentServiceOut[];
  total_cop: number;
  attendance_pending: boolean;
  attendance_confirmed: boolean;
  attendance_deadline_local: string | null;
  can_review: boolean;
  review_rating: number | null;
  gift_description: string | null;
}

/* --- Tanda 4: crecimiento --- */

export interface ProductPublic {
  id: number;
  name: string;
  description: string | null;
  price_cop: number;
  photo_url: string | null;
}

export interface ProductAdmin extends ProductPublic {
  photo_key: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface GiftCodeAdmin {
  id: number;
  code: string;
  description: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  held_by_appointment_id: number | null;
  redeemed_at: string | null;
}

export interface Trayectoria {
  rating: number | null;
  review_count: number;
  completed_count: number;
  cuts: string[];
}

/* --- Tanda 3: cliente con memoria --- */

export interface ReviewPublic {
  rating: number;
  comment: string | null;
  customer_label: string;
  date_local: string;
}

export interface ReviewsResponse {
  overall: { average: number | null; count: number };
  items: ReviewPublic[];
}

export interface LoyaltyStatus {
  completed_count: number;
  referral_bonus: number;
  review_bonus: number;
  target: number;
  progress: number;
  remaining: number;
  earned_rewards: number;
  reward: string;
}

export interface PortalAppointment {
  manage_code: string;
  date_local: string;
  time_local: string;
  status: AppointmentStatus;
  services: string[];
  total_cop: number;
  can_review: boolean;
  review_rating: number | null;
}

export interface PortalResponse {
  customer_name: string;
  appointments: PortalAppointment[];
  loyalty: LoyaltyStatus;
  referral_code: string;
}

export interface ClientNote {
  id: number;
  author_name: string;
  note: string;
  created_at: string;
}

export interface ClientProfile {
  phone: string;
  stats: {
    customer_name: string | null;
    total_appointments: number;
    completed_count: number;
    cancelled_count: number;
    no_show_count: number;
    last_visit_local: string | null;
  };
  loyalty: LoyaltyStatus;
  notes: ClientNote[];
  recent: AppointmentAdmin[];
}

export type AppointmentStatus =
  | "pendiente"
  | "confirmado"
  | "en_curso"
  | "completado"
  | "cancelado"
  | "no_show";

export interface AppointmentAdmin {
  id: number;
  customer_name: string;
  customer_whatsapp: string | null;
  status: AppointmentStatus;
  attendance_confirmed: boolean;
  attendance_pending: boolean;
  daily_number: number;
  manage_code: string;
  date_local: string;
  time_local: string;
  end_time_local: string;
  services: AppointmentServiceOut[];
  total_cop: number;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface ProfessionalAdmin {
  name: string;
  headline: string | null;
  instagram: string | null;
  photo_key: string | null;
  photo_url: string | null;
  schedule: WeeklySchedule;
}

export interface ServiceAdmin extends ServicePublic {
  is_active: boolean;
  sort_order: number;
}

export interface MediaAsset {
  id: number;
  kind: "gallery" | "profile" | "cut";
  s3_key: string;
  title: string | null;
  sort_order: number;
  url: string | null;
}

export interface TimeOff {
  id: number;
  date: string;
  reason: string | null;
}

export interface DashboardData {
  date_local: string;
  is_day_off: boolean;
  current: AppointmentAdmin | null;
  upcoming: AppointmentAdmin[];
  all_today: AppointmentAdmin[];
  done_count: number;
  cancelled_count: number;
}

/* --- La Fila en vivo --- */

export interface QueueEntry {
  number: number;
  time_local: string;
}

export interface QueueBoard {
  date_local: string;
  now_local: string;
  is_day_off: boolean;
  current: QueueEntry | null;
  waiting: QueueEntry[];
  served_count: number;
  last_served_number: number | null;
}

export interface TicketQueue {
  is_today: boolean;
  status: AppointmentStatus;
  number: number;
  time_local: string;
  ahead_count: number;
  now_serving: number | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  role: "admin";
  username: string;
}

/* --- Ronda de seguridad (jul-2026) --- */

export interface PerformanceStats {
  days: number;
  completed_count: number;
  cancelled_count: number;
  no_show_count: number;
  revenue_cop: number;
  unique_clients: number;
  upcoming_today: number;
  top_services: { name: string; count: number }[];
  rating: number | null;
  review_count: number;
}

export interface SecurityEventRow {
  id: number;
  kind: string;
  username: string | null;
  ip: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
  no_show: "No asistió",
};

export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

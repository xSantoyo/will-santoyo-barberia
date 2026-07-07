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

export interface BarberPublic {
  id: number;
  name: string;
  specialty: string | null;
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
  barber_name: string;
  services: AppointmentServiceOut[];
  total_cop: number;
  attendance_pending: boolean;
  attendance_confirmed: boolean;
  attendance_deadline_local: string | null;
  can_review: boolean;
  review_rating: number | null;
  gift_description: string | null;
  payment: PaymentPublic | null;
}

/* --- Pagos (Wompi / simulador) --- */

export interface PaymentPublic {
  reference: string;
  kind: "deposit" | "gift";
  status: "pendiente" | "aprobado" | "rechazado" | "anulado" | "expirado" | "error";
  amount_cop: number;
  checkout_url: string | null;
  gift_code?: string | null;
}

export interface PaymentStatusResponse extends PaymentPublic {
  payment_method: string | null;
  gift_description: string | null;
  appointment_code: string | null;
  appointment_status: AppointmentStatus | null;
}

export interface PaymentSettingsAdmin {
  deposits_enabled: boolean;
  deposit_cop: number;
  gift_shop_enabled: boolean;
  wompi_mode?: "mock" | "sandbox" | "production";
}

export interface PaymentAdminRow {
  id: number;
  reference: string;
  kind: string;
  status: string;
  amount_cop: number;
  payment_method: string | null;
  payer_name: string | null;
  appointment_id: number | null;
  created_at: string;
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

export interface BarberPortfolio {
  barber: BarberPublic;
  stats: { rating: number | null; review_count: number; completed_count: number };
  reviews: ReviewPublic[];
  cuts: string[];
}

/* --- Tanda 3: cliente con memoria --- */

export interface ReviewPublic {
  rating: number;
  comment: string | null;
  customer_label: string;
  barber_name: string;
  date_local: string;
}

export interface ReviewsResponse {
  overall: { average: number | null; count: number };
  per_barber: Record<string, { average: number; count: number }>;
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
  barber_name: string;
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
    favorite_barber: string | null;
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
  barber_id: number;
  barber_name: string;
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

export interface BarberAdmin {
  id: number;
  name: string;
  specialty: string | null;
  instagram: string | null;
  photo_key: string | null;
  photo_url: string | null;
  schedule: WeeklySchedule;
  is_active: boolean;
  sort_order: number;
}

export interface ServiceAdmin extends ServicePublic {
  is_active: boolean;
  sort_order: number;
}

export interface MediaAsset {
  id: number;
  kind: "gallery" | "barber" | "cut";
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

export interface DashboardBarberBlock {
  barber: { id: number; name: string; photo_url: string | null };
  is_day_off: boolean;
  current: AppointmentAdmin | null;
  upcoming: AppointmentAdmin[];
  all_today: AppointmentAdmin[];
  done_count: number;
  cancelled_count: number;
}

export interface DashboardData {
  date_local: string;
  barbers: DashboardBarberBlock[];
}

/* --- La Fila en vivo --- */

export interface QueueEntry {
  number: number;
  time_local: string;
}

export interface QueueLane {
  barber: { id: number; name: string };
  is_day_off: boolean;
  current: QueueEntry | null;
  waiting: QueueEntry[];
  served_count: number;
  last_served_number: number | null;
}

export interface QueueBoard {
  date_local: string;
  now_local: string;
  lanes: QueueLane[];
}

export interface TicketQueue {
  is_today: boolean;
  status: AppointmentStatus;
  number: number;
  barber_name: string;
  time_local: string;
  ahead_count: number;
  now_serving: number | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  role: "admin" | "barbero";
  username: string;
  barber_id: number | null;
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

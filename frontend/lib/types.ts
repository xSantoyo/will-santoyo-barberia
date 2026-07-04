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
  customer_whatsapp: string;
  status: AppointmentStatus;
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

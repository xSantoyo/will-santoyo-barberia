"use client";

/**
 * Wizard de agendamiento — 5 pasos (sección 7 del spec):
 *   1. Barbero  2. Servicio(s)  3. Fecha y hora  4. Datos  5. Confirmación
 *
 * El calendario deshabilita: días de descanso semanal del barbero, excepciones
 * puntuales (time-off), fechas pasadas y fuera del horizonte de reserva.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { ApiError, mediaUrl, publicApi } from "@/lib/api";
import {
  formatCOP,
  WEEKDAY_KEYS,
  type AppointmentPublic,
  type BarberPublic,
  type DayAvailability,
  type ServicePublic,
} from "@/lib/types";

const STEPS = ["Barbero", "Servicios", "Fecha y hora", "Tus datos", "Confirmar"];
const HORIZON_DAYS = 30;

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export default function Wizard() {
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [barbers, setBarbers] = useState<BarberPublic[]>([]);
  const [services, setServices] = useState<ServicePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selección del usuario
  const [barber, setBarber] = useState<BarberPublic | null>(null);
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Estado del calendario
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [timeOffDates, setTimeOffDates] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<DayAvailability | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<AppointmentPublic | null>(null);

  useEffect(() => {
    Promise.all([publicApi.barbers(), publicApi.services()])
      .then(([loadedBarbers, loadedServices]) => {
        setBarbers(loadedBarbers);
        setServices(loadedServices);
        const preselected = params.get("barbero");
        if (preselected) {
          const found = loadedBarbers.find((b) => b.id === Number(preselected));
          if (found) {
            setBarber(found);
            setStep(1);
          }
        }
      })
      .catch(() => setError("No pudimos cargar la información. Intenta de nuevo en un momento."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Excepciones puntuales del barbero para el horizonte visible
  useEffect(() => {
    if (!barber) return;
    const start = toISODate(today);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + HORIZON_DAYS);
    publicApi
      .timeOff(barber.id, start, toISODate(endDate))
      .then((response) => setTimeOffDates(new Set(response.dates)))
      .catch(() => setTimeOffDates(new Set()));
  }, [barber, today]);

  const totals = useMemo(() => {
    const chosen = services.filter((s) => selectedServices.includes(s.id));
    return {
      chosen,
      price: chosen.reduce((sum, s) => sum + s.price_cop, 0),
      minutes: chosen.reduce((sum, s) => sum + s.duration_min, 0),
    };
  }, [services, selectedServices]);

  const loadSlots = useCallback(
    (isoDate: string) => {
      if (!barber || selectedServices.length === 0) return;
      setSlotsLoading(true);
      setTime(null);
      publicApi
        .availability(barber.id, isoDate, selectedServices)
        .then(setAvailability)
        .catch(() => setAvailability(null))
        .finally(() => setSlotsLoading(false));
    },
    [barber, selectedServices],
  );

  function selectDate(isoDate: string) {
    setDate(isoDate);
    loadSlots(isoDate);
  }

  function isSelectableDay(candidate: Date): boolean {
    if (!barber) return false;
    const iso = toISODate(candidate);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const horizon = new Date(startOfToday);
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);
    if (candidate < startOfToday || candidate > horizon) return false;
    const weekday = WEEKDAY_KEYS[(candidate.getDay() + 6) % 7]; // JS: 0=Dom → clave lun-dom
    if (!barber.schedule?.[weekday]) return false;
    if (timeOffDates.has(iso)) return false;
    return true;
  }

  async function submit() {
    if (!barber || !date || !time) return;
    setSubmitting(true);
    setError(null);
    try {
      const appointment = await publicApi.book({
        barber_id: barber.id,
        service_ids: selectedServices,
        date,
        time,
        customer_name: name.trim(),
        customer_whatsapp: phone.trim(),
      });
      setConfirmed(appointment);
    } catch (err) {
      if (err instanceof ApiError && err.code === "overlap") {
        setError("Ese horario acaba de ocuparse. Elige otro, por favor.");
        setStep(2);
        loadSlots(date);
      } else {
        setError(err instanceof Error ? err.message : "No pudimos crear la reserva.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------- render

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (confirmed) {
    return <Confirmation appointment={confirmed} />;
  }

  const canContinue =
    (step === 0 && barber !== null) ||
    (step === 1 && selectedServices.length > 0) ||
    (step === 2 && date !== null && time !== null) ||
    (step === 3 && name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 10) ||
    step === 4;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24">
      {/* Barra de progreso */}
      <ol className="mb-10 flex items-center gap-1 text-[11px] uppercase tracking-wider sm:gap-2 sm:text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                i < step
                  ? "border-gold bg-gold text-ink"
                  : i === step
                    ? "border-gold text-gold"
                    : "border-ink-3 text-bone-2"
              }`}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span className={i === step ? "text-gold" : "text-bone-2/70"}>{label}</span>
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-6 rounded-sm border border-wine bg-wine/15 px-4 py-3 text-sm text-bone">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-3">
              {barbers.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => setBarber(candidate)}
                  className={`group overflow-hidden rounded-sm border text-left transition-colors ${
                    barber?.id === candidate.id
                      ? "border-gold bg-ink-2"
                      : "border-ink-3 bg-ink-2 hover:border-gold/50"
                  }`}
                >
                  <div className="aspect-square bg-ink-3">
                    {candidate.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl(candidate.photo_url) ?? ""}
                        alt={candidate.name}
                        className="h-full w-full object-cover grayscale group-hover:grayscale-0"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="display text-6xl text-ink">
                          {candidate.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="display text-xl text-bone">{candidate.name}</p>
                    <p className="mt-1 text-xs text-bone-2">{candidate.specialty}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              {services.map((service) => {
                const active = selectedServices.includes(service.id);
                return (
                  <button
                    key={service.id}
                    onClick={() =>
                      setSelectedServices((current) =>
                        active
                          ? current.filter((id) => id !== service.id)
                          : [...current, service.id],
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-sm border px-5 py-4 text-left transition-colors ${
                      active ? "border-gold bg-gold/10" : "border-ink-3 bg-ink-2 hover:border-gold/40"
                    }`}
                  >
                    <span>
                      <span className="block text-bone">{service.name}</span>
                      <span className="text-xs text-bone-2">{service.duration_min} min</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="display text-xl text-gold">
                        {formatCOP(service.price_cop)}
                      </span>
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                          active ? "border-gold bg-gold text-ink" : "border-ink-3"
                        }`}
                      >
                        {active && <Check size={14} />}
                      </span>
                    </span>
                  </button>
                );
              })}
              {totals.chosen.length > 0 && (
                <p className="pt-2 text-right text-sm text-bone-2">
                  Total: <span className="display text-xl text-gold">{formatCOP(totals.price)}</span>
                  {" · "}
                  {totals.minutes} min
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-8 md:grid-cols-2">
              <Calendar
                month={month}
                onMonthChange={setMonth}
                selected={date}
                isSelectable={isSelectableDay}
                onSelect={selectDate}
              />
              <div>
                <p className="mb-3 text-sm uppercase tracking-widest text-bone-2">
                  {date ? `Horarios para ${date}` : "Elige un día"}
                </p>
                {slotsLoading ? (
                  <Loader2 className="animate-spin text-gold" />
                ) : availability?.is_day_off ? (
                  <p className="text-sm text-wine">
                    {barber?.name} descansa ese día. Elige otra fecha.
                  </p>
                ) : availability && availability.slots.length === 0 ? (
                  <p className="text-sm text-bone-2">
                    No quedan horarios ese día. Prueba otra fecha.
                  </p>
                ) : (
                  <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1">
                    {availability?.slots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setTime(slot)}
                        className={`rounded-sm border px-3 py-2.5 text-sm transition-colors ${
                          time === slot
                            ? "border-gold bg-gold text-ink"
                            : "border-ink-3 bg-ink-2 text-bone hover:border-gold/50"
                        }`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mx-auto max-w-md space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-sm text-bone-2">Tu nombre</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre y apellido"
                  className="focus-gold w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3 text-bone placeholder:text-bone-2/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-bone-2">WhatsApp</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="300 123 4567"
                  inputMode="tel"
                  className="focus-gold w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3 text-bone placeholder:text-bone-2/50"
                />
                <span className="mt-1.5 block text-xs text-bone-2/70">
                  Te enviaremos la confirmación y el recordatorio a este número.
                </span>
              </label>
            </div>
          )}

          {step === 4 && barber && (
            <div className="mx-auto max-w-md rounded-sm border border-ink-3 bg-ink-2 p-6">
              <h3 className="display mb-5 text-2xl text-gold">Resumen de tu turno</h3>
              <dl className="space-y-3 text-sm">
                <Row label="Barbero" value={barber.name} />
                <Row
                  label="Servicios"
                  value={totals.chosen.map((s) => s.name).join(", ")}
                />
                <Row label="Fecha" value={date ?? ""} />
                <Row label="Hora" value={`${time} (${totals.minutes} min aprox.)`} />
                <Row label="Nombre" value={name} />
                <Row label="WhatsApp" value={phone} />
                <div className="border-t border-ink-3 pt-3">
                  <Row
                    label="Total"
                    value={<span className="display text-xl text-gold">{formatCOP(totals.price)}</span>}
                  />
                </div>
              </dl>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navegación */}
      <div className="mt-10 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-2 text-sm text-bone-2 transition-colors hover:text-bone disabled:invisible"
        >
          <ArrowLeft size={16} /> Atrás
        </button>
        {step < 4 ? (
          <button
            onClick={() => canContinue && setStep((s) => s + 1)}
            disabled={!canContinue}
            className="display flex items-center gap-2 rounded-sm bg-gold px-8 py-3 text-lg text-ink transition-all enabled:hover:scale-[1.03] disabled:opacity-40"
          >
            Continuar <ArrowRight size={18} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting}
            className="display flex items-center gap-2 rounded-sm bg-gold px-8 py-3 text-lg text-ink transition-all enabled:hover:scale-[1.03] disabled:opacity-60"
          >
            {submitting && <Loader2 className="animate-spin" size={18} />}
            Confirmar turno
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-bone-2">{label}</dt>
      <dd className="text-right text-bone">{value}</dd>
    </div>
  );
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function Calendar({
  month,
  onMonthChange,
  selected,
  isSelectable,
  onSelect,
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  selected: string | null;
  isSelectable: (candidate: Date) => boolean;
  onSelect: (isoDate: string) => void;
}) {
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];

  return (
    <div className="rounded-sm border border-ink-3 bg-ink-2 p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="p-1 text-bone-2 transition-colors hover:text-gold"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="display text-lg text-bone">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </p>
        <button
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="p-1 text-bone-2 transition-colors hover:text-gold"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-bone-2">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {cells.map((cell, i) =>
          cell === null ? (
            <span key={`empty-${i}`} />
          ) : (
            <CalendarDay
              key={cell.toISOString()}
              day={cell}
              selected={selected}
              selectable={isSelectable(cell)}
              onSelect={onSelect}
            />
          ),
        )}
      </div>
    </div>
  );
}

function CalendarDay({
  day,
  selected,
  selectable,
  onSelect,
}: {
  day: Date;
  selected: string | null;
  selectable: boolean;
  onSelect: (isoDate: string) => void;
}) {
  const iso = toISODate(day);
  return (
    <button
      disabled={!selectable}
      onClick={() => onSelect(iso)}
      className={`aspect-square rounded-sm text-sm transition-colors ${
        selected === iso
          ? "bg-gold text-ink"
          : selectable
            ? "text-bone hover:bg-ink-3"
            : "cursor-not-allowed text-bone-2/25 line-through"
      }`}
    >
      {day.getDate()}
    </button>
  );
}

function Confirmation({ appointment }: { appointment: AppointmentPublic }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-md px-5 pb-24 text-center"
    >
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
        <Check size={32} className="text-ink" />
      </div>
      <h2 className="display text-4xl text-bone">¡Turno confirmado!</h2>
      <p className="mt-3 text-bone-2">
        {appointment.customer_name}, te esperamos el{" "}
        <span className="text-bone">{appointment.date_local}</span> a las{" "}
        <span className="text-bone">{appointment.time_local}</span> con{" "}
        <span className="text-bone">{appointment.barber_name}</span>.
      </p>
      <div className="mt-8 rounded-sm border border-ink-3 bg-ink-2 p-6">
        <p className="text-xs uppercase tracking-widest text-bone-2">Turno del día</p>
        <p className="display mt-1 text-5xl text-gold">#{appointment.daily_number}</p>
        <p className="mt-4 text-xs uppercase tracking-widest text-bone-2">Código de gestión</p>
        <p className="display mt-1 text-3xl tracking-[0.2em] text-bone">
          {appointment.manage_code}
        </p>
        <p className="mt-4 text-xs text-bone-2/70">
          Guarda este código: con él puedes consultar o cancelar tu turno. También te
          lo enviaremos por WhatsApp.
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/turno/${appointment.manage_code}`}
          className="display rounded-sm bg-gold px-6 py-3 text-lg text-ink"
        >
          Ver mi turno
        </Link>
        <Link href="/" className="text-sm text-bone-2 transition-colors hover:text-gold">
          Volver al inicio
        </Link>
      </div>
    </motion.div>
  );
}

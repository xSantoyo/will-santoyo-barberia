"use client";

/**
 * Wizard de agendamiento — 5 pasos (sección 7 del spec):
 *   1. Barbero  2. Servicio(s)  3. Fecha y hora  4. Datos  5. Confirmación
 *
 * El calendario deshabilita: días de descanso semanal del barbero, excepciones
 * puntuales (time-off), fechas pasadas y fuera del horizonte de reserva.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { ApiError, mediaUrl, publicApi } from "@/lib/api";
import { RazorReveal } from "@/components/public/Razor";
import AddToCalendar from "@/components/public/AddToCalendar";
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

/** En móvil el wizard se comporta como flujo nativo: auto-avanza en las
 * selecciones únicas (barbero, hora) y hace scroll al contenido relevante. */
function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

export default function Wizard() {
  const params = useSearchParams();
  const [step, setStepRaw] = useState(0);
  const slotsPanelRef = useRef<HTMLDivElement | null>(null);

  // Cada paso arranca desde arriba (sensación de pantalla nueva en móvil)
  const setStep = useCallback((next: number | ((s: number) => number)) => {
    setStepRaw(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);
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
  // Tanda 4: parche (turnos seguidos) y códigos de crecimiento
  const [companions, setCompanions] = useState<string[]>([]);
  const [giftCode, setGiftCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [codesOpen, setCodesOpen] = useState(false);
  const [groupExtras, setGroupExtras] = useState<AppointmentPublic[]>([]);

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
        // Preselección de servicios (?servicios=1,2) para repetir/compartir
        const preServices = params.get("servicios");
        if (preServices) {
          const valid = preServices
            .split(",")
            .map(Number)
            .filter((id) => loadedServices.some((s) => s.id === id));
          if (valid.length > 0) setSelectedServices(valid);
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
        .availability(barber.id, isoDate, selectedServices, 1 + companions.length)
        .then(setAvailability)
        .catch(() => setAvailability(null))
        .finally(() => setSlotsLoading(false));
    },
    [barber, selectedServices, companions.length],
  );

  function selectDate(isoDate: string) {
    setDate(isoDate);
    loadSlots(isoDate);
    // En móvil el panel de horarios queda bajo el calendario: llevar al usuario
    if (isMobileViewport()) {
      setTimeout(() => {
        slotsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }

  function selectBarber(candidate: BarberPublic) {
    setBarber(candidate);
    if (isMobileViewport()) {
      setTimeout(() => setStep(1), 280); // selección única → avance nativo
    }
  }

  function selectTime(slot: string) {
    setTime(slot);
    if (isMobileViewport()) {
      setTimeout(() => setStep(3), 280);
    }
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
      if (companions.length > 0) {
        // Parche: turnos seguidos, todo o nada
        const group = await publicApi.bookGroup({
          barber_id: barber.id,
          date,
          time,
          customer_whatsapp: phone.trim(),
          customers: [
            { name: name.trim(), service_ids: selectedServices },
            ...companions.map((companion) => ({
              name: companion.trim(),
              service_ids: selectedServices,
            })),
          ],
        });
        setGroupExtras(group.appointments.slice(1));
        setConfirmed(group.appointments[0]);
        return;
      }
      const appointment = await publicApi.book({
        barber_id: barber.id,
        service_ids: selectedServices,
        date,
        time,
        customer_name: name.trim(),
        customer_whatsapp: phone.trim(),
        gift_code: giftCode.trim() || null,
        referral_code: referralCode.trim() || null,
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
    return <Confirmation appointment={confirmed} groupExtras={groupExtras} />;
  }

  const companionsReady = companions.every((companion) => companion.trim().length >= 2);
  const canContinue =
    (step === 0 && barber !== null) ||
    (step === 1 && selectedServices.length > 0) ||
    (step === 2 && date !== null && time !== null) ||
    (step === 3 &&
      name.trim().length >= 2 &&
      phone.replace(/\D/g, "").length >= 10 &&
      companionsReady) ||
    step === 4;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-32 sm:pb-24">
      {/* Stepper móvil: compacto, tipo app nativa */}
      <div className="mb-3 flex items-baseline justify-between sm:hidden">
        <span className="data text-[11px] uppercase tracking-[0.25em] text-gold">
          Paso {step + 1}/{STEPS.length}
        </span>
        <span className="display text-2xl text-bone">{STEPS[step]}</span>
      </div>

      {/* Stepper desktop: círculos con etiquetas */}
      <ol className="mb-3 hidden items-center gap-1 text-[11px] uppercase tracking-wider sm:flex sm:gap-2 sm:text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col items-center gap-2">
            <motion.span
              animate={{ scale: i === step ? 1.12 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${
                i < step
                  ? "border-gold bg-gold text-ink"
                  : i === step
                    ? "border-gold text-gold shadow-[0_0_16px_rgba(201,162,75,0.25)]"
                    : "border-ink-3 text-bone-2"
              }`}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </motion.span>
            <span className={i === step ? "text-gold" : "text-bone-2/70"}>{label}</span>
          </li>
        ))}
      </ol>
      {/* Línea de avance dorada */}
      <div className="mb-10 h-0.5 w-full overflow-hidden rounded-full bg-ink-3">
        <motion.div
          className="h-full bg-gold"
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        />
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-wine bg-wine/15 px-4 py-3 text-sm text-bone">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 42 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -42 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
              {barbers.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => selectBarber(candidate)}
                  className={`group clip-corner flex items-center gap-4 overflow-hidden border p-3 text-left transition-all duration-300 active:scale-[0.98] sm:block sm:p-0 ${
                    barber?.id === candidate.id
                      ? "border-gold bg-gold/10 sm:bg-ink-2"
                      : "border-ink-3 bg-ink-2 hover:border-gold/50 sm:hover:-translate-y-1"
                  }`}
                >
                  {/* Móvil: tarjeta horizontal compacta (zona táctil ancha);
                      desktop: tarjeta vertical con foto grande */}
                  <div className="grain relative h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-ink-3 sm:aspect-square sm:h-auto sm:w-full sm:rounded-none">
                    {candidate.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl(candidate.photo_url) ?? ""}
                        alt={candidate.name}
                        className="h-full w-full object-cover grayscale transition duration-500 group-hover:grayscale-0"
                      />
                    ) : (
                      <div className="texture-pinstripe flex h-full items-center justify-center">
                        <span className="display text-outline text-4xl sm:text-8xl">
                          {candidate.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 sm:p-4">
                    <p className="display text-xl text-bone">{candidate.name}</p>
                    <p className="mt-1 truncate text-xs text-bone-2 sm:whitespace-normal">
                      {candidate.specialty}
                    </p>
                  </div>
                  <span
                    className={`ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full border sm:hidden ${
                      barber?.id === candidate.id
                        ? "border-gold bg-gold text-ink"
                        : "border-ink-3 text-transparent"
                    }`}
                  >
                    <Check size={15} />
                  </span>
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
                    className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-sm border px-4 py-4 text-left transition-all duration-200 active:scale-[0.99] sm:px-5 ${
                      active ? "border-gold bg-gold/10" : "border-ink-3 bg-ink-2 hover:border-gold/40"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-base text-bone">{service.name}</span>
                      <span className="text-xs text-bone-2">{service.duration_min} min</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="data text-lg font-semibold text-gold">
                        {formatCOP(service.price_cop)}
                      </span>
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                          active ? "border-gold bg-gold text-ink" : "border-ink-3"
                        }`}
                      >
                        {active && <Check size={15} />}
                      </span>
                    </span>
                  </button>
                );
              })}
              {totals.chosen.length > 0 && (
                <p className="pt-2 text-right text-sm text-bone-2">
                  Total{companions.length > 0 ? ` × ${1 + companions.length} personas` : ""}:{" "}
                  <span className="data text-lg font-semibold text-gold">
                    {formatCOP(totals.price * (1 + companions.length))}
                  </span>
                  {" · "}
                  <span className="data">{totals.minutes * (1 + companions.length)} min</span>
                </p>
              )}

              {/* Parche: turnos seguidos con el mismo barbero */}
              <div className="mt-4 rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5">
                <p className="data text-[11px] uppercase tracking-[0.25em] text-bone-2">
                  ¿Cuántos se cortan? <span className="text-gold">turnos seguidos</span>
                </p>
                <div className="mt-2.5 flex gap-2">
                  {[1, 2, 3].map((size) => (
                    <button
                      key={size}
                      onClick={() =>
                        setCompanions(Array.from({ length: size - 1 }, (_, i) => companions[i] ?? ""))
                      }
                      className={`data min-h-11 flex-1 rounded-sm border text-sm transition-all active:scale-95 ${
                        companions.length === size - 1
                          ? "border-gold bg-gold/10 text-gold"
                          : "border-ink-3 text-bone-2 hover:border-gold/40"
                      }`}
                    >
                      {size === 1 ? "Solo yo" : `${size} personas`}
                    </button>
                  ))}
                </div>
                {companions.length > 0 && (
                  <p className="mt-2 text-[11px] text-bone-2/70">
                    Mismos servicios para todos, uno detrás del otro (padre e hijo, parche).
                  </p>
                )}
              </div>
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
              <div ref={slotsPanelRef} className="scroll-mt-4">
                <p className="data mb-3 text-sm uppercase tracking-widest text-bone-2">
                  {date ? `Horarios · ${date}` : "Elige un día"}
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
                  <div className="grid max-h-80 grid-cols-3 gap-2.5 overflow-y-auto pr-1">
                    {availability?.slots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => selectTime(slot)}
                        className={`data min-h-12 rounded-sm border px-3 text-base transition-all duration-150 active:scale-95 sm:min-h-0 sm:py-2.5 sm:text-sm ${
                          time === slot
                            ? "border-gold bg-gold text-ink shadow-[0_0_16px_rgba(201,162,75,0.3)]"
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
              {/* text-base (16px) evita el zoom automático de iOS al enfocar */}
              <label className="block">
                <span className="mb-1.5 block text-sm text-bone-2">Tu nombre</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre y apellido"
                  autoComplete="name"
                  className="focus-gold min-h-13 w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5 text-base text-bone placeholder:text-bone-2/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-bone-2">WhatsApp</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="300 123 4567"
                  inputMode="tel"
                  autoComplete="tel"
                  className="focus-gold min-h-13 w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5 text-base text-bone placeholder:text-bone-2/50"
                />
                <span className="mt-1.5 block text-xs text-bone-2/70">
                  Solo lo usamos si necesitamos contactarte por tu turno.
                </span>
              </label>

              {/* Nombres del parche */}
              {companions.map((companion, index) => (
                <label key={index} className="block">
                  <span className="mb-1.5 block text-sm text-bone-2">
                    Acompañante {index + 1}
                  </span>
                  <input
                    value={companion}
                    onChange={(e) =>
                      setCompanions((current) =>
                        current.map((c, i) => (i === index ? e.target.value : c)),
                      )
                    }
                    placeholder="Su nombre"
                    className="focus-gold min-h-13 w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5 text-base text-bone placeholder:text-bone-2/50"
                  />
                </label>
              ))}

              {/* Códigos de regalo / amigo (solo reservas individuales) */}
              {companions.length === 0 && (
                <div className="rounded-sm border border-ink-3 bg-ink-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setCodesOpen(!codesOpen)}
                    className="data w-full text-left text-[11px] uppercase tracking-[0.25em] text-bone-2 transition-colors hover:text-gold"
                  >
                    ¿Tienes código de regalo o de amigo? {codesOpen ? "−" : "+"}
                  </button>
                  {codesOpen && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs text-bone-2">Regalo</span>
                        <input
                          value={giftCode}
                          onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                          placeholder="G-XXXXXX"
                          className="focus-gold data min-h-12 w-full rounded-sm border border-ink-3 bg-ink px-3 text-sm uppercase text-bone placeholder:text-bone-2/40"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-bone-2">Código de amigo</span>
                        <input
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                          placeholder="BB-XXXX"
                          className="focus-gold data min-h-12 w-full rounded-sm border border-ink-3 bg-ink px-3 text-sm uppercase text-bone placeholder:text-bone-2/40"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
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
                {companions.length > 0 && (
                  <Row
                    label="Parche"
                    value={`${name}${companions.length ? ", " + companions.join(", ") : ""} (turnos seguidos)`}
                  />
                )}
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

      {/* Navegación: barra fija inferior en móvil (zona del pulgar),
          en línea en desktop */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-3 bg-ink/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="-m-2 flex min-h-12 items-center gap-2 p-2 text-sm text-bone-2 transition-colors hover:text-bone disabled:invisible"
          >
            <ArrowLeft size={16} /> Atrás
          </button>
          {step < 4 ? (
            <motion.button
              whileHover={canContinue ? { scale: 1.03 } : undefined}
              whileTap={canContinue ? { scale: 0.96 } : undefined}
              onClick={() => canContinue && setStep((s) => s + 1)}
              disabled={!canContinue}
              className="display flex min-h-13 flex-1 items-center justify-center gap-2 rounded-sm bg-gold px-8 text-lg text-ink transition-shadow enabled:hover:shadow-[0_0_24px_rgba(201,162,75,0.3)] disabled:opacity-40 sm:flex-none"
            >
              Continuar <ArrowRight size={18} />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={submit}
              disabled={submitting}
              className="display flex min-h-13 flex-1 items-center justify-center gap-2 rounded-sm bg-gold px-8 text-lg text-ink transition-shadow enabled:hover:shadow-[0_0_24px_rgba(201,162,75,0.3)] disabled:opacity-60 sm:flex-none"
            >
              {submitting && <Loader2 className="animate-spin" size={18} />}
              Confirmar turno
            </motion.button>
          )}
        </div>
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
          className="flex h-11 w-11 items-center justify-center text-bone-2 transition-colors hover:text-gold"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="display text-lg text-bone">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </p>
        <button
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="flex h-11 w-11 items-center justify-center text-bone-2 transition-colors hover:text-gold"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={20} />
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
      className={`aspect-square min-h-10 rounded-sm text-base transition-all duration-150 sm:text-sm ${
        selected === iso
          ? "scale-105 bg-gold text-ink shadow-[0_0_14px_rgba(201,162,75,0.35)]"
          : selectable
            ? "text-bone hover:bg-ink-3 active:scale-95"
            : "cursor-not-allowed text-bone-2/25 line-through"
      }`}
    >
      {day.getDate()}
    </button>
  );
}

function Confirmation({
  appointment,
  groupExtras = [],
}: {
  appointment: AppointmentPublic;
  groupExtras?: AppointmentPublic[];
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(appointment.manage_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard no disponible (http antiguo): el código sigue visible */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-md px-5 pb-24 text-center"
    >
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
        <Check size={32} className="text-ink" />
      </div>
      <h2 className="display text-4xl text-bone">
        {appointment.status === "pendiente" ? "¡Turno apartado!" : "¡Turno confirmado!"}
      </h2>
      <p className="mt-2 text-lg text-gold">
        {appointment.status === "pendiente"
          ? `Falta un paso, ${appointment.customer_name.split(" ")[0]}.`
          : `La silla es tuya, ${appointment.customer_name.split(" ")[0]}.`}
      </p>
      <p className="mt-2 text-bone-2">
        Te esperamos el <span className="data text-bone">{appointment.date_local}</span> a las{" "}
        <span className="data text-bone">{appointment.time_local}</span> con{" "}
        <span className="text-bone">{appointment.barber_name}</span>.
      </p>

      {/* Anticipo (si el negocio lo exige): asegurar la silla pagando */}
      {appointment.payment && appointment.payment.checkout_url && (
        <div className="clip-corner mt-8 border-2 border-gold bg-gold/10 p-5">
          <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
            Asegura tu silla
          </p>
          <p className="mt-2 text-sm text-bone">
            Tu turno quedó apartado. Págalo con el anticipo de{" "}
            <span className="data font-semibold text-gold">
              {formatCOP(appointment.payment.amount_cop)}
            </span>{" "}
            (se descuenta del corte) — tienes 30 minutos antes de que el hueco se
            libere.
          </p>
          <a
            href={appointment.payment.checkout_url}
            className="display mx-auto mt-4 flex min-h-13 w-full max-w-xs items-center justify-center rounded-sm bg-gold px-8 text-lg text-ink transition-all hover:scale-[1.02] active:scale-95"
          >
            Pagar anticipo
          </a>
          <p className="data mt-2 text-center text-[10px] uppercase tracking-wider text-bone-2">
            Nequi · PSE · Tarjetas — vía Wompi
          </p>
        </div>
      )}

      {/* EL MOMENTO SEÑAL: la navaja abre la placa y el código queda troquelado.
          Es el único medio de gestión del turno: protagonista absoluto. */}
      <div className="plate clip-corner mt-8 p-5 sm:p-6">
        <p className="data text-xs uppercase tracking-[0.3em] text-gold">
          Tu código de gestión
        </p>
        <RazorReveal code={appointment.manage_code} className="mt-4">
          <div className="texture-pinstripe h-28 rounded-sm border border-ink-3 bg-ink/60" />
        </RazorReveal>
        <button
          onClick={copyCode}
          className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-sm border border-gold px-5 text-sm text-gold transition-colors hover:bg-gold hover:text-ink"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "¡Copiado!" : "Copiar código"}
        </button>
        <p className="mt-5 flex items-start gap-2 text-left text-sm text-bone">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-gold" />
          <span>
            <strong>Guarda este código:</strong> lo necesitas para consultar o
            cancelar tu turno. Tómale una captura de pantalla o cópialo ahora —
            no se envía por ningún otro medio.
          </span>
        </p>
      </div>

      <div className="clip-corner mt-6 border border-ink-3 bg-ink-2 px-6 py-4">
        <p className="data text-xs uppercase tracking-widest text-bone-2">Turno del día</p>
        <p className="data mt-1 text-4xl font-semibold text-gold">
          #{appointment.daily_number}
        </p>
      </div>

      {appointment.gift_description && (
        <p className="data mt-4 rounded-sm border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          🎁 Regalo aplicado: {appointment.gift_description} — se redime en el local
        </p>
      )}

      {groupExtras.length > 0 && (
        <div className="clip-corner mt-4 border border-ink-3 bg-ink-2 p-4 text-left">
          <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
            Los turnos del parche
          </p>
          <ul className="mt-2 space-y-2">
            {groupExtras.map((extra) => (
              <li
                key={extra.manage_code}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-bone">
                  {extra.customer_name} ·{" "}
                  <span className="data text-gold">{extra.time_local}</span>
                </span>
                <span className="data selectable tracking-[0.2em] text-bone">
                  {extra.manage_code}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-bone-2/70">
            Cada uno gestiona su turno con su propio código.
          </p>
        </div>
      )}

      <div className="mt-4">
        <AddToCalendar
          event={{
            title: `Bad Boys Barbershop — turno #${appointment.daily_number}`,
            dateLocal: appointment.date_local,
            timeLocal: appointment.time_local,
            durationMin: appointment.services.reduce((sum, s) => sum + s.duration_min, 0) || 45,
            description: `Con ${appointment.barber_name}. Código de gestión: ${appointment.manage_code}. Gestiona tu turno: ${typeof window !== "undefined" ? window.location.origin : ""}/turno/${appointment.manage_code}`,
            location: "Bad Boys Barbershop",
          }}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/turno/${appointment.manage_code}`}
          className="display rounded-sm bg-gold px-6 py-3 text-lg text-ink"
        >
          Ver mi tiquete vivo
        </Link>
        <Link
          href="/hoy"
          className="data text-xs uppercase tracking-widest text-bone-2 transition-colors hover:text-gold"
        >
          ¿Cómo va la fila hoy? →
        </Link>
        <Link href="/" className="text-sm text-bone-2 transition-colors hover:text-gold">
          Volver al inicio
        </Link>
      </div>
    </motion.div>
  );
}

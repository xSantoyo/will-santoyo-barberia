"use client";

/**
 * Reservar con Will — 3 pasos:
 *   1. Servicio(s)   2. Fecha y hora   3. Tus datos (con el resumen dentro)
 *
 * No hay paso de "elegir profesional": atiende Will y nadie más.
 *
 * Movimiento (skill `animate`): la transición entre pasos lleva DIRECCIÓN —
 * avanzar entra por la derecha, retroceder por la izquierda — porque la
 * consistencia espacial es lo que hace legible un flujo por pasos. 220 ms con
 * ease-out fuerte: por debajo del techo de 300 ms de UI, y arrancando rápido,
 * que es el instante que el usuario mira. Nada de ease-in.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import clsx from "clsx";
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
import { ApiError, publicApi } from "@/lib/api";
import { track } from "@/lib/analytics";
import { HoneypotField, Turnstile, turnstileEnabled } from "@/components/security/BotShield";
import { RazorReveal } from "@/components/public/Razor";
import AddToCalendar from "@/components/public/AddToCalendar";
import WhatsAppConfirm from "@/components/public/WhatsAppConfirm";
import { DIRECCION_COMPLETA, NEGOCIO } from "@/lib/negocio";
import {
  formatCOP,
  WEEKDAY_KEYS,
  type AppointmentPublic,
  type DayAvailability,
  type ProfessionalPublic,
  type ServicePublic,
} from "@/lib/types";

const STEPS = ["Servicio", "Fecha y hora", "Tus datos"];
const LAST_STEP = STEPS.length - 1;
const HORIZON_DAYS = 30;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
}

export default function Wizard() {
  const params = useSearchParams();
  const reduce = useReducedMotion();
  // El signo guarda hacia dónde va el paso: la transición necesita dirección.
  const [[step, direction], setStepState] = useState<[number, number]>([0, 1]);
  const slotsPanelRef = useRef<HTMLDivElement | null>(null);

  const goTo = useCallback((next: number) => {
    setStepState(([current]) => [next, next > current ? 1 : -1]);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    track("wizard_iniciado");
  }, []);
  useEffect(() => {
    if (step > 0) track("wizard_paso", { paso: step + 1 });
  }, [step]);

  const [professional, setProfessional] = useState<ProfessionalPublic | null>(null);
  const [services, setServices] = useState<ServicePublic[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [giftCode, setGiftCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [codesOpen, setCodesOpen] = useState(false);
  const [groupExtras, setGroupExtras] = useState<AppointmentPublic[]>([]);

  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [timeOffDates, setTimeOffDates] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<DayAvailability | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [website, setWebsite] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<AppointmentPublic | null>(null);

  useEffect(() => {
    Promise.all([publicApi.professional(), publicApi.services()])
      .then(([loadedProfessional, loadedServices]) => {
        setProfessional(loadedProfessional);
        setServices(loadedServices);
        const preServices = params.get("servicios");
        if (preServices) {
          const valid = preServices
            .split(",")
            .map(Number)
            .filter((id) => loadedServices.some((s) => s.id === id));
          if (valid.length > 0) setSelectedServices(valid);
        }
      })
      .catch(() =>
        toast.error("No pudimos cargar la agenda", {
          description: "Revisa tu conexión e intenta de nuevo en un momento.",
        }),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Descansos puntuales del horizonte visible, para pintar el calendario
  useEffect(() => {
    const start = toISODate(today);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + HORIZON_DAYS);
    publicApi
      .timeOff(start, toISODate(endDate))
      .then((response) => setTimeOffDates(new Set(response.dates)))
      .catch(() => setTimeOffDates(new Set()));
  }, [today]);

  const totals = useMemo(() => {
    const chosen = services.filter((s) => selectedServices.includes(s.id));
    return {
      chosen,
      price: chosen.reduce((sum, s) => sum + s.price_cop, 0),
      minutes: chosen.reduce((sum, s) => sum + s.duration_min, 0),
    };
  }, [services, selectedServices]);

  const party = 1 + companions.length;

  const loadSlots = useCallback(
    (isoDate: string) => {
      if (selectedServices.length === 0) return;
      setSlotsLoading(true);
      setTime(null);
      publicApi
        .availability(isoDate, selectedServices, party)
        .then(setAvailability)
        .catch(() => setAvailability(null))
        .finally(() => setSlotsLoading(false));
    },
    [selectedServices, party],
  );

  function selectDate(isoDate: string) {
    setDate(isoDate);
    loadSlots(isoDate);
    if (isMobileViewport()) {
      setTimeout(() => {
        slotsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  }

  function selectTime(slot: string) {
    setTime(slot);
    if (isMobileViewport()) setTimeout(() => goTo(2), 260);
  }

  function isSelectableDay(candidate: Date): boolean {
    if (!professional) return false;
    const iso = toISODate(candidate);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const horizon = new Date(startOfToday);
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);
    if (candidate < startOfToday || candidate > horizon) return false;
    const weekday = WEEKDAY_KEYS[(candidate.getDay() + 6) % 7]; // JS: 0=Dom → clave lun-dom
    if (!professional.schedule?.[weekday]) return false;
    return !timeOffDates.has(iso);
  }

  async function submit() {
    if (!date || !time) return;
    if (turnstileEnabled() && !captchaToken) {
      toast.warning("Falta la verificación", {
        description: "Completa el paso anti-bot para confirmar tu turno.",
      });
      return;
    }
    setSubmitting(true);
    try {
      if (companions.length > 0) {
        const group = await publicApi.bookGroup({
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
          website,
          captcha_token: captchaToken,
        });
        track("reserva_completada", {
          servicios: selectedServices.length,
          parche: party,
          con_correo: Boolean(email.trim()),
        });
        toast.success("¡Turnos apartados!", {
          description: `${party} turnos seguidos el ${date} desde las ${time}.`,
        });
        setGroupExtras(group.appointments.slice(1));
        setConfirmed(group.appointments[0]);
        return;
      }
      const appointment = await publicApi.book({
        service_ids: selectedServices,
        date,
        time,
        customer_name: name.trim(),
        customer_whatsapp: phone.trim(),
        customer_email: email.trim() || null,
        gift_code: giftCode.trim() || null,
        referral_code: referralCode.trim() || null,
        website,
        captcha_token: captchaToken,
      });
      track("reserva_completada", {
        servicios: selectedServices.length,
        parche: 1,
        con_correo: Boolean(email.trim()),
      });
      toast.success("¡La silla es tuya!", {
        description: `Te esperamos el ${appointment.date_local} a las ${appointment.time_local}.`,
      });
      setConfirmed(appointment);
    } catch (err) {
      track("reserva_fallida", {
        codigo: err instanceof ApiError ? err.code : "desconocido",
      });
      // Colisión: alguien ganó el horario entre que lo elegiste y confirmaste.
      // Se devuelve al paso de horarios con la lista ya refrescada, y todo lo
      // demás que llenaste sigue en su sitio.
      if (err instanceof ApiError && err.code === "overlap") {
        toast.error("Ese horario acaba de ocuparse", {
          description: "Te dejamos los horarios libres de ese día. Elige otro.",
        });
        goTo(1);
        loadSlots(date);
      } else if (err instanceof ApiError && err.code === "day_off") {
        toast.error("Will no atiende ese día", { description: "Elige otra fecha." });
        goTo(1);
      } else {
        toast.error("No pudimos crear la reserva", {
          description:
            err instanceof Error
              ? err.message
              : "Revisa tu conexión e intenta de nuevo; no perdiste nada de lo que llenaste.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------- render

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-copper">
        <Loader2 className="animate-spin" size={32} />
        <span className="sr-only">Cargando la agenda</span>
      </div>
    );
  }

  if (confirmed) {
    return (
      <Confirmation
        appointment={confirmed}
        groupExtras={groupExtras}
        email={email.trim() || null}
      />
    );
  }

  const companionsReady = companions.every((companion) => companion.trim().length >= 2);
  const canContinue =
    (step === 0 && selectedServices.length > 0) ||
    (step === 1 && date !== null && time !== null) ||
    (step === 2 &&
      name.trim().length >= 2 &&
      phone.replace(/\D/g, "").length >= 10 &&
      companionsReady);

  // Reduced motion: se conserva el fundido (ayuda a entender que cambió el
  // paso) y se quita el desplazamiento, que es lo vestibular.
  const stepVariants = {
    enter: (d: number) => ({
      opacity: 0,
      transform: reduce ? "translateX(0px)" : `translateX(${d > 0 ? 32 : -32}px)`,
    }),
    center: { opacity: 1, transform: "translateX(0px)" },
    exit: (d: number) => ({
      opacity: 0,
      transform: reduce ? "translateX(0px)" : `translateX(${d > 0 ? -32 : 32}px)`,
    }),
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-32 sm:pb-24">
      <Stepper step={step} />

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={step}
          custom={direction}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          {step === 0 && (
            <ServiceStep
              services={services}
              selected={selectedServices}
              onToggle={(id) =>
                setSelectedServices((current) =>
                  current.includes(id)
                    ? current.filter((s) => s !== id)
                    : [...current, id],
                )
              }
              totals={totals}
              companions={companions}
              setCompanions={setCompanions}
            />
          )}

          {step === 1 && (
            <div className="grid gap-8 md:grid-cols-2">
              <Calendar
                month={month}
                onMonthChange={setMonth}
                selected={date}
                isSelectable={isSelectableDay}
                onSelect={selectDate}
              />
              <SlotPanel
                ref={slotsPanelRef}
                date={date}
                loading={slotsLoading}
                availability={availability}
                selected={time}
                onSelect={selectTime}
              />
            </div>
          )}

          {step === 2 && (
            <DetailsStep
              name={name}
              setName={setName}
              phone={phone}
              setPhone={setPhone}
              email={email}
              setEmail={setEmail}
              companions={companions}
              setCompanions={setCompanions}
              codesOpen={codesOpen}
              setCodesOpen={setCodesOpen}
              giftCode={giftCode}
              setGiftCode={setGiftCode}
              referralCode={referralCode}
              setReferralCode={setReferralCode}
              website={website}
              setWebsite={setWebsite}
              setCaptchaToken={setCaptchaToken}
              summary={{ totals, date, time, party }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navegación: barra fija en la zona del pulgar en móvil, en línea en desktop */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-night/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mt-10 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <button
            onClick={() => goTo(Math.max(0, step - 1))}
            disabled={step === 0}
            className="-m-2 flex min-h-12 items-center gap-2 p-2 text-sm text-smoke transition-colors duration-150 hover:text-chalk disabled:invisible"
          >
            <ArrowLeft size={16} /> Atrás
          </button>
          {step < LAST_STEP ? (
            <button
              onClick={() => canContinue && goTo(step + 1)}
              disabled={!canContinue}
              className={clsx(
                "display flex min-h-13 flex-1 items-center justify-center gap-2 rounded-sm bg-copper px-8 text-lg text-on-copper sm:flex-none",
                "transition-transform duration-150 ease-[var(--ease-out)]",
                "enabled:active:scale-[0.97] disabled:opacity-40",
              )}
            >
              Continuar <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || !canContinue}
              className={clsx(
                "display flex min-h-13 flex-1 items-center justify-center gap-2 rounded-sm bg-copper px-8 text-lg text-on-copper sm:flex-none",
                "transition-transform duration-150 ease-[var(--ease-out)]",
                "enabled:active:scale-[0.97] disabled:opacity-40",
              )}
            >
              {submitting && <Loader2 className="animate-spin" size={18} />}
              {submitting ? "Apartando…" : "Reservar con Will"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pasos */

function Stepper({ step }: { step: number }) {
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between sm:hidden">
        <span className="data text-[11px] uppercase tracking-[0.25em] text-copper">
          Paso {step + 1} de {STEPS.length}
        </span>
        <span className="display text-2xl text-chalk">{STEPS[step]}</span>
      </div>

      <ol className="mb-3 hidden items-center gap-2 text-xs uppercase tracking-wider sm:flex">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 flex-col items-center gap-2">
            <span
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-full border text-sm",
                "transition-colors duration-200",
                i < step && "border-copper bg-copper text-on-copper",
                i === step && "border-copper text-copper shadow-[0_0_16px_rgba(42,70,150,0.25)]",
                i > step && "border-edge text-smoke",
              )}
            >
              {i < step ? <Check size={14} /> : i + 1}
            </span>
            <span className={i === step ? "text-copper" : "text-smoke/70"}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="mb-10 h-0.5 w-full overflow-hidden rounded-full bg-ash">
        <motion.div
          className="h-full bg-copper"
          animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        />
      </div>
    </>
  );
}

type Totals = { chosen: ServicePublic[]; price: number; minutes: number };

function ServiceStep({
  services,
  selected,
  onToggle,
  totals,
  companions,
  setCompanions,
}: {
  services: ServicePublic[];
  selected: number[];
  onToggle: (id: number) => void;
  totals: Totals;
  companions: string[];
  setCompanions: (next: string[]) => void;
}) {
  const party = 1 + companions.length;
  return (
    <div className="space-y-3">
      {services.map((service, index) => {
        const active = selected.includes(service.id);
        return (
          <motion.button
            key={service.id}
            initial={{ opacity: 0, transform: "translateY(8px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            // Escalonado corto (40 ms): cascada legible sin sensación de lentitud
            transition={{ delay: index * 0.04, duration: 0.24, ease: EASE_OUT }}
            onClick={() => onToggle(service.id)}
            aria-pressed={active}
            className={clsx(
              "flex min-h-16 w-full items-center justify-between gap-3 rounded-sm border px-4 py-4 text-left sm:px-5",
              "transition-[border-color,background-color,transform] duration-150 ease-[var(--ease-out)]",
              "active:scale-[0.99]",
              active ? "border-copper bg-copper/10" : "border-edge bg-coal",
              !active && "hover:border-copper/40",
            )}
          >
            <span className="min-w-0">
              <span className="block text-base text-chalk">{service.name}</span>
              <span className="text-xs text-smoke">{service.duration_min} min</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="data text-lg font-semibold text-copper">
                {formatCOP(service.price_cop)}
              </span>
              <span
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-150",
                  active ? "border-copper bg-copper text-on-copper" : "border-edge",
                )}
              >
                {active && <Check size={15} />}
              </span>
            </span>
          </motion.button>
        );
      })}

      {totals.chosen.length > 0 && (
        <p className="pt-2 text-right text-sm text-smoke">
          Total{party > 1 ? ` × ${party} personas` : ""}:{" "}
          <span className="data text-lg font-semibold text-copper">
            {formatCOP(totals.price * party)}
          </span>
          {" · "}
          <span className="data">{totals.minutes * party} min</span>
        </p>
      )}

      <div className="mt-4 rounded-sm border border-edge bg-coal px-4 py-3.5">
        <p className="data text-[11px] uppercase tracking-[0.25em] text-smoke">
          ¿Cuántos se cortan? <span className="text-copper">turnos seguidos</span>
        </p>
        <div className="mt-2.5 flex gap-2">
          {[1, 2, 3].map((size) => (
            <button
              key={size}
              onClick={() =>
                setCompanions(Array.from({ length: size - 1 }, (_, i) => companions[i] ?? ""))
              }
              aria-pressed={party === size}
              className={clsx(
                "data min-h-11 flex-1 rounded-sm border text-sm",
                "transition-[border-color,background-color,color,transform] duration-150 ease-[var(--ease-out)]",
                "active:scale-[0.97]",
                party === size
                  ? "border-copper bg-copper/10 text-copper"
                  : "border-edge text-smoke hover:border-copper/40",
              )}
            >
              {size === 1 ? "Solo yo" : `${size} personas`}
            </button>
          ))}
        </div>
        {companions.length > 0 && (
          <p className="mt-2 text-[11px] text-smoke/70">
            Mismos servicios para todos, uno detrás del otro (padre e hijo, parche).
          </p>
        )}
      </div>
    </div>
  );
}

function SlotPanel({
  ref,
  date,
  loading,
  availability,
  selected,
  onSelect,
}: {
  ref: React.Ref<HTMLDivElement>;
  date: string | null;
  loading: boolean;
  availability: DayAvailability | null;
  selected: string | null;
  onSelect: (slot: string) => void;
}) {
  return (
    <div ref={ref} className="scroll-mt-4">
      <p className="data mb-3 text-sm uppercase tracking-widest text-smoke">
        {date ? `Horarios · ${date}` : "Elige un día"}
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-copper">
          <Loader2 className="animate-spin" size={20} />
          <span className="data text-xs uppercase tracking-widest">Buscando huecos…</span>
        </div>
      ) : availability?.is_day_off ? (
        <p className="text-sm text-brick">Will descansa ese día. Elige otra fecha.</p>
      ) : availability && availability.slots.length === 0 ? (
        <p className="text-sm text-smoke">
          Ese día quedó lleno. Prueba con otra fecha — se libera seguido.
        </p>
      ) : (
        <div
          role="group"
          aria-label="Horarios disponibles"
          className="grid max-h-80 grid-cols-3 gap-2.5 overflow-y-auto pr-1"
        >
          {availability?.slots.map((slot) => (
            <button
              key={slot}
              onClick={() => onSelect(slot)}
              aria-pressed={selected === slot}
              className={clsx(
                "data min-h-12 rounded-sm border px-3 text-base sm:min-h-11 sm:text-sm",
                // El feedback vive en el press, y es instantáneo
                "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out)]",
                "active:scale-[0.95]",
                selected === slot
                  ? "border-copper bg-copper text-on-copper shadow-[0_0_16px_rgba(42,70,150,0.3)]"
                  : "border-edge bg-coal text-chalk hover:border-copper/50",
              )}
            >
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailsStep({
  name,
  setName,
  phone,
  setPhone,
  email,
  setEmail,
  companions,
  setCompanions,
  codesOpen,
  setCodesOpen,
  giftCode,
  setGiftCode,
  referralCode,
  setReferralCode,
  website,
  setWebsite,
  setCaptchaToken,
  summary,
}: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  companions: string[];
  setCompanions: (next: string[]) => void;
  codesOpen: boolean;
  setCodesOpen: (v: boolean) => void;
  giftCode: string;
  setGiftCode: (v: string) => void;
  referralCode: string;
  setReferralCode: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  setCaptchaToken: (v: string | null) => void;
  summary: { totals: Totals; date: string | null; time: string | null; party: number };
}) {
  const inputClass =
    "focus-ring min-h-13 w-full rounded-sm border border-edge bg-coal px-4 py-3.5 text-base text-chalk placeholder:text-smoke/50";
  const { totals, date, time, party } = summary;

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* El resumen deja de ser un paso propio y encabeza el último: el usuario
          ve lo que va a confirmar mientras escribe sus datos. */}
      <div className="surface border border-edge bg-coal p-5">
        <p className="data text-[11px] uppercase tracking-[0.3em] text-copper">Tu turno</p>
        <p className="display mt-2 text-2xl text-chalk">
          {date} · {time}
        </p>
        <p className="mt-1 text-sm text-smoke">
          {totals.chosen.map((s) => s.name).join(", ")} · {totals.minutes * party} min
          {party > 1 ? ` · ${party} personas` : ""}
        </p>
        <p className="mt-3 border-t border-edge pt-3 text-sm text-smoke">
          Total:{" "}
          <span className="display text-xl text-copper">{formatCOP(totals.price * party)}</span>
          <span className="ml-2 text-xs">se paga en el local</span>
        </p>
      </div>

      {/* text-base (16px) evita el zoom automático de iOS al enfocar */}
      <label className="block">
        <span className="mb-1.5 block text-sm text-smoke">Tu nombre</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre y apellido"
          autoComplete="name"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-smoke">WhatsApp</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="300 123 4567"
          inputMode="tel"
          autoComplete="tel"
          className={inputClass}
        />
        <span className="mt-1.5 block text-xs text-smoke/70">
          Solo lo usamos si hay que avisarte algo de tu turno.
        </span>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-smoke">
          Correo <span className="text-smoke/60">(opcional)</span>
        </span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={inputClass}
        />
        <span className="mt-1.5 block text-xs text-smoke/70">
          Te llega una copia de la confirmación con tu código.
        </span>
      </label>

      {companions.map((companion, index) => (
        <label key={index} className="block">
          <span className="mb-1.5 block text-sm text-smoke">Acompañante {index + 1}</span>
          <input
            value={companion}
            onChange={(e) =>
              setCompanions(companions.map((c, i) => (i === index ? e.target.value : c)))
            }
            placeholder="Su nombre"
            className={inputClass}
          />
        </label>
      ))}

      {companions.length === 0 && (
        <div className="rounded-sm border border-edge bg-coal px-4 py-3">
          <button
            type="button"
            onClick={() => setCodesOpen(!codesOpen)}
            aria-expanded={codesOpen}
            className="data w-full text-left text-[11px] uppercase tracking-[0.25em] text-smoke transition-colors duration-150 hover:text-copper"
          >
            ¿Tienes código de regalo o de amigo? {codesOpen ? "−" : "+"}
          </button>
          {codesOpen && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-smoke">Regalo</span>
                <input
                  value={giftCode}
                  onChange={(e) => setGiftCode(e.target.value.toUpperCase())}
                  placeholder="G-XXXXXX"
                  className="focus-ring data min-h-12 w-full rounded-sm border border-edge bg-night px-3 text-sm uppercase text-chalk placeholder:text-smoke/40"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-smoke">Código de amigo</span>
                <input
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="BB-XXXX"
                  className="focus-ring data min-h-12 w-full rounded-sm border border-edge bg-night px-3 text-sm uppercase text-chalk placeholder:text-smoke/40"
                />
              </label>
            </div>
          )}
        </div>
      )}

      <HoneypotField value={website} onChange={setWebsite} />
      <Turnstile onToken={setCaptchaToken} />
    </div>
  );
}

/* -------------------------------------------------------------- calendario */

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
    <div className="rounded-sm border border-edge bg-coal p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="flex h-11 w-11 items-center justify-center text-smoke transition-colors duration-150 hover:text-copper"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={20} />
        </button>
        <p className="display text-lg text-chalk">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </p>
        <button
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="flex h-11 w-11 items-center justify-center text-smoke transition-colors duration-150 hover:text-copper"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-smoke">
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
  const isSelected = selected === iso;
  return (
    <button
      disabled={!selectable}
      onClick={() => onSelect(iso)}
      aria-label={`${day.getDate()} de ${MONTHS[day.getMonth()]}`}
      aria-pressed={isSelected}
      className={clsx(
        "aspect-square min-h-10 rounded-sm text-base sm:text-sm",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)]",
        isSelected && "scale-105 bg-copper text-on-copper shadow-[0_0_14px_rgba(42,70,150,0.35)]",
        !isSelected && selectable && "text-chalk hover:bg-ash active:scale-95",
        !selectable && "cursor-not-allowed text-smoke/25 line-through",
      )}
    >
      {day.getDate()}
    </button>
  );
}

/* ------------------------------------------------------------ confirmación */

function Confirmation({
  appointment,
  groupExtras = [],
  email = null,
}: {
  appointment: AppointmentPublic;
  groupExtras?: AppointmentPublic[];
  email?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(appointment.manage_code);
      setCopied(true);
      toast.success("Código copiado");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.info("Copia el código a mano", {
        description: "Tu navegador no permitió copiarlo automáticamente.",
      });
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, transform: "scale(0.96)" }}
      animate={{ opacity: 1, transform: "scale(1)" }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      className="mx-auto max-w-md px-5 pb-24 text-center"
    >
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-copper">
        <Check size={32} className="text-on-copper" />
      </div>
      <h2 className="display text-4xl text-chalk">
        {appointment.status === "pendiente" ? "¡Turno apartado!" : "¡Turno confirmado!"}
      </h2>
      <p className="mt-2 text-lg text-copper">
        {appointment.status === "pendiente"
          ? `Falta un paso, ${appointment.customer_name.split(" ")[0]}.`
          : `La silla es tuya, ${appointment.customer_name.split(" ")[0]}.`}
      </p>
      <p className="mt-2 text-smoke">
        Te espero el <span className="data text-chalk">{appointment.date_local}</span> a las{" "}
        <span className="data text-chalk">{appointment.time_local}</span>.
      </p>

      {/* Acción principal, visible sin hacer scroll: abre WhatsApp con el
          mensaje ya escrito (no lo envía solo — eso requeriría la Business API). */}
      <div className="mt-7">
        <WhatsAppConfirm
          nombre={appointment.customer_name}
          servicios={appointment.services.map((s) => s.name)}
          fecha={appointment.date_local}
          hora={appointment.time_local}
          codigo={appointment.manage_code}
        />
        <p className="mt-2 text-xs text-smoke/70">
          Se abre WhatsApp con el mensaje listo; tú le das enviar.
        </p>
      </div>

      {/* EL MOMENTO SEÑAL: el tiquete se imprime y el código queda sellado.
          Es el único medio de gestión del turno: protagonista absoluto. */}
      <div className="surface mt-8 p-5 sm:p-6">
        <p className="data text-xs uppercase tracking-[0.3em] text-copper">
          Tu código de gestión
        </p>
        <RazorReveal code={appointment.manage_code} className="mt-4">
          <div className="h-28 rounded-sm border border-dashed border-copper/40 bg-night/60" />
        </RazorReveal>
        <button
          onClick={copyCode}
          className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-sm border border-copper px-5 text-sm text-copper transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-copper hover:text-on-copper active:scale-[0.97]"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "¡Copiado!" : "Copiar código"}
        </button>
        <p className="mt-5 flex items-start gap-2 text-left text-sm text-chalk">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-copper" />
          <span>
            <strong>Guarda este código:</strong> lo necesitas para consultar o cancelar tu
            turno. Tómale una captura o cópialo ahora
            {email ? (
              <>
                {" "}
                — también te llega una copia a{" "}
                <span className="data text-copper">{email}</span> al quedar confirmado.
              </>
            ) : (
              <> — no se envía por ningún otro medio.</>
            )}
          </span>
        </p>
      </div>

      <div className="surface mt-6 border border-edge bg-coal px-6 py-4">
        <p className="data text-xs uppercase tracking-widest text-smoke">Turno del día</p>
        <p className="data mt-1 text-4xl font-semibold text-copper">
          #{appointment.daily_number}
        </p>
      </div>

      {appointment.gift_description && (
        <p className="data mt-4 rounded-sm border border-copper/40 bg-copper/10 px-4 py-3 text-sm text-copper">
          🎁 Regalo aplicado: {appointment.gift_description} — se redime en el local
        </p>
      )}

      {groupExtras.length > 0 && (
        <div className="surface mt-4 border border-edge bg-coal p-4 text-left">
          <p className="data text-[11px] uppercase tracking-[0.3em] text-copper">
            Los turnos del parche
          </p>
          <ul className="mt-2 space-y-2">
            {groupExtras.map((extra) => (
              <li
                key={extra.manage_code}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate text-chalk">
                  {extra.customer_name} ·{" "}
                  <span className="data text-copper">{extra.time_local}</span>
                </span>
                <span className="data selectable tracking-[0.2em] text-chalk">
                  {extra.manage_code}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-smoke/70">
            Cada uno gestiona su turno con su propio código.
          </p>
        </div>
      )}

      <div className="mt-4">
        <AddToCalendar
          event={{
            title: `Will Barbershop — turno #${appointment.daily_number}`,
            dateLocal: appointment.date_local,
            timeLocal: appointment.time_local,
            durationMin: appointment.services.reduce((sum, s) => sum + s.duration_min, 0) || 45,
            description: `Código de gestión: ${appointment.manage_code}. Gestiona tu turno: ${typeof window !== "undefined" ? window.location.origin : ""}/turno/${appointment.manage_code}`,
            location: `${NEGOCIO.nombre} — ${DIRECCION_COMPLETA}`,
          }}
        />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/turno/${appointment.manage_code}`}
          className="display rounded-sm bg-copper px-6 py-3 text-lg text-on-copper transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
        >
          Ver mi tiquete vivo
        </Link>
        <Link
          href="/hoy"
          className="data text-xs uppercase tracking-widest text-smoke transition-colors duration-150 hover:text-copper"
        >
          ¿Cómo va la fila hoy? →
        </Link>
        <Link
          href="/"
          className="text-sm text-smoke transition-colors duration-150 hover:text-copper"
        >
          Volver al inicio
        </Link>
      </div>
    </motion.div>
  );
}

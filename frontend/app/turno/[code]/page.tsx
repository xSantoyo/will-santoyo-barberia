"use client";

/** Gestión del turno vía enlace único (enviado por WhatsApp) o tras buscarlo. */
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarCheck2,
  CalendarX2,
  Check,
  Loader2,
  Radio,
  Star,
} from "lucide-react";
import { publicApi } from "@/lib/api";
import FlipNumber from "@/components/public/FlipNumber";
import AddToCalendar from "@/components/public/AddToCalendar";
import {
  formatCOP,
  STATUS_LABELS,
  type AppointmentPublic,
  type TicketQueue,
} from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  confirmado: "text-gold border-gold/40 bg-gold/10",
  pendiente: "text-bone-2 border-ink-3 bg-ink-3/50",
  en_curso: "text-gold-2 border-gold/60 bg-gold/15",
  completado: "text-bone-2 border-ink-3 bg-ink-3/50",
  cancelado: "text-wine border-wine/50 bg-wine/10",
  no_show: "text-wine border-wine/50 bg-wine/10",
};

export default function ManageAppointmentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [appointment, setAppointment] = useState<AppointmentPublic | null>(null);
  const [ticket, setTicket] = useState<TicketQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = useCallback(() => {
    publicApi
      .ticketQueue(code)
      .then(setTicket)
      .catch(() => setTicket(null));
  }, [code]);

  useEffect(() => {
    publicApi
      .appointment(code)
      .then(setAppointment)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    loadTicket();
    const timer = setInterval(loadTicket, 25_000); // el tiquete vive: la fila avanza
    return () => clearInterval(timer);
  }, [code, loadTicket]);

  async function confirmAttendance() {
    setConfirming(true);
    setError(null);
    try {
      const updated = await publicApi.confirmAttendance(code);
      setAppointment(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar la confirmación.");
    } finally {
      setConfirming(false);
    }
  }

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      const updated = await publicApi.cancel(code, reason.trim() || undefined);
      setAppointment(updated);
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cancelar el turno.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </main>
    );
  }

  if (notFound || !appointment) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="display text-4xl text-bone">Turno no encontrado</p>
        <p className="text-bone-2">Verifica el enlace o busca tu turno con tu teléfono y código.</p>
        <Link href="/turno" className="display mt-4 rounded-sm bg-gold px-6 py-3 text-ink">
          Buscar mi turno
        </Link>
      </main>
    );
  }

  const isCancellable = appointment.status === "confirmado" || appointment.status === "pendiente";
  const isActive =
    appointment.status === "confirmado" ||
    appointment.status === "pendiente" ||
    appointment.status === "en_curso";
  const showLiveQueue = ticket !== null && ticket.is_today && isActive;

  return (
    <main className="min-h-svh pt-10">
      <div className="mx-auto max-w-md px-5 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-bone-2 transition-colors hover:text-gold"
        >
          <ArrowLeft size={16} /> Bad Boys Barbershop
        </Link>

        {/* Confirmación de asistencia: si no confirma, el turno se libera */}
        {appointment.attendance_pending && (
          <div className="clip-corner mt-8 border-2 border-gold bg-gold/10 p-5 text-center">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
              Confirma tu asistencia
            </p>
            <p className="mt-2 text-sm text-bone">
              ¿Sigues en pie para tu turno? Confírmalo antes de las{" "}
              <span className="data font-semibold text-gold">
                {appointment.attendance_deadline_local}
              </span>
              {" — "}si no, el horario se libera para otra persona.
            </p>
            <button
              onClick={confirmAttendance}
              disabled={confirming}
              className="display mx-auto mt-4 flex min-h-12 items-center gap-2 rounded-sm bg-gold px-8 text-lg text-ink transition-all enabled:hover:scale-[1.03] disabled:opacity-60"
            >
              {confirming ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <CalendarCheck2 size={18} />
              )}
              Sí, voy a ir
            </button>
          </div>
        )}

        {appointment.attendance_confirmed && isActive && (
          <p className="data mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-gold">
            <Check size={14} /> Asistencia confirmada — te esperamos
          </p>
        )}

        {/* Tiquete vivo: hoy la fila avanza en tiempo real */}
        {showLiveQueue && (
          <div className="plate clip-corner mt-8 p-5 text-center">
            <p className="data flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-gold">
              <Radio size={13} className="animate-pulse" /> La fila hoy
            </p>
            {appointment.status === "en_curso" ? (
              <p className="display mt-3 text-3xl text-gold">Estás en el sillón</p>
            ) : ticket.ahead_count === 0 ? (
              <p className="display mt-3 text-3xl text-gold">¡Sigues tú!</p>
            ) : (
              <>
                <p className="stamped mt-2 text-5xl text-bone">
                  {ticket.now_serving !== null ? (
                    <>
                      <span className="text-gold">#</span>
                      <FlipNumber value={String(ticket.now_serving)} />
                    </>
                  ) : (
                    <span className="data text-2xl text-bone-2">silla libre</span>
                  )}
                </p>
                <p className="data mt-1 text-xs uppercase tracking-widest text-bone-2">
                  {ticket.now_serving !== null ? "en el sillón" : "aún no empieza tu barbero"}
                </p>
                <p className="mt-3 text-sm text-bone">
                  Faltan{" "}
                  <span className="data font-semibold text-gold">
                    {ticket.ahead_count}
                  </span>{" "}
                  turno{ticket.ahead_count === 1 ? "" : "s"} para el tuyo (
                  <span className="data">#{ticket.number}</span>)
                </p>
              </>
            )}
            <Link
              href="/hoy"
              className="data mt-4 inline-block text-xs uppercase tracking-widest text-bone-2 underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              Ver el tablero completo →
            </Link>
          </div>
        )}

        <div className="mt-8 rounded-sm border border-ink-3 bg-ink-2 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-bone-2">Turno</p>
              <p className="display text-3xl text-bone">#{appointment.daily_number} del día</p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${STATUS_COLORS[appointment.status]}`}
            >
              {STATUS_LABELS[appointment.status]}
            </span>
          </div>

          <dl className="mt-6 space-y-3 border-t border-ink-3 pt-5 text-sm">
            <Row label="Cliente" value={appointment.customer_name} />
            <Row label="Barbero" value={appointment.barber_name} />
            <Row label="Fecha" value={appointment.date_local} />
            <Row label="Hora" value={appointment.time_local} />
            <Row
              label="Servicios"
              value={appointment.services.map((s) => s.name).join(", ")}
            />
            <Row
              label="Total"
              value={
                <span className="display text-lg text-gold">
                  {formatCOP(appointment.total_cop)}
                </span>
              }
            />
            <Row
              label="Código"
              value={<span className="tracking-[0.25em]">{appointment.manage_code}</span>}
            />
          </dl>
        </div>

        {isActive && (
          <div className="mt-4">
            <AddToCalendar
              event={{
                title: `Bad Boys Barbershop — turno #${appointment.daily_number}`,
                dateLocal: appointment.date_local,
                timeLocal: appointment.time_local,
                durationMin:
                  appointment.services.reduce((sum, s) => sum + s.duration_min, 0) || 45,
                description: `Con ${appointment.barber_name}. Código de gestión: ${appointment.manage_code}.`,
                location: "Bad Boys Barbershop",
              }}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-sm border border-wine bg-wine/15 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {isCancellable && !confirmOpen && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm border border-wine px-6 py-3 text-wine transition-colors hover:bg-wine hover:text-bone"
          >
            <CalendarX2 size={18} /> Cancelar mi turno
          </button>
        )}

        <AnimatePresence>
          {confirmOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-6 rounded-sm border border-wine/50 bg-wine/10 p-5">
                <p className="text-sm text-bone">
                  ¿Seguro que quieres cancelar? El horario quedará libre para otra persona.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  rows={2}
                  className="focus-gold mt-3 w-full rounded-sm border border-ink-3 bg-ink px-3 py-2 text-sm text-bone placeholder:text-bone-2/50"
                />
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={cancel}
                    disabled={cancelling}
                    className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-wine px-4 py-2.5 text-sm text-bone disabled:opacity-60"
                  >
                    {cancelling ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    Sí, cancelar
                  </button>
                  <button
                    onClick={() => setConfirmOpen(false)}
                    className="flex-1 rounded-sm border border-ink-3 px-4 py-2.5 text-sm text-bone-2 hover:text-bone"
                  >
                    Conservar turno
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Anticipo pendiente de pago */}
        {appointment.payment?.checkout_url && appointment.status === "pendiente" && (
          <div className="clip-corner mt-8 border-2 border-gold bg-gold/10 p-5 text-center">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
              Tu turno está apartado, no confirmado
            </p>
            <p className="mt-2 text-sm text-bone">
              Paga el anticipo de{" "}
              <span className="data font-semibold text-gold">
                {formatCOP(appointment.payment.amount_cop)}
              </span>{" "}
              para asegurar la silla — se descuenta del corte.
            </p>
            <a
              href={appointment.payment.checkout_url}
              className="display mx-auto mt-4 flex min-h-12 w-full max-w-xs items-center justify-center rounded-sm bg-gold px-8 text-lg text-ink transition-all hover:scale-[1.02]"
            >
              Pagar anticipo
            </a>
          </div>
        )}

        {appointment.payment?.status === "aprobado" && (
          <p className="data mt-4 rounded-sm border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
            ✓ Anticipo pagado ({formatCOP(appointment.payment.amount_cop)}) — se
            descuenta del corte en el local
          </p>
        )}

        {appointment.gift_description && (
          <p className="data mt-4 rounded-sm border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
            🎁 {appointment.gift_description} — se redime en el local
          </p>
        )}

        {/* Repetir turno: la recurrencia honesta, un toque y listo */}
        {appointment.status === "completado" && (
          <RebookWidget code={code} barberName={appointment.barber_name} />
        )}

        {/* Reseña verificada: solo citas completadas, una por cita */}
        {appointment.can_review && (
          <ReviewWidget
            code={code}
            onDone={(rating) =>
              setAppointment({ ...appointment, can_review: false, review_rating: rating })
            }
          />
        )}
        {appointment.review_rating && (
          <p className="data mt-6 text-center text-sm text-gold">
            {"★".repeat(appointment.review_rating)}
            {"☆".repeat(5 - appointment.review_rating)} — gracias por tu reseña
          </p>
        )}

        {appointment.status === "cancelado" && (
          <Link
            href="/agendar"
            className="display mt-6 block rounded-sm bg-gold px-6 py-3 text-center text-lg text-ink"
          >
            Agendar un nuevo turno
          </Link>
        )}

        <Link
          href="/mi-historial"
          className="data mt-8 block text-center text-xs uppercase tracking-widest text-bone-2 transition-colors hover:text-gold"
        >
          Ver todo mi historial y mi tarjeta de fidelidad →
        </Link>
      </div>
    </main>
  );
}

function RebookWidget({ code, barberName }: { code: string; barberName: string }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<{ code: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rebook(weeks: number) {
    setBusy(weeks);
    setError(null);
    try {
      const next = await publicApi.rebook(code, weeks);
      setDone({ code: next.manage_code, date: next.date_local });
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Prueba otra semana o agenda desde el inicio.`
          : "No se pudo repetir.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="clip-corner mt-6 border border-gold/40 bg-gold/[0.06] p-5 text-center">
        <p className="display text-2xl text-gold">¡Silla apartada!</p>
        <p className="mt-1 text-sm text-bone">
          Mismo corte con {barberName} el <span className="data">{done.date}</span>.
        </p>
        <Link
          href={`/turno/${done.code}`}
          className="display mt-3 inline-block rounded-sm bg-gold px-6 py-2.5 text-ink"
        >
          Ver mi nuevo tiquete
        </Link>
      </div>
    );
  }

  return (
    <div className="clip-corner mt-6 border border-ink-3 bg-ink-2 p-5 text-center">
      <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
        ¿Repetimos? Misma hora, mismo barbero
      </p>
      <div className="mt-3 flex justify-center gap-2">
        {[2, 3, 4].map((weeks) => (
          <button
            key={weeks}
            onClick={() => rebook(weeks)}
            disabled={busy !== null}
            className="data min-h-11 flex-1 rounded-sm border border-gold/50 px-3 text-sm text-gold transition-all hover:bg-gold hover:text-ink active:scale-95 disabled:opacity-50"
          >
            {busy === weeks ? (
              <Loader2 className="mx-auto animate-spin" size={15} />
            ) : (
              `En ${weeks} semanas`
            )}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-wine">{error}</p>}
    </div>
  );
}

function ReviewWidget({
  code,
  onDone,
}: {
  code: string;
  onDone: (rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (rating === 0) return;
    setSending(true);
    setError(null);
    try {
      await publicApi.leaveReview(code, rating, comment.trim() || undefined);
      onDone(rating);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar tu reseña.");
      setSending(false);
    }
  }

  return (
    <div className="clip-corner mt-6 border border-gold/40 bg-gold/[0.06] p-5 text-center">
      <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
        ¿Cómo quedó el corte?
      </p>
      <div className="mt-3 flex justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            onClick={() => setRating(value)}
            onMouseEnter={() => setHover(value)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${value} estrellas`}
            className="p-1.5 transition-transform hover:scale-125"
          >
            <Star
              size={26}
              className={
                value <= (hover || rating) ? "fill-gold text-gold" : "text-bone-2/40"
              }
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Cuéntanos cómo te fue (opcional)"
        rows={2}
        maxLength={500}
        className="focus-gold mt-3 w-full rounded-sm border border-ink-3 bg-ink px-3 py-2.5 text-sm text-bone placeholder:text-bone-2/50"
      />
      {error && <p className="mt-2 text-xs text-wine">{error}</p>}
      <button
        onClick={submit}
        disabled={sending || rating === 0}
        className="display mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-sm bg-gold px-6 text-ink transition-all enabled:hover:scale-[1.02] disabled:opacity-40"
      >
        {sending && <Loader2 className="animate-spin" size={16} />}
        Publicar reseña
      </button>
      <p className="mt-2 text-[11px] text-bone-2/70">
        Reseña verificada: viene de tu cita real en la barbería.
      </p>
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

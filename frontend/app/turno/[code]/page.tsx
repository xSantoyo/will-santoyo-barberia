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
import { track } from "@/lib/analytics";
import FlipNumber from "@/components/public/FlipNumber";
import AddToCalendar from "@/components/public/AddToCalendar";
import {
  formatCOP,
  STATUS_LABELS,
  type AppointmentPublic,
  type TicketQueue,
} from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  confirmado: "text-copper border-copper/40 bg-copper/10",
  pendiente: "text-smoke border-edge bg-ash/50",
  en_curso: "text-ember border-copper/60 bg-copper/15",
  completado: "text-smoke border-edge bg-ash/50",
  cancelado: "text-brick border-brick/50 bg-brick/10",
  no_show: "text-brick border-brick/50 bg-brick/10",
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
    } catch (brick) {
      setError(brick instanceof Error ? brick.message : "No pudimos registrar la confirmación.");
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
    } catch (brick) {
      setError(brick instanceof Error ? brick.message : "No pudimos cancelar el turno.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center text-copper">
        <Loader2 className="animate-spin" size={32} />
      </main>
    );
  }

  if (notFound || !appointment) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="display text-4xl text-chalk">Turno no encontrado</p>
        <p className="text-smoke">Verifica el enlace o busca tu turno con tu teléfono y código.</p>
        <Link href="/turno" className="display mt-4 rounded-sm bg-copper px-6 py-3 text-on-copper">
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
          className="inline-flex items-center gap-2 text-sm text-smoke transition-colors hover:text-copper"
        >
          <ArrowLeft size={16} /> Will Santoyo
        </Link>

        {/* Confirmación de asistencia: si no confirma, el turno se libera */}
        {appointment.attendance_pending && (
          <div className="surface mt-8 border-2 border-copper bg-copper/10 p-5 text-center">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-copper">
              Confirma tu asistencia
            </p>
            <p className="mt-2 text-sm text-chalk">
              ¿Sigues en pie para tu turno? Confírmalo antes de las{" "}
              <span className="data font-semibold text-copper">
                {appointment.attendance_deadline_local}
              </span>
              {" — "}si no, el horario se libera para otra persona.
            </p>
            <button
              onClick={confirmAttendance}
              disabled={confirming}
              className="display mx-auto mt-4 flex min-h-12 items-center gap-2 rounded-sm bg-copper px-8 text-lg text-on-copper transition-transform duration-150 ease-[var(--ease-out)] enabled:active:scale-[0.97] disabled:opacity-40"
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
          <p className="data mt-6 flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-copper">
            <Check size={14} /> Asistencia confirmada — te esperamos
          </p>
        )}

        {/* Tiquete vivo: hoy la fila avanza en tiempo real */}
        {showLiveQueue && (
          <div className="surface surface mt-8 p-5 text-center">
            <p className="data flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.3em] text-copper">
              <Radio size={13} className="animate-pulse" /> La fila hoy
            </p>
            {appointment.status === "en_curso" ? (
              <p className="display mt-3 text-3xl text-copper">Estás en el sillón</p>
            ) : ticket.ahead_count === 0 ? (
              <p className="display mt-3 text-3xl text-copper">¡Sigues tú!</p>
            ) : (
              <>
                <p className="stamped mt-2 text-5xl text-chalk">
                  {ticket.now_serving !== null ? (
                    <>
                      <span className="text-copper">#</span>
                      <FlipNumber value={String(ticket.now_serving)} />
                    </>
                  ) : (
                    <span className="data text-2xl text-smoke">silla libre</span>
                  )}
                </p>
                <p className="data mt-1 text-xs uppercase tracking-widest text-smoke">
                  {ticket.now_serving !== null ? "en el sillón" : "aún no empieza tu turno"}
                </p>
                <p className="mt-3 text-sm text-chalk">
                  Faltan{" "}
                  <span className="data font-semibold text-copper">
                    {ticket.ahead_count}
                  </span>{" "}
                  turno{ticket.ahead_count === 1 ? "" : "s"} para el tuyo (
                  <span className="data">#{ticket.number}</span>)
                </p>
              </>
            )}
            <Link
              href="/hoy"
              className="data mt-4 inline-block text-xs uppercase tracking-widest text-smoke underline-offset-4 transition-colors hover:text-copper hover:underline"
            >
              Ver el tablero completo →
            </Link>
          </div>
        )}

        <div className="mt-8 rounded-sm border border-edge bg-coal p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-smoke">Turno</p>
              <p className="display text-3xl text-chalk">#{appointment.daily_number} del día</p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wider ${STATUS_COLORS[appointment.status]}`}
            >
              {STATUS_LABELS[appointment.status]}
            </span>
          </div>

          <dl className="mt-6 space-y-3 border-t border-edge pt-5 text-sm">
            <Row label="Cliente" value={appointment.customer_name} />
            <Row label="Fecha" value={appointment.date_local} />
            <Row label="Hora" value={appointment.time_local} />
            <Row
              label="Servicios"
              value={appointment.services.map((s) => s.name).join(", ")}
            />
            <Row
              label="Total"
              value={
                <span className="display text-lg text-copper">
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
                title: `Will Santoyo — turno #${appointment.daily_number}`,
                dateLocal: appointment.date_local,
                timeLocal: appointment.time_local,
                durationMin:
                  appointment.services.reduce((sum, s) => sum + s.duration_min, 0) || 45,
                description: `Con Will. Código de gestión: ${appointment.manage_code}.`,
                location: "Will Santoyo — Calle 35 Sur & Cra 15B, Soacha",
              }}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-sm border border-brick bg-brick/15 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {isCancellable && !confirmOpen && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-sm border border-brick px-6 py-3 text-brick transition-colors hover:bg-brick hover:text-chalk"
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
              <div className="mt-6 rounded-sm border border-brick/50 bg-brick/10 p-5">
                <p className="text-sm text-chalk">
                  ¿Seguro que quieres cancelar? El horario quedará libre para otra persona.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  rows={2}
                  className="focus-ring mt-3 w-full rounded-sm border border-edge bg-night px-3 py-2 text-sm text-chalk placeholder:text-smoke/50"
                />
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={cancel}
                    disabled={cancelling}
                    className="flex flex-1 items-center justify-center gap-2 rounded-sm bg-brick px-4 py-2.5 text-sm text-chalk disabled:opacity-60"
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
                    className="flex-1 rounded-sm border border-edge px-4 py-2.5 text-sm text-smoke hover:text-chalk"
                  >
                    Conservar turno
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {appointment.gift_description && (
          <p className="data mt-4 rounded-sm border border-copper/40 bg-copper/10 px-4 py-3 text-sm text-copper">
            🎁 {appointment.gift_description} — se redime en el local
          </p>
        )}

        {/* Repetir turno: la recurrencia honesta, un toque y listo */}
        {appointment.status === "completado" && (
          <RebookWidget code={code} />
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
          <p className="data mt-6 text-center text-sm text-copper">
            {"★".repeat(appointment.review_rating)}
            {"☆".repeat(5 - appointment.review_rating)} — gracias por tu reseña
          </p>
        )}

        {appointment.status === "cancelado" && (
          <Link
            href="/agendar"
            className="display mt-6 block rounded-sm bg-copper px-6 py-3 text-center text-lg text-on-copper"
          >
            Agendar un nuevo turno
          </Link>
        )}

        <Link
          href="/mi-historial"
          className="data mt-8 block text-center text-xs uppercase tracking-widest text-smoke transition-colors hover:text-copper"
        >
          Ver todo mi historial y mi tarjeta de fidelidad →
        </Link>
      </div>
    </main>
  );
}

function RebookWidget({ code }: { code: string }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [done, setDone] = useState<{ code: string; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rebook(weeks: number) {
    setBusy(weeks);
    setError(null);
    try {
      const next = await publicApi.rebook(code, weeks);
      setDone({ code: next.manage_code, date: next.date_local });
    } catch (brick) {
      setError(
        brick instanceof Error
          ? `${brick.message} Prueba otra semana o agenda desde el inicio.`
          : "No se pudo repetir.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <div className="surface mt-6 border border-copper/40 bg-copper/[0.06] p-5 text-center">
        <p className="display text-2xl text-copper">¡Silla apartada!</p>
        <p className="mt-1 text-sm text-chalk">
          Mismo corte con Will el <span className="data">{done.date}</span>.
        </p>
        <Link
          href={`/turno/${done.code}`}
          className="display mt-3 inline-block rounded-sm bg-copper px-6 py-2.5 text-on-copper"
        >
          Ver mi nuevo tiquete
        </Link>
      </div>
    );
  }

  return (
    <div className="surface mt-6 border border-edge bg-coal p-5 text-center">
      <p className="data text-[11px] uppercase tracking-[0.3em] text-copper">
        ¿Repetimos? Misma hora, mismo corte
      </p>
      <div className="mt-3 flex justify-center gap-2">
        {[2, 3, 4].map((weeks) => (
          <button
            key={weeks}
            onClick={() => rebook(weeks)}
            disabled={busy !== null}
            className="data min-h-11 flex-1 rounded-sm border border-copper/50 px-3 text-sm text-copper transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-copper hover:text-on-copper active:scale-[0.97] disabled:opacity-40"
          >
            {busy === weeks ? (
              <Loader2 className="mx-auto animate-spin" size={15} />
            ) : (
              `En ${weeks} semanas`
            )}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-brick">{error}</p>}
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
      track("resena_enviada", { estrellas: rating, con_comentario: Boolean(comment.trim()) });
      onDone(rating);
    } catch (brick) {
      setError(brick instanceof Error ? brick.message : "No pudimos guardar tu reseña.");
      setSending(false);
    }
  }

  return (
    <div className="surface mt-6 border border-copper/40 bg-copper/[0.06] p-5 text-center">
      <p className="data text-[11px] uppercase tracking-[0.3em] text-copper">
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
                value <= (hover || rating) ? "fill-copper text-copper" : "text-smoke/40"
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
        className="focus-ring mt-3 w-full rounded-sm border border-edge bg-night px-3 py-2.5 text-sm text-chalk placeholder:text-smoke/50"
      />
      {error && <p className="mt-2 text-xs text-brick">{error}</p>}
      <button
        onClick={submit}
        disabled={sending || rating === 0}
        className="display mx-auto mt-3 flex min-h-11 items-center gap-2 rounded-sm bg-copper px-6 text-on-copper transition-transform duration-150 ease-[var(--ease-out)] enabled:active:scale-[0.97] disabled:opacity-40"
      >
        {sending && <Loader2 className="animate-spin" size={16} />}
        Publicar reseña
      </button>
      <p className="mt-2 text-[11px] text-smoke/70">
        Reseña verificada: viene de tu cita real — y suma una tijera en tu
        tarjeta de fidelidad.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-smoke">{label}</dt>
      <dd className="text-right text-chalk">{value}</dd>
    </div>
  );
}

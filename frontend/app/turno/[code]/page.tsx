"use client";

/** Gestión del turno vía enlace único (enviado por WhatsApp) o tras buscarlo. */
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarX2, Check, Loader2 } from "lucide-react";
import { publicApi } from "@/lib/api";
import { formatCOP, STATUS_LABELS, type AppointmentPublic } from "@/lib/types";

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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi
      .appointment(code)
      .then(setAppointment)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

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

  return (
    <main className="min-h-svh pt-10">
      <div className="mx-auto max-w-md px-5 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-bone-2 transition-colors hover:text-gold"
        >
          <ArrowLeft size={16} /> Bad Boys Barbershop
        </Link>

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

        {appointment.status === "cancelado" && (
          <Link
            href="/agendar"
            className="display mt-6 block rounded-sm bg-gold px-6 py-3 text-center text-lg text-ink"
          >
            Agendar un nuevo turno
          </Link>
        )}
      </div>
    </main>
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

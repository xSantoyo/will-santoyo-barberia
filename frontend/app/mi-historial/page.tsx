"use client";

/** Portal ligero del cliente (Tanda 3, A5): historial completo + tarjeta de
 * fidelidad, con el teléfono como llave y cualquier código propio como
 * comprobante — sin contraseñas. */
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, History, Loader2, Scissors, Star } from "lucide-react";
import { publicApi } from "@/lib/api";
import { formatCOP, STATUS_LABELS, type PortalResponse } from "@/lib/types";
import { StatusBadge } from "@/components/admin/shared";

export default function PortalPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [data, setData] = useState<PortalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setData(await publicApi.portal(phone.trim(), code.trim().toUpperCase()));
    } catch {
      setError(
        "No encontramos tu historial. Usa tu teléfono y el código de cualquiera de tus turnos.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grain relative min-h-svh overflow-hidden pt-10">
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap text-[18vw] leading-none"
      >
        TU SILLA
      </span>
      <div className="relative mx-auto max-w-md px-5 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-smoke transition-colors hover:text-copper"
        >
          <ArrowLeft size={16} /> Will Santoyo
        </Link>
        <h1 className="display mt-6 text-5xl text-chalk">
          Mi <span className="text-copper">historial</span>
        </h1>
        <p className="mt-2 text-smoke">
          Tu teléfono es la llave; el código de cualquiera de tus turnos, el comprobante.
        </p>

        {!data && (
          <form onSubmit={search} className="mt-10 space-y-5">
            {error && (
              <div className="rounded-sm border border-brick bg-brick/15 px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm text-smoke">WhatsApp</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="300 123 4567"
                inputMode="tel"
                required
                className="focus-ring min-h-13 w-full rounded-sm border border-edge bg-coal px-4 py-3.5 text-base text-chalk placeholder:text-smoke/50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-smoke">
                Código de cualquiera de tus turnos
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3"
                maxLength={8}
                required
                className="focus-ring data min-h-13 w-full rounded-sm border border-edge bg-coal px-4 py-3.5 text-base uppercase tracking-[0.3em] text-chalk placeholder:tracking-normal placeholder:text-smoke/50"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="display flex min-h-13 w-full items-center justify-center gap-2 rounded-sm bg-copper px-6 text-lg text-on-copper transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <History size={18} />}
              Ver mi historial
            </button>
          </form>
        )}

        {data && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            {/* Tarjeta de fidelidad: cada corte suma — sin pagos en línea */}
            <div className="surface surface mt-8 p-5">
              <p className="data text-[11px] uppercase tracking-[0.3em] text-copper">
                Tarjeta de fidelidad · {data.customer_name.split(" ")[0]}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: data.loyalty.target }, (_, i) => (
                  <span
                    key={i}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      i < data.loyalty.progress
                        ? "border-copper bg-copper text-on-copper"
                        : "border-edge text-smoke/40"
                    }`}
                  >
                    <Scissors size={14} />
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-chalk">
                Llevas{" "}
                <span className="data font-semibold text-copper">
                  {data.loyalty.progress}
                </span>{" "}
                de <span className="data">{data.loyalty.target}</span>
                {(data.loyalty.referral_bonus > 0 || data.loyalty.review_bonus > 0) && (
                  <span className="text-smoke">
                    {" "}
                    (cortes {data.loyalty.completed_count}
                    {data.loyalty.referral_bonus > 0 &&
                      ` + ${data.loyalty.referral_bonus} por referidos`}
                    {data.loyalty.review_bonus > 0 &&
                      ` + ${data.loyalty.review_bonus} por reseñas`}
                    )
                  </span>
                )}{" "}
                —{" "}
                {data.loyalty.remaining === data.loyalty.target
                  ? "arranca tu ronda."
                  : `te faltan ${data.loyalty.remaining} para: `}
                {data.loyalty.remaining !== data.loyalty.target && (
                  <span className="text-copper">{data.loyalty.reward}</span>
                )}
              </p>
              {data.loyalty.earned_rewards > 0 && (
                <p className="data mt-2 text-xs uppercase tracking-wider text-copper">
                  ★ {data.loyalty.earned_rewards} recompensa(s) ganada(s) — se redimen
                  en el local
                </p>
              )}
            </div>

            {/* Código de referido: recomienda y suma tijeras */}
            <div className="surface mt-4 border border-edge bg-coal p-5">
              <p className="data text-[11px] uppercase tracking-[0.3em] text-smoke">
                Tu código de amigo
              </p>
              <p className="stamped selectable mt-2 text-3xl tracking-[0.2em] text-copper">
                {data.referral_code}
              </p>
              <p className="mt-2 text-xs text-smoke">
                Compártelo: cuando un amigo nuevo agende con tu código y complete su
                corte, <span className="text-copper">tú sumas una tijera</span> en la
                tarjeta.
                {data.loyalty.referral_bonus > 0 && (
                  <span className="data ml-1 text-copper">
                    Ya llevas {data.loyalty.referral_bonus}.
                  </span>
                )}
              </p>
            </div>

            {/* Historial */}
            <p className="data mt-8 text-[11px] uppercase tracking-[0.3em] text-smoke">
              Tus turnos ({data.appointments.length})
            </p>
            <ul className="mt-3 space-y-2.5">
              {data.appointments.map((appointment) => (
                <li
                  key={appointment.manage_code}
                  className="rounded-sm border border-edge bg-coal px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-chalk">
                      <span className="data mr-2 text-copper">{appointment.date_local}</span>
                      <span className="data text-smoke">{appointment.time_local}</span>
                    </p>
                    <StatusBadge status={appointment.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-smoke">
                    {appointment.services.join(", ")} ·{" "}
                    <span className="data">{formatCOP(appointment.total_cop)}</span>
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    <Link
                      href={`/turno/${appointment.manage_code}`}
                      className="data text-[11px] uppercase tracking-wider text-smoke transition-colors hover:text-copper"
                    >
                      Ver tiquete →
                    </Link>
                    {appointment.can_review && (
                      <Link
                        href={`/turno/${appointment.manage_code}`}
                        className="data flex items-center gap-1 text-[11px] uppercase tracking-wider text-copper"
                      >
                        <Star size={11} /> Deja tu reseña
                      </Link>
                    )}
                    {appointment.review_rating && (
                      <span className="data text-[11px] text-copper">
                        {"★".repeat(appointment.review_rating)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <button
              onClick={() => setData(null)}
              className="data mt-8 w-full text-center text-xs uppercase tracking-widest text-smoke transition-colors hover:text-copper"
            >
              Consultar otro teléfono
            </button>
          </motion.div>
        )}
      </div>
    </main>
  );
}

"use client";

/** Seguridad (solo admin): eventos registrados por el backend — intentos de
 * login fallidos, bloqueos, honeypots, rate limits, fallos de firma del
 * webhook de pagos y ráfagas de reservas. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { SecurityEventRow } from "@/lib/types";
import { PageTitle, buttonGhost } from "@/components/admin/shared";

const KIND_LABELS: Record<string, { label: string; tone: "info" | "warn" | "bad" }> = {
  login_success: { label: "Login correcto", tone: "info" },
  login_failed: { label: "Login fallido", tone: "warn" },
  login_locked: { label: "Cuenta/IP bloqueada", tone: "bad" },
  password_changed: { label: "Contraseña cambiada", tone: "info" },
  rate_limited: { label: "Rate limit activado", tone: "warn" },
  honeypot: { label: "Bot (honeypot)", tone: "bad" },
  captcha_failed: { label: "CAPTCHA fallido", tone: "warn" },
  webhook_bad_signature: { label: "Webhook: firma inválida", tone: "bad" },
  webhook_rejected: { label: "Webhook rechazado", tone: "warn" },
  booking_burst: { label: "Ráfaga de reservas", tone: "warn" },
  booking_created: { label: "Reserva pública", tone: "info" },
};

const FILTERS = [
  { kind: "", label: "Todo" },
  { kind: "login_failed", label: "Logins fallidos" },
  { kind: "login_locked", label: "Bloqueos" },
  { kind: "rate_limited", label: "Rate limits" },
  { kind: "honeypot", label: "Bots" },
  { kind: "booking_burst", label: "Ráfagas" },
];

const TONE_CLASS = {
  info: "border-line text-ink-soft",
  warn: "border-brand/50 text-brand",
  bad: "border-err/60 text-err",
};

export default function SecurityPage() {
  const [events, setEvents] = useState<SecurityEventRow[] | null>(null);
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setEvents(null);
    adminApi
      .securityEvents(kind || undefined)
      .then((rows) => setEvents(rows.filter((r) => r.kind !== "booking_created")))
      .catch((err) => setError(err.message));
  }, [kind]);

  useEffect(load, [load]);

  if (error) return <p className="text-err">{error}</p>;

  return (
    <>
      <PageTitle
        title="Seguridad"
        subtitle="Intentos de intrusión, bots y patrones inusuales detectados por el backend"
        action={
          <button onClick={load} className={buttonGhost}>
            <RefreshCw size={14} className="mr-2 inline" /> Actualizar
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-sm border border-line p-1">
        {FILTERS.map((filter) => (
          <button
            key={filter.kind}
            onClick={() => setKind(filter.kind)}
            className={`data rounded-sm px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
              kind === filter.kind ? "bg-brand text-on-brand" : "text-ink-soft hover:text-ink"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {!events ? (
        <div className="flex min-h-[40vh] items-center justify-center text-brand">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-line p-12 text-center">
          <ShieldAlert size={28} className="text-ink-soft/50" />
          <p className="text-sm text-ink-soft">Sin eventos registrados. Todo tranquilo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-card">
              <tr className="data text-[11px] uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Cuándo</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const meta = KIND_LABELS[event.kind] ?? {
                  label: event.kind,
                  tone: "info" as const,
                };
                return (
                  <tr key={event.id} className="border-t border-line">
                    <td className="data whitespace-nowrap px-4 py-2.5 text-xs text-ink-soft">
                      {new Date(event.created_at).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`data inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${TONE_CLASS[meta.tone]}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="data px-4 py-2.5 text-xs text-ink">
                      {event.username ?? "—"}
                    </td>
                    <td className="data px-4 py-2.5 text-xs text-ink-soft">{event.ip ?? "—"}</td>
                    <td className="data max-w-[280px] truncate px-4 py-2.5 text-xs text-ink-soft">
                      {Object.entries(event.detail ?? {})
                        .filter(([, v]) => v != null && v !== "")
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

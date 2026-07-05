"use client";

/** Dashboard: turnos de HOY por barbero, turno en curso, próximos.
 * Sin canal de notificación externo (ADR-009): el indicador de "turnos nuevos
 * sin revisar" compara created_at contra la última revisión (localStorage). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, BellRing, Clock3, Loader2, RefreshCw, Scissors, UserX } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { formatCOP, type AppointmentAdmin, type DashboardData } from "@/lib/types";
import { PageTitle, StatusBadge, buttonGhost } from "@/components/admin/shared";

const LAST_SEEN_KEY = "badboys.dashboard.lastSeen";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    setLastSeen(window.localStorage.getItem(LAST_SEEN_KEY));
    load();
    const timer = setInterval(load, 60_000); // refresco cada minuto
    return () => clearInterval(timer);
  }, [load]);

  const newAppointments = useMemo(() => {
    if (!data) return [];
    const threshold = lastSeen ? new Date(lastSeen) : null;
    return data.barbers
      .flatMap((block) => block.all_today)
      .filter((a) => (threshold ? new Date(a.created_at) > threshold : true));
  }, [data, lastSeen]);

  // Resumen ejecutivo del día: todo sale del payload que ya tenemos.
  // El dinero es solo REGISTRO (efectivo/datáfono en el local, sin cobro en línea).
  const summary = useMemo(() => {
    if (!data) return null;
    const all = data.barbers.flatMap((block) => block.all_today);
    const now = new Date();
    const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const done = all.filter((a) => a.status === "completado");
    const active = all.filter(
      (a) => a.status === "confirmado" || a.status === "pendiente" || a.status === "en_curso",
    );
    return {
      earned: done.reduce((sum, a) => sum + a.total_cop, 0),
      expected: active.reduce((sum, a) => sum + a.total_cop, 0),
      doneCount: done.length,
      activeCount: active.length,
      overdue: all.filter((a) => a.status === "confirmado" && a.end_time_local < nowHM),
    };
  }, [data]);

  function markSeen() {
    const now = new Date().toISOString();
    window.localStorage.setItem(LAST_SEEN_KEY, now);
    setLastSeen(now);
  }

  async function setStatus(appointment: AppointmentAdmin, status: string) {
    setBusy(appointment.id);
    try {
      await adminApi.setStatus(appointment.id, status);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(null);
    }
  }

  if (error) return <p className="text-wine">{error}</p>;
  if (!data)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );

  return (
    <>
      <PageTitle
        title="Hoy"
        subtitle={data.date_local}
        action={
          <button onClick={load} className={buttonGhost}>
            <RefreshCw size={14} className="mr-2 inline" />
            Actualizar
          </button>
        }
      />

      {/* Resumen ejecutivo: el pulso del día de un vistazo */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="plate clip-corner p-4">
            <p className="data flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-bone-2">
              <Banknote size={13} className="text-gold" /> Caja de hoy
            </p>
            <p className="data mt-1 text-2xl font-semibold text-gold">
              {formatCOP(summary.earned)}
            </p>
            <p className="data mt-0.5 text-[11px] text-bone-2">
              + {formatCOP(summary.expected)} por atender
            </p>
          </div>
          <div className="plate clip-corner p-4">
            <p className="data flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-bone-2">
              <Scissors size={13} className="text-gold" /> Atendidos
            </p>
            <p className="data mt-1 text-2xl font-semibold text-bone">{summary.doneCount}</p>
          </div>
          <div className="plate clip-corner p-4">
            <p className="data flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-bone-2">
              <Clock3 size={13} className="text-gold" /> En fila
            </p>
            <p className="data mt-1 text-2xl font-semibold text-bone">{summary.activeCount}</p>
          </div>
          <div
            className={`plate clip-corner p-4 ${summary.overdue.length > 0 ? "border-wine/60" : ""}`}
          >
            <p className="data flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-bone-2">
              <UserX size={13} className={summary.overdue.length > 0 ? "text-wine" : "text-gold"} />
              Vencidos sin atender
            </p>
            <p
              className={`data mt-1 text-2xl font-semibold ${
                summary.overdue.length > 0 ? "text-wine" : "text-bone"
              }`}
            >
              {summary.overdue.length}
            </p>
            {summary.overdue.length > 0 && (
              <p className="data mt-0.5 truncate text-[11px] text-bone-2">
                {summary.overdue.map((a) => `#${a.daily_number} ${a.time_local}`).join(" · ")}
              </p>
            )}
          </div>
        </div>
      )}

      {newAppointments.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-gold/50 bg-gold/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm text-bone">
            <BellRing size={16} className="shrink-0 text-gold" />
            <span>
              <strong className="text-gold">{newAppointments.length}</strong> turno(s)
              nuevo(s) sin revisar hoy
              {newAppointments.length <= 3 && (
                <span className="text-bone-2">
                  {" · "}
                  {newAppointments
                    .map((a) => `${a.time_local} ${a.customer_name}`)
                    .join(" · ")}
                </span>
              )}
            </span>
          </p>
          <button
            onClick={markSeen}
            className="rounded-sm border border-gold px-3 py-1.5 text-xs text-gold transition-colors hover:bg-gold hover:text-ink"
          >
            Marcar como revisados
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3 lg:grid-cols-2">
        {data.barbers.map((block) => (
          <section
            key={block.barber.id}
            className="rounded-sm border border-ink-3 bg-ink-2 p-5"
          >
            <header className="mb-4 flex items-center justify-between">
              <h2 className="display text-2xl text-bone">{block.barber.name}</h2>
              {block.is_day_off ? (
                <span className="rounded-full border border-wine/50 px-3 py-0.5 text-xs uppercase tracking-wider text-wine">
                  Descansa hoy
                </span>
              ) : (
                <span className="text-xs text-bone-2">
                  {block.done_count} atendidos
                </span>
              )}
            </header>

            {/* Turno en curso */}
            {block.current ? (
              <div className="mb-4 rounded-sm border border-gold/50 bg-gold/10 p-4">
                <p className="mb-1 text-[11px] uppercase tracking-widest text-gold">
                  En el sillón · #{block.current.daily_number}
                </p>
                <p className="text-bone">{block.current.customer_name}</p>
                <p className="text-xs text-bone-2">
                  {block.current.time_local}–{block.current.end_time_local} ·{" "}
                  {block.current.services.map((s) => s.name).join(", ")}
                </p>
                <div className="mt-3 flex gap-2">
                  {block.current.status === "confirmado" && (
                    <button
                      disabled={busy === block.current.id}
                      onClick={() => setStatus(block.current!, "en_curso")}
                      className="rounded-sm bg-gold px-3 py-1.5 text-xs text-ink"
                    >
                      Iniciar
                    </button>
                  )}
                  <button
                    disabled={busy === block.current.id}
                    onClick={() => setStatus(block.current!, "completado")}
                    className="rounded-sm border border-gold/50 px-3 py-1.5 text-xs text-gold"
                  >
                    Completar
                  </button>
                </div>
              </div>
            ) : (
              !block.is_day_off && (
                <p className="mb-4 rounded-sm border border-dashed border-ink-3 p-4 text-center text-xs text-bone-2">
                  Sillón libre
                </p>
              )
            )}

            {/* Próximos */}
            <p className="mb-2 text-[11px] uppercase tracking-widest text-bone-2">
              Próximos ({block.upcoming.length})
            </p>
            <ul className="space-y-2">
              {block.upcoming.slice(0, 5).map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex items-center justify-between gap-3 rounded-sm bg-ink px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-bone">
                      <span className="data mr-2 font-medium text-gold">
                        {appointment.time_local}
                      </span>
                      {appointment.customer_name}
                    </p>
                    <p className="truncate text-xs text-bone-2">
                      #{appointment.daily_number} ·{" "}
                      {appointment.services.map((s) => s.name).join(", ")} ·{" "}
                      {formatCOP(appointment.total_cop)}
                    </p>
                  </div>
                  <StatusBadge status={appointment.status} />
                </li>
              ))}
              {block.upcoming.length === 0 && (
                <li className="py-2 text-center text-xs text-bone-2/60">
                  Sin más turnos hoy
                </li>
              )}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

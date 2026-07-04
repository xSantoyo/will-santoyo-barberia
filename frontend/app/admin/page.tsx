"use client";

/** Dashboard: turnos de HOY por barbero, turno en curso, próximos. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { formatCOP, type AppointmentAdmin, type DashboardData } from "@/lib/types";
import { PageTitle, StatusBadge, buttonGhost } from "@/components/admin/shared";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000); // refresco cada minuto
    return () => clearInterval(timer);
  }, [load]);

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
                      <span className="display mr-2 text-gold">{appointment.time_local}</span>
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

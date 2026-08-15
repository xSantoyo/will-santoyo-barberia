"use client";

/**
 * Mi desempeño (rol barbero): SUS números, y solo los suyos.
 * El backend fuerza el alcance (barber-stats ignora cualquier barber_id ajeno
 * cuando el token es de un barbero) — esta página solo pinta.
 */
import { useEffect, useState } from "react";
import {
  Banknote,
  CalendarClock,
  Loader2,
  Scissors,
  Star,
  UserX,
  Users,
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { formatCOP, type PerformanceStats } from "@/lib/types";
import { PageTitle } from "@/components/admin/shared";

const RANGES = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
];

export default function MyPerformancePage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    adminApi
      .stats(days)
      .then(setStats)
      .catch((brick) => setError(brick.message));
  }, [days]);

  if (error) return <p className="text-brick">{error}</p>;

  return (
    <>
      <PageTitle
        title="Mi desempeño"
        subtitle="Will Santoyo"
        action={
          <div className="flex gap-1 rounded-sm border border-edge p-1">
            {RANGES.map((range) => (
              <button
                key={range.days}
                onClick={() => setDays(range.days)}
                className={`data rounded-sm px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                  days === range.days ? "bg-copper text-on-copper" : "text-smoke hover:text-chalk"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        }
      />

      {!stats ? (
        <div className="flex min-h-[40vh] items-center justify-center text-copper">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={<Scissors size={13} className="text-copper" />}
              label="Cortes completados"
              value={String(stats.completed_count)}
              hint={`en los últimos ${stats.days} días`}
            />
            <StatCard
              icon={<Banknote size={13} className="text-copper" />}
              label="Ingresos generados"
              value={formatCOP(stats.revenue_cop)}
              gold
              hint="registro del local, no cobro en línea"
            />
            <StatCard
              icon={<Users size={13} className="text-copper" />}
              label="Clientes distintos"
              value={String(stats.unique_clients)}
            />
            <StatCard
              icon={<Star size={13} className="text-copper" />}
              label="Mi calificación"
              value={stats.rating != null ? `${stats.rating} ★` : "—"}
              hint={`${stats.review_count} reseña(s) públicas`}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={<CalendarClock size={13} className="text-copper" />}
              label="Aún por atender hoy"
              value={String(stats.upcoming_today)}
            />
            <StatCard
              icon={<UserX size={13} className={stats.no_show_count > 0 ? "text-brick" : "text-copper"} />}
              label="No-shows"
              value={String(stats.no_show_count)}
              alert={stats.no_show_count > 0}
            />
            <StatCard
              icon={<UserX size={13} className="text-copper" />}
              label="Cancelados"
              value={String(stats.cancelled_count)}
            />
          </div>

          <section className="mt-8 max-w-xl rounded-sm border border-edge bg-coal p-5">
            <h2 className="display mb-4 text-2xl text-chalk">Mis servicios más pedidos</h2>
            {stats.top_services.length === 0 ? (
              <p className="text-sm text-smoke">
                Aún no hay cortes completados en este periodo.
              </p>
            ) : (
              <ul className="space-y-2">
                {stats.top_services.map((service, index) => {
                  const max = stats.top_services[0].count;
                  return (
                    <li key={service.name} className="flex items-center gap-3">
                      <span className="data w-5 text-xs text-smoke">{index + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm text-chalk">{service.name}</p>
                          <span className="data text-xs text-copper">{service.count}</span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-night">
                          <div
                            className="h-1 rounded-full bg-copper/70"
                            style={{ width: `${Math.max(8, (service.count / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="mt-6 max-w-xl text-xs text-smoke">
            Estos números cubren únicamente tu propia silla. Las analíticas del
            negocio completo viven en el panel del administrador.
          </p>
        </>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  gold,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  gold?: boolean;
  alert?: boolean;
}) {
  return (
    <div className={`surface surface p-4 ${alert ? "border-brick/60" : ""}`}>
      <p className="data flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-smoke">
        {icon} {label}
      </p>
      <p
        className={`data mt-1 text-2xl font-semibold ${
          alert ? "text-brick" : gold ? "text-copper" : "text-chalk"
        }`}
      >
        {value}
      </p>
      {hint && <p className="data mt-0.5 text-[11px] text-smoke">{hint}</p>}
    </div>
  );
}

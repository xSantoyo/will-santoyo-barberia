"use client";

/** Agenda semanal de Will, incluyendo descansos (recurrentes y puntuales). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { WEEKDAY_KEYS, type AppointmentAdmin } from "@/lib/types";
import { PageTitle, StatusBadge, buttonGhost } from "@/components/admin/shared";

interface AgendaData {
  appointments: AppointmentAdmin[];
  schedule: Record<string, { start: string; end: string } | null>;
  time_off: { id: number; date: string; reason: string | null }[];
}

function toISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7)); // lunes
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default function AgendaPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [data, setData] = useState<AgendaData | null>(null);
  const [loading, setLoading] = useState(true);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        return day;
      }),
    [weekStart],
  );

  const load = useCallback(() => {
    setLoading(true);
    adminApi
      .agenda(toISO(days[0]), toISO(days[6]))
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(load, [load]);

  const todayISO = toISO(new Date());

  return (
    <>
      <PageTitle
        title="Agenda"
        subtitle="Tu semana, con los días de descanso marcados"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const prev = new Date(weekStart);
                prev.setDate(prev.getDate() - 7);
                setWeekStart(prev);
              }}
              className={buttonGhost}
              aria-label="Semana anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} className={buttonGhost}>
              Hoy
            </button>
            <button
              onClick={() => {
                const next = new Date(weekStart);
                next.setDate(next.getDate() + 7);
                setWeekStart(next);
              }}
              className={buttonGhost}
              aria-label="Semana siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
      />

      {loading || !data ? (
        <div className="flex min-h-[40vh] items-center justify-center text-brand">
          <Loader2 className="animate-spin" size={32} />
        </div>
      ) : (
        <div className="space-y-8">
            <section>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
                {days.map((day) => {
                  const iso = toISO(day);
                  const weekdayKey = WEEKDAY_KEYS[(day.getDay() + 6) % 7];
                  const restsWeekly = !data.schedule?.[weekdayKey];
                  const timeOff = data.time_off.find(
                    (t) => t.date === iso,
                  );
                  const appointments = data.appointments
                    .filter((a) => a.date_local === iso)
                    .sort((a, b) => a.time_local.localeCompare(b.time_local));
                  const isRest = restsWeekly || Boolean(timeOff);

                  return (
                    <div
                      key={iso}
                      className={`min-h-28 rounded-sm border p-2.5 ${
                        iso === todayISO
                          ? "border-brand/60 bg-brand/5"
                          : "border-line bg-card"
                      } ${isRest ? "opacity-70" : ""}`}
                    >
                      <p className="mb-2 flex items-baseline justify-between text-xs">
                        <span className={iso === todayISO ? "text-brand" : "text-ink-soft"}>
                          {day.toLocaleDateString("es-CO", { weekday: "short", day: "numeric" })}
                        </span>
                        {isRest && (
                          <span className="text-[10px] uppercase tracking-wider text-err">
                            {timeOff ? (timeOff.reason ?? "Descanso") : "Descanso"}
                          </span>
                        )}
                      </p>
                      <ul className="space-y-1.5">
                        {appointments.map((appointment) => (
                          <li
                            key={appointment.id}
                            className="rounded-sm bg-paper px-2 py-1.5 text-xs"
                            title={`${appointment.customer_name} · ${appointment.services
                              .map((s) => s.name)
                              .join(", ")}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="data font-medium text-brand">
                                {appointment.time_local}
                              </span>
                              <StatusBadge status={appointment.status} />
                            </div>
                            <p className="mt-0.5 truncate text-ink">
                              {appointment.customer_name}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
        </div>
      )}
    </>
  );
}

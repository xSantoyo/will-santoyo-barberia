"use client";

/** Dashboard: turnos de HOY por barbero, turno en curso, próximos.
 * Sin canal de notificación externo (ADR-009): el indicador de "turnos nuevos
 * sin revisar" compara created_at contra la última revisión (localStorage). */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BellRing,
  Check,
  CircleCheck,
  Clock3,
  Copy,
  Footprints,
  Loader2,
  RefreshCw,
  Scissors,
  UserX,
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { publicApi } from "@/lib/api";
import {
  formatCOP,
  type AppointmentAdmin,
  type DashboardData,
  type ServicePublic,
} from "@/lib/types";
import {
  Modal,
  PageTitle,
  StatusBadge,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "@/components/admin/shared";
import ClientProfileModal from "@/components/admin/ClientProfileModal";

const LAST_SEEN_KEY = "badboys.dashboard.lastSeen";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [walkInFor, setWalkInFor] = useState<{ id: number; name: string } | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);

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
            <header className="mb-4 flex items-center justify-between gap-2">
              <h2 className="display text-2xl text-bone">{block.barber.name}</h2>
              <div className="flex items-center gap-2">
                {block.is_day_off ? (
                  <span className="data rounded-full border border-wine/50 px-3 py-0.5 text-[11px] uppercase tracking-wider text-wine">
                    Descansa hoy
                  </span>
                ) : (
                  <>
                    <span className="data text-xs text-bone-2">
                      {block.done_count} atendidos
                    </span>
                    <button
                      onClick={() => setWalkInFor(block.barber)}
                      title="Cliente sin cita: toma el próximo hueco de hoy"
                      className="data flex items-center gap-1.5 rounded-sm border border-gold/40 px-2.5 py-1 text-[11px] uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-ink"
                    >
                      <Footprints size={12} /> Walk-in
                    </button>
                  </>
                )}
              </div>
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
                    <p className="flex items-center gap-1.5 truncate text-sm text-bone">
                      <span className="data font-medium text-gold">
                        {appointment.time_local}
                      </span>
                      {appointment.customer_whatsapp ? (
                        <button
                          onClick={() => setProfilePhone(appointment.customer_whatsapp)}
                          title="Ver perfil del cliente (historial, fidelidad, notas)"
                          className="truncate underline-offset-4 transition-colors hover:text-gold hover:underline"
                        >
                          {appointment.customer_name}
                        </button>
                      ) : (
                        appointment.customer_name
                      )}
                      {appointment.attendance_confirmed && (
                        <CircleCheck
                          size={13}
                          className="shrink-0 text-gold"
                          aria-label="Asistencia confirmada"
                        />
                      )}
                    </p>
                    <p className="truncate text-xs text-bone-2">
                      #{appointment.daily_number} ·{" "}
                      {appointment.services.map((s) => s.name).join(", ")} ·{" "}
                      {formatCOP(appointment.total_cop)}
                      {appointment.attendance_pending && (
                        <span className="data ml-1.5 text-[10px] uppercase tracking-wider text-wine">
                          sin confirmar
                        </span>
                      )}
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

      {walkInFor && (
        <WalkInModal
          barber={walkInFor}
          onClose={() => setWalkInFor(null)}
          onCreated={load}
        />
      )}
      {profilePhone && (
        <ClientProfileModal phone={profilePhone} onClose={() => setProfilePhone(null)} />
      )}
    </>
  );
}

function WalkInModal({
  barber,
  onClose,
  onCreated,
}: {
  barber: { id: number; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [services, setServices] = useState<ServicePublic[]>([]);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppointmentAdmin | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Endpoint público (solo servicios activos): el rol barbero no tiene
    // acceso al listado administrativo de servicios y también registra walk-ins
    publicApi.services().then((active) => {
      setServices(active);
      if (active.length > 0) setServiceIds([active[0].id]); // corte clásico listo
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const appointment = await adminApi.walkIn({
        barber_id: barber.id,
        service_ids: serviceIds,
        customer_name: name.trim(),
        customer_whatsapp: phone.trim() || null,
      });
      setResult(appointment);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el walk-in");
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.manage_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* el código queda visible igual */
    }
  }

  return (
    <Modal title={`Walk-in · ${barber.name}`} onClose={onClose}>
      {result ? (
        /* La placa del walk-in: número, hora y código para dictar al cliente */
        <div className="text-center">
          <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
            En la fila de hoy
          </p>
          <p className="stamped mt-2 text-6xl text-bone">
            <span className="text-gold">#</span>
            {result.daily_number}
          </p>
          <p className="data mt-2 text-sm text-bone-2">
            Pasa a las <span className="font-semibold text-gold">{result.time_local}</span>
          </p>
          <div className="plate clip-corner mt-5 p-4">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-bone-2">
              Código del cliente
            </p>
            <p className="stamped selectable mt-1 text-3xl tracking-[0.25em]">
              {result.manage_code}
            </p>
            <button
              onClick={copyCode}
              className="data mx-auto mt-3 flex items-center gap-2 rounded-sm border border-gold px-4 py-1.5 text-xs uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-ink"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <p className="mt-3 text-xs text-bone-2">
              Díctaselo o envíaselo: con él sigue su posición en vivo en{" "}
              <span className="data text-gold">/turno/{result.manage_code}</span>
            </p>
          </div>
          <button onClick={onClose} className={`${buttonPrimary} mt-5 w-full`}>
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-bone-2">
            Cliente sin cita: toma el <strong className="text-bone">próximo hueco de hoy</strong>{" "}
            y entra a La Fila con su número.
          </p>
          {error && (
            <div className="rounded-sm border border-wine bg-wine/15 px-3 py-2 text-sm">
              {error}
            </div>
          )}
          <label className="block text-sm text-bone-2">
            Nombre
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} mt-1`}
              placeholder="Nombre del cliente"
            />
          </label>
          <label className="block text-sm text-bone-2">
            WhatsApp (opcional)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`${inputClass} mt-1`}
              placeholder="300 123 4567 — para enviarle su tiquete"
            />
          </label>
          <fieldset>
            <legend className="mb-1 text-sm text-bone-2">Servicios</legend>
            <div className="grid grid-cols-2 gap-2">
              {services.map((service) => {
                const active = serviceIds.includes(service.id);
                return (
                  <button
                    type="button"
                    key={service.id}
                    onClick={() =>
                      setServiceIds((current) =>
                        active
                          ? current.filter((id) => id !== service.id)
                          : [...current, service.id],
                      )
                    }
                    className={`rounded-sm border px-3 py-2 text-left text-xs transition-colors ${
                      active ? "border-gold bg-gold/10 text-gold" : "border-ink-3 text-bone-2"
                    }`}
                  >
                    {service.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={saving || serviceIds.length === 0 || name.trim().length < 2}
            className={`${buttonPrimary} w-full`}
          >
            {saving ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : null}
            Dar turno ahora
          </button>
        </form>
      )}
    </Modal>
  );
}

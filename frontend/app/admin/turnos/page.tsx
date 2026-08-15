"use client";

/** Gestión de turnos: historial con filtros, creación manual, reprogramar,
 * cancelar y cambio de estado. */
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Loader2, Search } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import {
  formatCOP,
  STATUS_LABELS,
  type AppointmentAdmin,
  type ServiceAdmin,
} from "@/lib/types";
import {
  Modal,
  PageTitle,
  StatusBadge,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "@/components/admin/shared";

const NEXT_STATUS: Record<string, string[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_curso", "completado", "no_show"],
  en_curso: ["completado"],
};

export default function TurnosPage() {
  const [appointments, setAppointments] = useState<AppointmentAdmin[]>([]);
  const [services, setServices] = useState<ServiceAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: "", q: "", date_from: "", date_to: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<AppointmentAdmin | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    adminApi
      .appointments(params)
      .then(setAppointments)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    load();
    adminApi.services().then(setServices);
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <PageTitle
        title="Turnos"
        subtitle="Historial completo y gestión manual (reservas telefónicas o presenciales)"
        action={
          <button onClick={() => setCreateOpen(true)} className={buttonPrimary}>
            <CalendarPlus size={16} className="mr-2 inline" />
            Turno manual
          </button>
        }
      />

      {/* Filtros */}
      <div className="mb-6 grid gap-3 rounded-sm border border-ink-3 bg-ink-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative block lg:col-span-2">
          <Search size={14} className="absolute left-3 top-3 text-bone-2" />
          <input
            placeholder="Nombre, teléfono o código…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className={`${inputClass} pl-9`}
          />
        </label>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className={inputClass}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
            className={inputClass}
          />
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
            className={inputClass}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-gold">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ink-3">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-ink-3 bg-ink-2 text-left text-xs uppercase tracking-wider text-bone-2">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Hora</th>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Servicios</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-3">
              {appointments.map((appointment) => (
                <tr key={appointment.id} className="bg-ink transition-colors hover:bg-ink-2">
                  <td className="data px-4 py-3 text-bone-2">{appointment.date_local}</td>
                  <td className="data px-4 py-3 font-medium text-gold">
                    {appointment.time_local}
                  </td>
                  <td className="data px-4 py-3 text-bone-2">#{appointment.daily_number}</td>
                  <td className="px-4 py-3">
                    <p className="text-bone">{appointment.customer_name}</p>
                    <p className="text-xs text-bone-2">{appointment.customer_whatsapp}</p>
                  </td>
                  <td className="max-w-44 truncate px-4 py-3 text-bone-2">
                    {appointment.services.map((s) => s.name).join(", ")}
                  </td>
                  <td className="data px-4 py-3 text-bone">{formatCOP(appointment.total_cop)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={appointment.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(NEXT_STATUS[appointment.status] ?? []).map((status) => (
                        <button
                          key={status}
                          onClick={() =>
                            status === "cancelado"
                              ? act(() => adminApi.cancelAppointment(appointment.id))
                              : act(() => adminApi.setStatus(appointment.id, status))
                          }
                          className="rounded-sm border border-ink-3 px-2 py-1 text-[11px] text-bone-2 transition-colors hover:border-gold/50 hover:text-gold"
                        >
                          {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
                        </button>
                      ))}
                      {(appointment.status === "confirmado" ||
                        appointment.status === "pendiente") && (
                        <>
                          <button
                            onClick={() => setRescheduling(appointment)}
                            className="rounded-sm border border-ink-3 px-2 py-1 text-[11px] text-bone-2 transition-colors hover:border-gold/50 hover:text-gold"
                          >
                            Reprogramar
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt("Motivo de cancelación (opcional):") ?? undefined;
                              act(() => adminApi.cancelAppointment(appointment.id, reason));
                            }}
                            className="rounded-sm border border-wine/40 px-2 py-1 text-[11px] text-wine transition-colors hover:bg-wine/15"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {appointments.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-bone-2">
                    Sin turnos con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <ManualBookingModal
          services={services.filter((s) => s.is_active)}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      {rescheduling && (
        <RescheduleModal
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => {
            setRescheduling(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ManualBookingModal({
  services,
  onClose,
  onCreated,
}: {
  services: ServiceAdmin[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    service_ids: [] as number[],
    date: "",
    time: "",
    customer_name: "",
    customer_whatsapp: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminApi.createAppointment({
        ...form,
        notes: form.notes || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el turno");
      setSaving(false);
    }
  }

  return (
    <Modal title="Turno manual" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-sm border border-wine bg-wine/15 px-3 py-2 text-sm">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <fieldset className="col-span-2">
            <legend className="mb-1 text-sm text-bone-2">Servicios</legend>
            <div className="grid grid-cols-2 gap-2">
              {services.map((service) => {
                const active = form.service_ids.includes(service.id);
                return (
                  <button
                    type="button"
                    key={service.id}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        service_ids: active
                          ? f.service_ids.filter((id) => id !== service.id)
                          : [...f.service_ids, service.id],
                      }))
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
          <label className="block text-sm text-bone-2">
            Fecha
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-bone-2">
            Hora
            <input
              type="time"
              required
              step={900}
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-bone-2">
            Cliente
            <input
              required
              value={form.customer_name}
              onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-bone-2">
            WhatsApp
            <input
              required
              value={form.customer_whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, customer_whatsapp: e.target.value }))}
              className={`${inputClass} mt-1`}
              placeholder="300 123 4567"
            />
          </label>
          <label className="col-span-2 block text-sm text-bone-2">
            Notas
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${inputClass} mt-1`}
              placeholder="Reserva telefónica…"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving || form.service_ids.length === 0}
          className={`${buttonPrimary} w-full`}
        >
          {saving ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : null}
          Crear turno
        </button>
      </form>
    </Modal>
  );
}

function RescheduleModal({
  appointment,
  onClose,
  onDone,
}: {
  appointment: AppointmentAdmin;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    date: appointment.date_local,
    time: appointment.time_local,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminApi.reschedule(appointment.id, form);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reprogramar");
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reprogramar #${appointment.daily_number}`} onClose={onClose}>
      <p className="mb-4 text-sm text-bone-2">
        {appointment.customer_name} · {appointment.services.map((s) => s.name).join(", ")}
      </p>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-sm border border-wine bg-wine/15 px-3 py-2 text-sm">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-bone-2">
            Nueva fecha
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-bone-2">
            Nueva hora
            <input
              type="time"
              required
              step={900}
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        <button type="submit" disabled={saving} className={`${buttonPrimary} w-full`}>
          {saving ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : null}
          Guardar cambios
        </button>
      </form>
    </Modal>
  );
}

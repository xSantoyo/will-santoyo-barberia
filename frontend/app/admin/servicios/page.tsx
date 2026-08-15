"use client";

/** Servicios y precios: editables sin tocar código (sección 17 del spec). */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { formatCOP, type ServiceAdmin } from "@/lib/types";
import { Modal, PageTitle, buttonGhost, buttonPrimary, inputClass } from "@/components/admin/shared";

export default function ServiciosPage() {
  const [services, setServices] = useState<ServiceAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ServiceAdmin | "new" | null>(null);

  const load = useCallback(() => {
    adminApi
      .services()
      .then(setServices)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-copper">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );

  return (
    <>
      <PageTitle
        title="Servicios"
        subtitle="Precios y duraciones; los cambios se reflejan al instante en el sitio"
        action={
          <button onClick={() => setEditing("new")} className={buttonPrimary}>
            <Plus size={16} className="mr-1 inline" />
            Nuevo servicio
          </button>
        }
      />

      <div className="overflow-x-auto rounded-sm border border-edge">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-edge bg-coal text-left text-xs uppercase tracking-wider text-smoke">
              <th className="px-4 py-3">Servicio</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Duración</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {services.map((service) => (
              <tr key={service.id} className="bg-night hover:bg-coal">
                <td className="px-4 py-3 text-chalk">{service.name}</td>
                <td className="data px-4 py-3 font-semibold text-copper">
                  {formatCOP(service.price_cop)}
                </td>
                <td className="data px-4 py-3 text-smoke">{service.duration_min} min</td>
                <td className="px-4 py-3">
                  {service.is_active ? (
                    <span className="text-xs text-emerald-400">Activo</span>
                  ) : (
                    <span className="text-xs text-brick">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditing(service)} className={buttonGhost}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ServiceModal
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ServiceModal({
  service,
  onClose,
  onSaved,
}: {
  service: ServiceAdmin | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: service?.name ?? "",
    price_cop: service?.price_cop ?? 30000,
    duration_min: service?.duration_min ?? 45,
    is_active: service?.is_active ?? true,
    sort_order: service?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (service) await adminApi.updateService(service.id, form);
      else await adminApi.createService(form);
      onSaved();
    } catch (brick) {
      setError(brick instanceof Error ? brick.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <Modal title={service ? `Editar ${service.name}` : "Nuevo servicio"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-sm border border-brick bg-brick/15 px-3 py-2 text-sm">{error}</div>
        )}
        <label className="block text-sm text-smoke">
          Nombre
          <input
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className={`${inputClass} mt-1`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-smoke">
            Precio (COP)
            <input
              type="number"
              required
              min={1000}
              step={500}
              value={form.price_cop}
              onChange={(e) => setForm((f) => ({ ...f, price_cop: Number(e.target.value) }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-smoke">
            Duración (min)
            <input
              type="number"
              required
              min={5}
              step={5}
              value={form.duration_min}
              onChange={(e) => setForm((f) => ({ ...f, duration_min: Number(e.target.value) }))}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        {service && (
          <label className="flex items-center gap-2 text-sm text-smoke">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-[#2a4696]"
            />
            Activo (visible y reservable)
          </label>
        )}
        <button type="submit" disabled={saving} className={`${buttonPrimary} w-full`}>
          {saving ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : null}
          Guardar
        </button>
      </form>
    </Modal>
  );
}

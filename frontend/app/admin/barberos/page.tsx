"use client";

/** Gestión de barberos: alta/edición/baja, horario semanal, descansos, foto. */
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Camera, Loader2, Pencil, UserPlus } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { mediaUrl } from "@/lib/api";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type BarberAdmin,
  type TimeOff,
  type WeeklySchedule,
} from "@/lib/types";
import {
  Modal,
  PageTitle,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "@/components/admin/shared";

const EMPTY_SCHEDULE: WeeklySchedule = {
  mon: { start: "09:00", end: "19:00" },
  tue: { start: "09:00", end: "19:00" },
  wed: { start: "09:00", end: "19:00" },
  thu: { start: "09:00", end: "19:00" },
  fri: { start: "09:00", end: "19:00" },
  sat: { start: "08:00", end: "18:00" },
  sun: null,
};

export default function BarberosPage() {
  const [barbers, setBarbers] = useState<BarberAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BarberAdmin | "new" | null>(null);
  const [timeOffFor, setTimeOffFor] = useState<BarberAdmin | null>(null);

  const load = useCallback(() => {
    adminApi
      .barbers()
      .then(setBarbers)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function uploadPhoto(barber: BarberAdmin, file: File) {
    try {
      const asset = await adminApi.uploadImage("barber", file);
      await adminApi.updateBarber(barber.id, { photo_key: asset.s3_key });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error subiendo la foto");
    }
  }

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );

  return (
    <>
      <PageTitle
        title="Barberos"
        subtitle="Equipo, horarios y días de descanso"
        action={
          <button onClick={() => setEditing("new")} className={buttonPrimary}>
            <UserPlus size={16} className="mr-2 inline" />
            Nuevo barbero
          </button>
        }
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {barbers.map((barber) => (
          <section
            key={barber.id}
            className={`rounded-sm border bg-ink-2 p-5 ${
              barber.is_active ? "border-ink-3" : "border-wine/40 opacity-60"
            }`}
          >
            <div className="flex items-start gap-4">
              <label className="group relative block h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-sm bg-ink-3">
                {barber.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl(barber.photo_url) ?? ""}
                    alt={barber.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="display flex h-full items-center justify-center text-3xl text-ink">
                    {barber.name.charAt(0)}
                  </span>
                )}
                <span className="absolute inset-0 hidden items-center justify-center bg-ink/70 group-hover:flex">
                  <Camera size={18} className="text-gold" />
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhoto(barber, file);
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <h2 className="display truncate text-2xl text-bone">{barber.name}</h2>
                <p className="truncate text-xs text-bone-2">{barber.specialty}</p>
                {barber.instagram && (
                  <p className="mt-0.5 truncate text-xs text-gold/80">{barber.instagram}</p>
                )}
                {!barber.is_active && (
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-wine">Inactivo</p>
                )}
              </div>
            </div>

            <ul className="mt-4 space-y-1 border-t border-ink-3 pt-3 text-xs">
              {WEEKDAY_KEYS.map((key) => {
                const block = barber.schedule?.[key];
                return (
                  <li key={key} className="flex justify-between">
                    <span className="text-bone-2">{WEEKDAY_LABELS[key]}</span>
                    <span className={block ? "text-bone" : "text-wine"}>
                      {block ? `${block.start} – ${block.end}` : "Descansa"}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setEditing(barber)} className={buttonGhost}>
                <Pencil size={13} className="mr-1.5 inline" />
                Editar
              </button>
              <button onClick={() => setTimeOffFor(barber)} className={buttonGhost}>
                <CalendarOff size={13} className="mr-1.5 inline" />
                Descansos
              </button>
            </div>
          </section>
        ))}
      </div>

      {editing && (
        <BarberModal
          barber={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {timeOffFor && (
        <TimeOffModal barber={timeOffFor} onClose={() => setTimeOffFor(null)} />
      )}
    </>
  );
}

function BarberModal({
  barber,
  onClose,
  onSaved,
}: {
  barber: BarberAdmin | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: barber?.name ?? "",
    specialty: barber?.specialty ?? "",
    instagram: barber?.instagram ?? "",
    schedule: (barber?.schedule && Object.keys(barber.schedule).length > 0
      ? barber.schedule
      : EMPTY_SCHEDULE) as WeeklySchedule,
    is_active: barber?.is_active ?? true,
    sort_order: barber?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setDay(key: string, block: { start: string; end: string } | null) {
    setForm((f) => ({ ...f, schedule: { ...f.schedule, [key]: block } }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (barber) {
        await adminApi.updateBarber(barber.id, {
          ...form,
          instagram: form.instagram || null,
        });
      } else {
        await adminApi.createBarber({
          name: form.name,
          specialty: form.specialty || null,
          instagram: form.instagram || null,
          schedule: form.schedule,
          sort_order: form.sort_order,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSaving(false);
    }
  }

  return (
    <Modal title={barber ? `Editar ${barber.name}` : "Nuevo barbero"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-sm border border-wine bg-wine/15 px-3 py-2 text-sm">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm text-bone-2">
            Nombre
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm text-bone-2">
            Especialidad
            <input
              value={form.specialty ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="col-span-2 block text-sm text-bone-2">
            Instagram (visible en su tarjeta del sitio)
            <input
              value={form.instagram}
              onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
              placeholder="@usuario o URL completa"
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-bone-2">Horario semanal</legend>
          <div className="space-y-2">
            {WEEKDAY_KEYS.map((key) => {
              const block = form.schedule[key];
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <label className="flex w-28 items-center gap-2 text-bone-2">
                    <input
                      type="checkbox"
                      checked={Boolean(block)}
                      onChange={(e) =>
                        setDay(key, e.target.checked ? { start: "09:00", end: "19:00" } : null)
                      }
                      className="accent-[#c9a24b]"
                    />
                    {WEEKDAY_LABELS[key]}
                  </label>
                  {block ? (
                    <>
                      <input
                        type="time"
                        value={block.start}
                        onChange={(e) => setDay(key, { ...block, start: e.target.value })}
                        className={`${inputClass} !w-auto`}
                      />
                      <span className="text-bone-2">–</span>
                      <input
                        type="time"
                        value={block.end}
                        onChange={(e) => setDay(key, { ...block, end: e.target.value })}
                        className={`${inputClass} !w-auto`}
                      />
                    </>
                  ) : (
                    <span className="text-xs uppercase tracking-wider text-wine">
                      Día de descanso
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>

        {barber && (
          <label className="flex items-center gap-2 text-sm text-bone-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-[#c9a24b]"
            />
            Activo (visible y reservable en el sitio)
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

function TimeOffModal({ barber, onClose }: { barber: BarberAdmin; onClose: () => void }) {
  const [items, setItems] = useState<TimeOff[]>([]);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.timeOff(barber.id).then(setItems);
  }, [barber.id]);

  useEffect(load, [load]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await adminApi.addTimeOff(barber.id, date, reason || undefined);
      setDate("");
      setReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <Modal title={`Descansos de ${barber.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-bone-2">
        Excepciones puntuales al horario (vacaciones, citas). El día queda bloqueado
        para reservas.
      </p>
      <form onSubmit={add} className="mb-5 flex gap-2">
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Motivo (opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputClass}
        />
        <button type="submit" className={buttonPrimary}>
          Añadir
        </button>
      </form>
      {error && (
        <div className="mb-4 rounded-sm border border-wine bg-wine/15 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <ul className="divide-y divide-ink-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-bone">
              {item.date}
              {item.reason && <span className="ml-2 text-xs text-bone-2">({item.reason})</span>}
            </span>
            <button
              onClick={() => adminApi.removeTimeOff(item.id).then(load)}
              className="text-xs text-wine hover:underline"
            >
              Quitar
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-center text-xs text-bone-2">Sin descansos programados.</li>
        )}
      </ul>
    </Modal>
  );
}

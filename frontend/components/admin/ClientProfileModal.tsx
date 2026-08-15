"use client";

/** Perfil del cliente por teléfono (Tanda 3, D2/D7): historial de estilo,
 * fidelidad y notas de estilo. */
import { useCallback, useEffect, useState } from "react";
import { Loader2, NotebookPen, Scissors, Star, Trash2 } from "lucide-react";
import { adminApi, getAuth } from "@/lib/admin-api";
import { formatCOP, type ClientProfile } from "@/lib/types";
import { Modal, StatusBadge, buttonPrimary, inputClass } from "@/components/admin/shared";

export default function ClientProfileModal({
  phone,
  onClose,
}: {
  phone: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const auth = getAuth();

  const load = useCallback(() => {
    adminApi
      .clientProfile(phone)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [phone]);

  useEffect(load, [load]);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    if (note.trim().length < 2) return;
    setSaving(true);
    try {
      await adminApi.addClientNote(phone, note.trim());
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={profile?.stats.customer_name ?? "Cliente"}
      onClose={onClose}
    >
      {error && (
        <div className="mb-4 rounded-sm border border-err bg-err/15 px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {!profile && !error && (
        <div className="flex justify-center py-10 text-brand">
          <Loader2 className="animate-spin" size={28} />
        </div>
      )}
      {profile && (
        <div className="space-y-5">
          <p className="data text-xs text-ink-soft">{profile.phone}</p>

          {/* Pulso del cliente */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "Visitas", value: profile.stats.completed_count },
              { label: "Canceladas", value: profile.stats.cancelled_count },
              { label: "No shows", value: profile.stats.no_show_count },
              {
                label: "Última",
                value: profile.stats.last_visit_local?.slice(5) ?? "—",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-sm border border-line bg-paper px-2 py-2.5">
                <p className="data text-lg font-semibold text-ink">{stat.value}</p>
                <p className="data text-[10px] uppercase tracking-wider text-ink-soft">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {/* Fidelidad */}
          <div className="plate card-frame p-4">
            <p className="data flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-brand">
              <Scissors size={12} /> Fidelidad: {profile.loyalty.progress}/
              {profile.loyalty.target}
              {profile.loyalty.earned_rewards > 0 && (
                <span className="ml-auto flex items-center gap-1 text-brand">
                  <Star size={11} className="fill-brand" />
                  {profile.loyalty.earned_rewards} por redimir
                </span>
              )}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash">
              <div
                className="h-full bg-brand"
                style={{
                  width: `${(profile.loyalty.progress / profile.loyalty.target) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Notas de estilo */}
          <div>
            <p className="data mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-ink-soft">
              <NotebookPen size={12} className="text-brand" /> Notas de estilo
            </p>
            <form onSubmit={addNote} className="flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Máquina 2 a los lados, tijera arriba…"
                className={inputClass}
              />
              <button type="submit" disabled={saving} className={buttonPrimary}>
                {saving ? <Loader2 className="animate-spin" size={14} /> : "Anotar"}
              </button>
            </form>
            <ul className="mt-3 space-y-2">
              {profile.notes.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-start justify-between gap-3 rounded-sm border border-line bg-paper px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm text-ink">{item.note}</p>
                    <p className="data mt-1 text-[10px] uppercase tracking-wider text-ink-soft">
                      {item.author_name} · {item.created_at.slice(0, 10)}
                    </p>
                  </div>
                  {(auth?.role === "admin" || auth?.username === item.author_name) && (
                    <button
                      onClick={() => adminApi.deleteClientNote(item.id).then(load)}
                      className="hidden shrink-0 text-err group-hover:block"
                      aria-label="Borrar nota"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
              {profile.notes.length === 0 && (
                <li className="py-2 text-center text-xs text-ink-soft/60">
                  Sin notas todavía — la primera vale oro.
                </li>
              )}
            </ul>
          </div>

          {/* Historial reciente */}
          <div>
            <p className="data mb-2 text-[11px] uppercase tracking-[0.25em] text-ink-soft">
              Últimos turnos
            </p>
            <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {profile.recent.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex items-center justify-between gap-2 rounded-sm bg-paper px-3 py-2 text-xs"
                >
                  <span className="truncate text-ink-soft">
                    <span className="data mr-1.5 text-brand">{appointment.date_local}</span>
                    {appointment.services.map((s) => s.name).join(", ")} ·{" "}
                    <span className="data">{formatCOP(appointment.total_cop)}</span>
                  </span>
                  <StatusBadge status={appointment.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

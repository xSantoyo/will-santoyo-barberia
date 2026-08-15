"use client";

/** Mi cuenta: cambio de la propia contraseña (admin y barbero).
 * El backend exige la contraseña actual, aplica límite estricto de intentos y
 * revoca las sesiones abiertas en otros dispositivos al cambiarla. */
import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { adminApi, getAuth } from "@/lib/admin-api";
import { PageTitle, buttonPrimary, inputClass } from "@/components/admin/shared";

export default function AccountPage() {
  const auth = getAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validNew =
    next.length >= 10 && /[a-zA-Z]/.test(next) && /[0-9]/.test(next) && next === confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validNew) return;
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      await adminApi.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (brick) {
      setError(brick instanceof Error ? brick.message : "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle
        title="Mi cuenta"
        subtitle={auth ? `${auth.username} · ${auth.role}` : undefined}
      />

      <form
        onSubmit={submit}
        className="surface max-w-md space-y-4 border border-edge bg-coal p-6"
      >
        <h2 className="display flex items-center gap-2 text-2xl text-chalk">
          <KeyRound size={20} className="text-copper" /> Cambiar contraseña
        </h2>

        {done && (
          <div className="flex items-center gap-2 rounded-sm border border-emerald-700/60 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-400">
            <CheckCircle2 size={16} />
            Contraseña actualizada. Las sesiones en otros dispositivos se cerraron.
          </div>
        )}
        {error && (
          <div className="rounded-sm border border-brick bg-brick/15 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm text-smoke">
          Contraseña actual
          <input
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-sm text-smoke">
          Contraseña nueva
          <input
            type="password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={`${inputClass} mt-1`}
          />
          <span className="mt-1 block text-xs text-smoke/70">
            Mínimo 10 caracteres, combinando letras y números.
          </span>
        </label>
        <label className="block text-sm text-smoke">
          Repite la contraseña nueva
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={`${inputClass} mt-1`}
          />
          {confirm.length > 0 && next !== confirm && (
            <span className="mt-1 block text-xs text-brick">No coinciden.</span>
          )}
        </label>

        <button type="submit" disabled={saving || !validNew} className={`${buttonPrimary} w-full`}>
          {saving && <Loader2 className="mr-2 inline animate-spin" size={16} />}
          Cambiar contraseña
        </button>
      </form>
    </>
  );
}

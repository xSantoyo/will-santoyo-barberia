"use client";

/** Buscar mi turno: teléfono + código (cuando se perdió el enlace de WhatsApp). */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { publicApi } from "@/lib/api";

export default function FindAppointmentPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const appointment = await publicApi.find(phone.trim(), code.trim().toUpperCase());
      router.push(`/turno/${appointment.manage_code}`);
    } catch {
      setError("No encontramos un turno con ese código y teléfono. Verifica los datos.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-svh pt-10">
      <div className="mx-auto max-w-md px-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-brand"
        >
          <ArrowLeft size={16} /> Will Santoyo
        </Link>
        <h1 className="display mt-6 text-5xl text-ink">
          Mi <span className="text-brand">turno</span>
        </h1>
        <p className="mt-2 text-ink-soft">
          Ingresa tu número de WhatsApp y el código que te enviamos al reservar.
        </p>

        <form onSubmit={search} className="mt-10 space-y-5">
          {error && (
            <div className="rounded-sm border border-err bg-err/15 px-4 py-3 text-sm text-ink">
              {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">WhatsApp</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="300 123 4567"
              inputMode="tel"
              required
              className="focus-ring w-full rounded-sm border border-line bg-card px-4 py-3 text-ink placeholder:text-ink-soft/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">Código del turno</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A1B2C3"
              maxLength={8}
              required
              className="focus-ring w-full rounded-sm border border-line bg-card px-4 py-3 uppercase tracking-[0.3em] text-ink placeholder:tracking-normal placeholder:text-ink-soft/50"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="display flex w-full items-center justify-center gap-2 rounded-sm bg-brand px-6 py-3.5 text-lg text-on-brand transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            Buscar mi turno
          </button>
        </form>

        <Link
          href="/mi-historial"
          className="data mt-8 block text-center text-xs uppercase tracking-widest text-ink-soft transition-colors hover:text-brand"
        >
          ¿Cliente de la casa? Mira tu historial y tu tarjeta de fidelidad →
        </Link>
      </div>
    </main>
  );
}

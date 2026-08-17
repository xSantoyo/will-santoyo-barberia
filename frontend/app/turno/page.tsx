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
          className="inline-flex items-center gap-2 text-sm text-smoke transition-colors hover:text-copper"
        >
          <ArrowLeft size={16} /> Will Barbershop
        </Link>
        <h1 className="display mt-6 text-5xl text-chalk">
          Mi <span className="text-copper">turno</span>
        </h1>
        <p className="mt-2 text-smoke">
          Ingresa tu número de WhatsApp y el código que te enviamos al reservar.
        </p>

        <form onSubmit={search} className="mt-10 space-y-5">
          {error && (
            <div className="rounded-sm border border-brick bg-brick/15 px-4 py-3 text-sm text-chalk">
              {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm text-smoke">WhatsApp</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="300 123 4567"
              inputMode="tel"
              required
              className="focus-ring w-full rounded-sm border border-edge bg-coal px-4 py-3 text-chalk placeholder:text-smoke/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-smoke">Código del turno</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A1B2C3"
              maxLength={8}
              required
              className="focus-ring w-full rounded-sm border border-edge bg-coal px-4 py-3 uppercase tracking-[0.3em] text-chalk placeholder:tracking-normal placeholder:text-smoke/50"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="display flex w-full items-center justify-center gap-2 rounded-sm bg-copper px-6 py-3.5 text-lg text-on-copper transition-transform enabled:hover:scale-[1.02] disabled:opacity-60"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            Buscar mi turno
          </button>
        </form>

        <Link
          href="/mi-historial"
          className="data mt-8 block text-center text-xs uppercase tracking-widest text-smoke transition-colors hover:text-copper"
        >
          ¿Cliente de la casa? Mira tu historial y tu tarjeta de fidelidad →
        </Link>
      </div>
    </main>
  );
}

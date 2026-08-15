"use client";

/** SIMULADOR DE PAGOS — solo modo pruebas (sin llaves de Wompi).
 * Reproduce la pantalla de checkout para demostrar el flujo completo:
 * aprobar o rechazar, y volver al retorno como lo haría Wompi. */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheck, CircleX, Loader2, ShieldAlert } from "lucide-react";
import { publicApi } from "@/lib/api";
import { formatCOP } from "@/lib/types";

function Simulator() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get("ref") ?? "";
  const amount = Number(params.get("amount") ?? 0);
  const title = params.get("titulo") ?? "Pago a Will Santoyo";
  const [busy, setBusy] = useState<"ok" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(approve: boolean) {
    setBusy(approve ? "ok" : "no");
    setError(null);
    try {
      await publicApi.simulatePayment(reference, approve);
      router.push(`/pago/retorno?ref=${encodeURIComponent(reference)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error simulando el pago");
      setBusy(null);
    }
  }

  return (
    <main className="grain texture-grid flex min-h-svh items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="clip-corner border border-gold/30 bg-ink-2 p-6">
          <p className="data flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-wine">
            <ShieldAlert size={13} /> Simulador · modo pruebas
          </p>
          <h1 className="display mt-3 text-3xl text-bone">{title}</h1>
          <p className="data mt-1 text-xs text-bone-2">Ref: {reference}</p>

          <div className="plate clip-corner mt-5 p-4 text-center">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-bone-2">
              Total a pagar
            </p>
            <p className="stamped mt-1 text-4xl text-gold">{formatCOP(amount)}</p>
            <p className="data mt-1 text-[10px] uppercase tracking-wider text-bone-2">
              Nequi · PSE · Tarjetas (simulado)
            </p>
          </div>

          {error && <p className="mt-3 text-xs text-wine">{error}</p>}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => resolve(true)}
              disabled={busy !== null}
              className="display flex min-h-13 items-center justify-center gap-2 rounded-sm bg-gold text-lg text-ink transition-all enabled:hover:scale-[1.02] disabled:opacity-60"
            >
              {busy === "ok" ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <CircleCheck size={18} />
              )}
              Aprobar
            </button>
            <button
              onClick={() => resolve(false)}
              disabled={busy !== null}
              className="flex min-h-13 items-center justify-center gap-2 rounded-sm border border-wine text-wine transition-colors enabled:hover:bg-wine enabled:hover:text-bone disabled:opacity-60"
            >
              {busy === "no" ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <CircleX size={18} />
              )}
              Rechazar
            </button>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-bone-2/70">
            En producción esta pantalla es el checkout real de Wompi (checkout.wompi.co)
            — se activa conectando las llaves del comercio, sin cambios de código.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function SimulatorPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center text-gold">
          <Loader2 className="animate-spin" size={32} />
        </main>
      }
    >
      <Simulator />
    </Suspense>
  );
}

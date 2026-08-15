"use client";

/** Retorno del checkout (Wompi redirige aquí; el simulador también).
 * Consulta el estado del pago y muestra el resultado — si fue un regalo
 * aprobado, revela el código con la pasada de navaja. */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CircleX, Loader2 } from "lucide-react";
import { publicApi } from "@/lib/api";
import { track } from "@/lib/analytics";
import { formatCOP, type PaymentStatusResponse } from "@/lib/types";
import { RazorReveal } from "@/components/public/Razor";

function Return() {
  const params = useSearchParams();
  const reference = params.get("ref") ?? "";
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);

  const load = useCallback(() => {
    publicApi
      .paymentStatus(reference)
      .then(setPayment)
      .catch(() => setPayment(null));
  }, [reference]);

  useEffect(() => {
    load();
    // Con Wompi real el webhook puede tardar unos segundos: reintenta corto
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  // Funnel: registra el resultado final del pago una sola vez (sin montos ni
  // referencias — solo tipo y estado)
  const [tracked, setTracked] = useState(false);
  useEffect(() => {
    if (!tracked && payment && payment.status !== "pendiente") {
      track("pago_resultado", { tipo: payment.kind, estado: payment.status });
      setTracked(true);
    }
  }, [payment, tracked]);

  if (!payment) {
    return (
      <main className="flex min-h-svh items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </main>
    );
  }

  const approved = payment.status === "aprobado";
  const pending = payment.status === "pendiente";

  return (
    <main className="grain texture-grid flex min-h-svh items-center justify-center px-5">
      <div className="w-full max-w-md text-center">
        {approved ? (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold">
              <Check size={32} className="text-ink" />
            </div>
            <h1 className="display text-4xl text-bone">Pago aprobado</h1>
            <p className="data mt-2 text-sm text-bone-2">
              {formatCOP(payment.amount_cop)} · {payment.payment_method ?? "—"} · ref{" "}
              {payment.reference}
            </p>

            {payment.kind === "gift" && payment.gift_code && (
              <div className="plate clip-corner mt-8 p-5">
                <p className="data text-xs uppercase tracking-[0.3em] text-gold">
                  {payment.gift_description ?? "Tu regalo"}
                </p>
                <RazorReveal code={payment.gift_code} className="mt-4">
                  <div className="texture-pinstripe h-24 rounded-sm border border-ink-3 bg-ink/60" />
                </RazorReveal>
                <p className="mt-4 text-sm text-bone">
                  <strong>Comparte este código</strong> con quien quieras regalar:
                  lo aplica al agendar su turno. Vence en 180 días.
                </p>
              </div>
            )}

            {payment.kind === "deposit" && payment.appointment_code && (
              <>
                <p className="mt-4 text-bone">
                  Tu silla quedó <span className="text-gold">confirmada</span>. El
                  anticipo se descuenta del corte en el local.
                </p>
                <Link
                  href={`/turno/${payment.appointment_code}`}
                  className="display mt-6 inline-block rounded-sm bg-gold px-8 py-3.5 text-lg text-ink transition-all hover:scale-[1.02]"
                >
                  Ver mi tiquete
                </Link>
              </>
            )}
          </>
        ) : pending ? (
          <>
            <Loader2 className="mx-auto animate-spin text-gold" size={40} />
            <h1 className="display mt-6 text-3xl text-bone">Confirmando tu pago…</h1>
            <p className="mt-2 text-sm text-bone-2">
              La pasarela está procesando. Esta página se actualiza sola.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-wine">
              <CircleX size={32} className="text-wine" />
            </div>
            <h1 className="display text-4xl text-bone">
              Pago {payment.status === "expirado" ? "vencido" : "no aprobado"}
            </h1>
            <p className="mt-3 text-sm text-bone-2">
              {payment.status === "expirado"
                ? "El plazo del anticipo venció y el hueco se liberó. Puedes agendar de nuevo."
                : "No se pudo procesar. Puedes intentarlo otra vez."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              {payment.checkout_url && (
                <a
                  href={payment.checkout_url}
                  className="display rounded-sm bg-gold px-8 py-3.5 text-lg text-ink"
                >
                  Reintentar pago
                </a>
              )}
              <Link
                href={payment.kind === "gift" ? "/regalos" : "/agendar"}
                className="text-sm text-bone-2 transition-colors hover:text-gold"
              >
                {payment.kind === "gift" ? "Volver a regalos" : "Agendar de nuevo"}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function ReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center text-gold">
          <Loader2 className="animate-spin" size={32} />
        </main>
      }
    >
      <Return />
    </Suspense>
  );
}

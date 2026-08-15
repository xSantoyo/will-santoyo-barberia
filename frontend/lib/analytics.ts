"use client";

/**
 * Analíticas de producto con PostHog (ronda de stack, jul-2026).
 *
 * Cliente mínimo A PROPÓSITO (sin posthog-js, sin autocapture, sin replay):
 * - Opt-in por despliegue: sin NEXT_PUBLIC_POSTHOG_KEY no se envía NADA
 *   (mismo patrón que Turnstile y Resend). Cero costo hasta conectar la llave;
 *   el free tier de PostHog (1M eventos/mes) sobra para este volumen.
 * - Privacidad por diseño: solo eventos explícitos del funnel con propiedades
 *   enumeradas aquí — nunca nombres, teléfonos, correos ni códigos de gestión.
 *   El distinct_id es un UUID anónimo local, no identifica a la persona.
 * - Nunca estorba: fire-and-forget, los errores se tragan en silencio.
 *
 * Si algún día se quiere session replay o heatmaps, se cambia este módulo por
 * posthog-js manteniendo las mismas llamadas track().
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const DISTINCT_KEY = "willsantoyo.analytics.id";

export function analyticsEnabled(): boolean {
  return Boolean(KEY) && typeof window !== "undefined";
}

function distinctId(): string {
  try {
    let id = window.localStorage.getItem(DISTINCT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DISTINCT_KEY, id);
    }
    return id;
  } catch {
    return "anonimo"; // sin localStorage (Safari privado): agregado igual sirve
  }
}

/** Eventos del funnel — nombres cerrados para mantener el esquema limpio. */
export type AnalyticsEvent =
  | "wizard_iniciado"
  | "wizard_paso"
  | "reserva_completada"
  | "reserva_fallida"
  | "pago_checkout_abierto"
  | "pago_resultado"
  | "regalo_checkout"
  | "resena_enviada"
  | "fila_vista";

export function track(
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean | null> = {},
): void {
  if (!analyticsEnabled()) return;
  try {
    const body = JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: distinctId(),
      properties: {
        // Solo la RUTA (sin query ni códigos): /turno/[code] se normaliza abajo
        $current_url: window.location.pathname.replace(
          /\/turno\/[A-Z2-9]+/i, "/turno/[codigo]",
        ),
        ...properties,
      },
      timestamp: new Date().toISOString(),
    });
    // sendBeacon sobrevive a la navegación (p. ej. redirect al checkout)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${HOST}/capture/`, body);
    } else {
      void fetch(`${HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
    /* las analíticas jamás rompen la experiencia */
  }
}

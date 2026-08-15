"use client";

/**
 * Defensas anti-bot de formularios públicos (auditoría jul-2026).
 *
 * - HoneypotField: campo invisible para humanos; los bots lo rellenan y el
 *   backend registra el evento y rechaza con un error genérico.
 * - Turnstile: CAPTCHA de Cloudflare (gratuito). Solo se monta si existe
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — en desarrollo queda apagado y no estorba.
 *   El backend valida el token solo cuando TURNSTILE_SECRET_KEY está
 *   configurado: ambos lados se activan en pareja.
 */
import { useEffect, useRef, useState } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function turnstileEnabled(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

/** Campo señuelo: un bot que rellena todo lo que encuentra cae; un humano no.
 *
 * INCIDENTE (ago-2026): la versión anterior usaba `name="website"` con la
 * etiqueta visible "Sitio web". Eso es justo lo que las heurísticas de
 * autocompletado de Chrome reconocen como campo de URL, así que el navegador lo
 * rellenaba solo al autocompletar los datos de contacto del cliente — y el
 * backend rechazaba a clientes reales creyéndolos bots. Un honeypot que bloquea
 * compradores es peor que no tener honeypot.
 *
 * Las tres defensas contra eso, en orden de importancia:
 *   1. Sin etiqueta ni `name` semánticos: nada que el autocompletado mapee.
 *   2. `autocomplete="off"` (débil por sí solo — Chrome lo ignora a menudo).
 *   3. `readOnly` hasta que el campo recibe foco: el autocompletado no escribe
 *      en campos de solo lectura, pero un bot que hace focus+type sí entra.
 *
 * El nombre del campo en el JSON que viaja al backend sigue siendo `website`:
 * el contrato de la API no cambia.
 */
export function HoneypotField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [locked, setLocked] = useState(true);

  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
      <input
        type="text"
        name="cf-ref"
        id="cf-ref"
        tabIndex={-1}
        readOnly={locked}
        onFocus={() => setLocked(false)}
        autoComplete="off"
        data-lpignore="true"
        data-1p-ignore="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Widget de Turnstile. No renderiza nada si no hay site key configurada. */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileEnabled() || !container.current) return;

    let cancelled = false;
    function render() {
      if (cancelled || !window.turnstile || !container.current) return;
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // onToken se captura una vez a propósito: re-render del widget lo reinicia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!turnstileEnabled()) return null;
  return <div ref={container} className="flex justify-center" />;
}

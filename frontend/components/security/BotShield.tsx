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
import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function turnstileEnabled(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

/** Campo señuelo. `website` nunca lo llena un humano: está fuera de pantalla,
 * fuera del tab order y marcado autocomplete=off. */
export function HoneypotField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
      <label>
        Sitio web
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
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

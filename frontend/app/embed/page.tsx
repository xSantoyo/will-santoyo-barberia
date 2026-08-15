"use client";

/** Widget embebible (Tanda 4, D5): tarjeta compacta para iframes en otras
 * páginas o bio-links. Uso:
 *   <iframe src="https://TU-DOMINIO/embed" width="340" height="210"
 *           style="border:0;border-radius:8px" loading="lazy"></iframe>
 */
import { useEffect, useState } from "react";
import { publicApi } from "@/lib/api";
import type { QueueBoard } from "@/lib/types";

export default function EmbedWidget() {
  const [board, setBoard] = useState<QueueBoard | null>(null);

  useEffect(() => {
    const load = () => publicApi.queue().then(setBoard).catch(() => null);
    load();
    const timer = setInterval(load, 45_000);
    return () => clearInterval(timer);
  }, []);

  // El descanso solo manda si de verdad no hay actividad ese día.
  const working =
    board !== null &&
    (!board.is_day_off || board.current !== null || board.waiting.length > 0);
  const chairFree = working && board.current === null;

  return (
    <div className="grain texture-pinstripe flex h-svh flex-col justify-between overflow-hidden border border-brand/30 bg-paper p-4">
      <div>
        <p className="display text-2xl text-ink">
          WILL<span className="text-brand"> SANTOYO</span>
        </p>
        <div className="barber-stripe mt-2 w-16" />
      </div>
      <p className="data text-sm text-ink-soft">
        {board === null
          ? "Barbería · Soacha"
          : !working
            ? "Hoy descanso — agenda para esta semana"
            : chairFree
              ? "⦿ Silla libre ahora"
              : "⦿ La fila avanza — mira tu lugar en vivo"}
      </p>
      <a
        href="/agendar"
        target="_blank"
        rel="noopener noreferrer"
        className="display block rounded-sm bg-brand px-4 py-3 text-center text-lg text-on-brand"
      >
        Agendar mi turno
      </a>
    </div>
  );
}

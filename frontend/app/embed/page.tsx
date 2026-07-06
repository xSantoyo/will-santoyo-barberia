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

  const open = board?.lanes.filter(
    (lane) => !lane.is_day_off || lane.current !== null || lane.waiting.length > 0,
  );
  const freeChairs = open?.filter((lane) => lane.current === null).length ?? 0;

  return (
    <div className="grain texture-pinstripe flex h-svh flex-col justify-between overflow-hidden border border-gold/30 bg-ink p-4">
      <div>
        <p className="display text-2xl text-bone">
          BAD<span className="text-gold"> BOYS</span>
        </p>
        <div className="barber-stripe mt-2 w-16" />
      </div>
      <p className="data text-sm text-bone-2">
        {board === null
          ? "Barbería · Colombia"
          : open && open.length > 0
            ? freeChairs > 0
              ? `⦿ ${freeChairs} silla${freeChairs === 1 ? "" : "s"} libre${freeChairs === 1 ? "" : "s"} ahora`
              : "⦿ La fila avanza — mira tu lugar en vivo"
            : "Hoy descansamos — agenda para esta semana"}
      </p>
      <a
        href="/agendar"
        target="_blank"
        rel="noopener noreferrer"
        className="display block rounded-sm bg-gold px-4 py-3 text-center text-lg text-ink"
      >
        Agendar mi turno
      </a>
    </div>
  );
}

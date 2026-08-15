"use client";

/**
 * LA FILA EN VIVO — el tablero de turnos del día.
 *
 * La pieza que no existe en ninguna app de citas genérica: en una barbería
 * de barrio la pregunta es "¿en qué turno van?", no "¿a qué hora es mi cita?".
 * Este tablero la responde en tiempo real, sirve de pantalla para el TV del
 * local y es el destino del tiquete vivo de cada cliente.
 *
 * Privacidad: el backend solo expone números y horas — nunca nombres.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Armchair, CalendarPlus, Loader2, MoonStar } from "lucide-react";
import { publicApi } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { QueueBoard } from "@/lib/types";
import FlipNumber from "@/components/public/FlipNumber";
import { RazorDivider } from "@/components/public/Razor";

const REFRESH_SECONDS = 20;

export default function BoardPage() {
  const [board, setBoard] = useState<QueueBoard | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    publicApi
      .queue()
      .then((data) => {
        setBoard(data);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    track("fila_vista"); // una vez por visita, no por refresco
    load();
    const timer = setInterval(load, REFRESH_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <main className="grain texture-grid relative min-h-svh overflow-hidden">
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 whitespace-nowrap text-[20vw] leading-none"
      >
        LA FILA
      </span>

      <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link
              href="/"
              className="data text-xs uppercase tracking-[0.3em] text-ink-soft transition-colors hover:text-brand"
            >
              ← Will Santoyo
            </Link>
            <h1 className="display mt-3 text-5xl text-ink sm:text-6xl">
              La fila <span className="text-brand">en vivo</span>
            </h1>
            <div className="brand-rule mt-3" />
          </div>
          {board && (
            <p className="data text-sm text-ink-soft">
              {board.date_local} ·{" "}
              <span className="text-brand">{board.now_local}</span> · se actualiza
              solo
            </p>
          )}
        </header>

        <div className="mt-6">
          <RazorDivider />
        </div>

        {error && (
          <p className="mt-10 text-ink-soft">
            No pudimos cargar la fila. Reintentando…
          </p>
        )}

        {!board && !error && (
          <div className="flex min-h-[40vh] items-center justify-center text-brand">
            <Loader2 className="animate-spin" size={32} />
          </div>
        )}

        {board && (
          <div className="mx-auto mt-8 max-w-lg">
            <Lane board={board} />
          </div>
        )}

        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-ink-soft">
            ¿Todavía sin turno? La fila avanza sin ti.
          </p>
          <Link
            href="/agendar"
            className="display flex min-h-13 items-center gap-2 rounded-sm bg-brand px-8 text-lg text-on-brand transition-transform duration-150 ease-[var(--ease-out-strong)] hover:scale-[1.02] active:scale-[0.97]"
          >
            <CalendarPlus size={18} /> Tomar mi turno
          </Link>
        </div>
      </div>
    </main>
  );
}

function Lane({ board }: { board: QueueBoard }) {
  const reduce = useReducedMotion();
  // El descanso solo manda si de verdad no hay actividad: un turno creado por
  // el admin en día de descanso igual debe verse en el tablero.
  const showDayOff =
    board.is_day_off && board.current === null && board.waiting.length === 0;
  return (
    <motion.section
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.2 } : { duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="plate card-frame relative p-5"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="display text-2xl text-ink">La silla de Will</h2>
        {board.served_count > 0 && (
          <span className="data text-[11px] uppercase tracking-wider text-ink-soft">
            {board.served_count} atendido{board.served_count === 1 ? "" : "s"}
          </span>
        )}
      </header>
      <div className="barber-stripe mt-3 w-16" />

      {showDayOff ? (
        <div className="mt-6 flex min-h-28 flex-col items-center justify-center gap-2 text-ink-soft">
          <MoonStar size={22} className="text-err" />
          <p className="data text-xs uppercase tracking-[0.25em]">Descansa hoy</p>
        </div>
      ) : (
        <>
          {/* El sillón */}
          <div className="texture-pinstripe mt-5 rounded-sm border border-line bg-paper/60 px-4 py-4 text-center">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-brand">
              {board.current ? "En el sillón" : "Silla libre"}
            </p>
            {board.current ? (
              <p className="stamped mt-1 text-6xl text-ink">
                <span className="text-brand">#</span>
                <FlipNumber value={String(board.current.number)} />
              </p>
            ) : (
              <p className="mt-2 flex items-center justify-center gap-2 text-ink-soft">
                <Armchair size={26} className="text-brand/70" />
                {board.waiting.length > 0 ? (
                  <span className="data text-sm">
                    sigue el <span className="text-brand">#{board.waiting[0].number}</span>
                  </span>
                ) : (
                  <span className="data text-sm">sin turnos en espera</span>
                )}
              </p>
            )}
          </div>

          {/* Los que siguen */}
          <p className="data mt-4 text-[11px] uppercase tracking-[0.3em] text-ink-soft">
            Siguen
          </p>
          {board.waiting.length === 0 ? (
            <p className="data mt-2 text-sm text-ink-soft/60">— fila despejada —</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {board.waiting.slice(0, 6).map((entry) => (
                <li
                  key={entry.number}
                  className="data rounded-sm border border-line bg-paper px-2.5 py-1.5 text-sm text-ink"
                >
                  <span className="text-brand">#{entry.number}</span>
                  <span className="ml-2 text-ink-soft">{entry.time_local}</span>
                </li>
              ))}
              {board.waiting.length > 6 && (
                <li className="data px-1 py-1.5 text-sm text-ink-soft">
                  +{board.waiting.length - 6} más
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </motion.section>
  );
}

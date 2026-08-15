"use client";

/** Disponibilidad en tiempo real en la home: cuántas sillas están libres
 * AHORA y cómo va la fila — reutiliza el endpoint público de La Fila. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Radio } from "lucide-react";
import { publicApi } from "@/lib/api";
import type { QueueBoard } from "@/lib/types";

export default function LiveStrip() {
  const [board, setBoard] = useState<QueueBoard | null>(null);

  useEffect(() => {
    const load = () => publicApi.queue().then(setBoard).catch(() => setBoard(null));
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!board) return null;

  const working =
    !board.is_day_off || board.current !== null || board.waiting.length > 0;
  if (!working) return null; // Will descansa hoy: la franja no aplica

  const waiting = board.waiting.length;
  const headline =
    board.current === null
      ? "silla libre"
      : `${waiting} esperando · atendiendo el #${board.current.number}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="relative z-10 border-y border-ink-3 bg-ink-2"
    >
      <div className="barber-stripe" />
      <Link
        href="/hoy"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-3 transition-colors hover:bg-gold/[0.04]"
      >
        <span className="data flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-bone">
          <Radio size={13} className="animate-pulse text-gold" />
          <span className="text-gold">Ahora mismo</span> · {headline}
        </span>
        <span className="data flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] text-bone-2">
          Ver la fila en vivo <ArrowRight size={13} />
        </span>
      </Link>
    </motion.div>
  );
}

"use client";

/** Piezas compartidas del panel: badges, modal, encabezados. */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { STATUS_LABELS, type AppointmentStatus } from "@/lib/types";

const BADGE: Record<AppointmentStatus, string> = {
  pendiente: "border-ink-3 text-bone-2",
  confirmado: "border-gold/50 text-gold",
  en_curso: "border-gold text-gold-2 bg-gold/10",
  completado: "border-emerald-700/60 text-emerald-400",
  cancelado: "border-wine/60 text-wine",
  no_show: "border-wine/60 text-wine",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${BADGE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-4xl text-bone">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-bone-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm border border-ink-3 bg-ink-2 p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl text-bone">{title}</h2>
          <button onClick={onClose} className="text-bone-2 hover:text-bone" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export const inputClass =
  "focus-gold w-full rounded-sm border border-ink-3 bg-ink px-3 py-2.5 text-sm text-bone placeholder:text-bone-2/50";
export const buttonPrimary =
  "display rounded-sm bg-gold px-5 py-2.5 text-ink transition-transform enabled:hover:scale-[1.02] disabled:opacity-50";
export const buttonGhost =
  "rounded-sm border border-ink-3 px-4 py-2 text-sm text-bone-2 transition-colors hover:border-gold/40 hover:text-bone";

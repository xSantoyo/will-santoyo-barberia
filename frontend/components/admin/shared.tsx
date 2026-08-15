"use client";

/** Piezas compartidas del panel: badges, modal, encabezados. */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { STATUS_LABELS, type AppointmentStatus } from "@/lib/types";

const BADGE: Record<AppointmentStatus, string> = {
  pendiente: "border-edge text-smoke",
  confirmado: "border-copper/50 text-copper",
  en_curso: "border-copper text-ember bg-copper/10",
  completado: "border-emerald-700/60 text-emerald-400",
  cancelado: "border-brick/60 text-brick",
  no_show: "border-brick/60 text-brick",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`data inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${BADGE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-4xl text-chalk">{title}</h1>
        <div className="barber-stripe mt-2 w-12" />
        {subtitle && <p className="mt-2 text-sm text-smoke">{subtitle}</p>}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="surface grain relative max-h-[90vh] w-full max-w-lg overflow-y-auto border border-copper/25 bg-coal p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl text-chalk">{title}</h2>
          <button onClick={onClose} className="text-smoke hover:text-chalk" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export const inputClass =
  "focus-ring w-full rounded-sm border border-edge bg-night px-3 py-2.5 text-sm text-chalk placeholder:text-smoke/50";
export const buttonPrimary =
  "display rounded-sm bg-copper px-5 py-2.5 text-on-copper transition-[transform,background-color] duration-150 ease-[var(--ease-out)] enabled:hover:bg-ember enabled:active:scale-[0.97] disabled:opacity-40";
export const buttonGhost =
  "rounded-sm border border-edge px-4 py-2 text-sm text-smoke transition-[border-color,color,transform] duration-150 ease-[var(--ease-out)] hover:border-copper/40 hover:text-chalk active:scale-[0.97]";

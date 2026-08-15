"use client";

/** Piezas compartidas del panel: badges, modal, encabezados. */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { STATUS_LABELS, type AppointmentStatus } from "@/lib/types";

const BADGE: Record<AppointmentStatus, string> = {
  pendiente: "border-line text-ink-soft",
  confirmado: "border-brand/50 text-brand",
  en_curso: "border-brand text-brand-deep bg-brand/10",
  completado: "border-emerald-700/60 text-emerald-400",
  cancelado: "border-err/60 text-err",
  no_show: "border-err/60 text-err",
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
        <h1 className="display text-4xl text-ink">{title}</h1>
        <div className="brand-rule mt-2" />
        {subtitle && <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-paper/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="card-frame grain relative max-h-[90vh] w-full max-w-lg overflow-y-auto border border-brand/25 bg-card p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export const inputClass =
  "focus-ring w-full rounded-sm border border-line bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft/50";
export const buttonPrimary =
  "display rounded-sm bg-brand px-5 py-2.5 text-on-brand transition-[transform,background-color] duration-150 ease-[var(--ease-out-strong)] enabled:hover:bg-brand-deep enabled:active:scale-[0.97] disabled:opacity-40";
export const buttonGhost =
  "rounded-sm border border-line px-4 py-2 text-sm text-ink-soft transition-[border-color,color,transform] duration-150 ease-[var(--ease-out-strong)] hover:border-brand/40 hover:text-ink active:scale-[0.97]";

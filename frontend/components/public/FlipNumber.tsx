"use client";

/** Número de turno con giro tipo tablero split-flap (contador de sala de
 * espera): cuando el turno cambia, la ficha vieja cae y entra la nueva. */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export default function FlipNumber({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <span
      className={`relative inline-block overflow-hidden align-baseline ${className}`}
      style={{ perspective: 400 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="data inline-block font-semibold"
          initial={reduce ? { opacity: 0 } : { rotateX: -95, y: "-30%", opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { rotateX: 0, y: "0%", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { rotateX: 95, y: "30%", opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d", display: "inline-block" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

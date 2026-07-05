"use client";

/** Micro-animación de entrada al hacer scroll (dirección de arte, sección 2).
 *
 * Nota de accesibilidad: con prefers-reduced-motion NO cambiamos la forma del
 * DOM (eso causaría un mismatch de hidratación y dejaría el contenido oculto);
 * se mantiene el mismo motion.div y solo se reduce la transición a 0s, de modo
 * que el contenido aparece instantáneamente al entrar en viewport.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {children}
    </motion.div>
  );
}

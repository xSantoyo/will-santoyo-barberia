"use client";

/** Micro-animaciones de entrada al hacer scroll.
 *
 * Nota de accesibilidad: con prefers-reduced-motion NO cambiamos la forma del
 * DOM (eso causaría un mismatch de hidratación y dejaría el contenido oculto);
 * el mismo motion.div pasa a un fundido corto sin desplazamiento.
 */
import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

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
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={
        reduce ? { duration: 0.2 } : { duration: 0.4, delay, ease: EASE }
      }
    >
      {children}
    </motion.div>
  );
}

/* --- Entradas escalonadas para listas/grillas --- */

const groupVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

// Reduced motion: el fundido se queda (ayuda a entender que entró contenido),
// el desplazamiento se va.
const itemVariantsReduced: Variants = {
  hidden: { opacity: 0, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

export function StaggerGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={groupVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} variants={reduce ? itemVariantsReduced : itemVariants}>
      {children}
    </motion.div>
  );
}

"use client";

/**
 * EL MOMENTO SEÑAL: el tiquete de turno.
 *
 * La navaja de la identidad anterior queda retirada (DESIGN_SYSTEM.md). En su
 * lugar, el gesto es de papelería de oficio:
 * - RazorDivider: regla de sección que se traza como una línea de lápiz añil.
 * - RazorReveal: el tiquete del código se imprime — el papel entra deslizando
 *   como de una impresora térmica y el código se sella carácter por carácter.
 *
 * (Los nombres exportados se conservan para no tocar los puntos de uso.)
 * Ambos respetan prefers-reduced-motion: fundido simple, sin desplazamiento.
 */
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";

const EASE = [0.23, 1, 0.32, 1] as const;

export function RazorDivider({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className={`relative mx-auto max-w-6xl px-5 ${className}`}>
      <svg
        viewBox="0 0 1200 8"
        fill="none"
        className="h-2 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <motion.line
          x1="0"
          y1="4"
          x2="1200"
          y2="4"
          stroke="#2a4696"
          strokeOpacity="0.35"
          strokeWidth="2"
          strokeDasharray="14 10"
          initial={{ pathLength: reduce ? 1 : 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: EASE }}
        />
      </svg>
    </div>
  );
}

/** El tiquete del código: papel perforado que se imprime con el código sellado. */
export function RazorReveal({
  children,
  code,
  className = "",
}: {
  children: ReactNode;
  code: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPrinted(true), reduce ? 0 : 250);
    return () => clearTimeout(timer);
  }, [reduce]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* El papel sale de la ranura (arriba), como de impresora de tiquetes */}
      <motion.div
        initial={
          reduce
            ? { opacity: 0 }
            : { opacity: 0, transform: "translateY(-24%)" }
        }
        animate={
          printed
            ? { opacity: 1, transform: "translateY(0%)" }
            : undefined
        }
        transition={reduce ? { duration: 0.2 } : { duration: 0.28, ease: EASE }}
      >
        {children}
      </motion.div>

      {/* Código sellado carácter por carácter, al asentarse el papel */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p
          data-testid="manage-code"
          className={`stamped selectable pointer-events-auto ${
            code.length > 6
              ? "text-3xl sm:text-5xl"
              : "text-5xl sm:text-6xl"
          }`}
        >
          {code.split("").map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.3 }}
              animate={printed ? { opacity: 1, scale: 1 } : undefined}
              transition={
                reduce
                  ? { duration: 0.2 }
                  : {
                      delay: 0.24 + i * 0.05,
                      type: "spring",
                      stiffness: 500,
                      damping: 26,
                    }
              }
            >
              {char}
            </motion.span>
          ))}
        </p>
      </div>
    </div>
  );
}

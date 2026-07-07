"use client";

/**
 * EL ELEMENTO SEÑAL DE BAD BOYS: "el corte de navaja".
 *
 * - RazorDivider: divisor de sección que se traza como una pasada de navaja
 *   al entrar en viewport — una línea dorada con filo, levemente inclinada,
 *   con la muesca del talón de la hoja al final.
 * - RazorReveal: el momento señal del sitio (confirmación de turno): una
 *   pasada de navaja abre la placa metálica y el código aparece troquelado
 *   carácter por carácter, como grabado en acero.
 *
 * Ambos respetan prefers-reduced-motion (aparecen sin animación).
 */
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useState } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function RazorDivider({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className={`relative mx-auto max-w-6xl px-5 ${className}`}>
      <svg
        viewBox="0 0 1200 24"
        fill="none"
        className="h-6 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        {/* La pasada: línea con leve caída, como el gesto real de la muñeca */}
        <motion.path
          d="M0 18 L1130 6"
          stroke="url(#razor-gradient)"
          strokeWidth="1.5"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: EASE }}
        />
        {/* El talón de la hoja: la muesca al final del trazo */}
        <motion.path
          d="M1130 6 L1146 1 L1152 10"
          stroke="#c9a24b"
          strokeWidth="1.5"
          strokeLinejoin="miter"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.9 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={reduce ? { duration: 0 } : { delay: 0.85, duration: 0.25 }}
        />
        <defs>
          <linearGradient id="razor-gradient" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#c9a24b" stopOpacity="0" />
            <stop offset="0.12" stopColor="#c9a24b" stopOpacity="0.55" />
            <stop offset="0.9" stopColor="#e3c887" stopOpacity="0.9" />
            <stop offset="1" stopColor="#c9a24b" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/** Pasada de navaja que revela su contenido (la placa del código). */
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
  const [cut, setCut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setCut(true), reduce ? 0 : 350);
    return () => clearTimeout(timer);
  }, [reduce]);

  return (
    <div className={`relative ${className}`}>
      {/* Contenido revelado por el corte (barrido de clip diagonal) */}
      <motion.div
        initial={
          reduce
            ? { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }
            : { clipPath: "polygon(0 0, 0 0, -12% 100%, -12% 100%)" }
        }
        animate={
          cut
            ? { clipPath: "polygon(0 0, 112% 0, 100% 100%, -12% 100%)" }
            : undefined
        }
        transition={reduce ? { duration: 0 } : { duration: 0.7, ease: EASE }}
      >
        {children}
      </motion.div>

      {/* La hoja: destello dorado que cruza la placa en el corte */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-[-12%] w-[3px] rotate-[8deg] bg-gradient-to-b from-transparent via-gold-2 to-transparent"
          style={{ boxShadow: "0 0 24px rgba(201,162,75,0.9)" }}
          initial={{ left: "-6%", opacity: 0 }}
          animate={cut ? { left: "104%", opacity: [0, 1, 1, 0] } : undefined}
          transition={{ duration: 0.7, ease: EASE, times: [0, 0.1, 0.85, 1] }}
        />
      )}

      {/* Código troquelado carácter por carácter, tras la pasada */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p
          data-testid="manage-code"
          className={`stamped selectable pointer-events-auto font-semibold ${
            code.length > 6
              ? "text-3xl tracking-[0.18em] sm:text-5xl"
              : "text-5xl tracking-[0.22em] sm:text-6xl"
          }`}
        >
          {code.split("").map((char, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: -14, scale: 1.4 }}
              animate={
                cut ? { opacity: 1, y: 0, scale: 1 } : undefined
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      delay: 0.55 + i * 0.07,
                      type: "spring",
                      stiffness: 500,
                      damping: 24,
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

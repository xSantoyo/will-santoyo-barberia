"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { mediaUrl } from "@/lib/api";
import type { MediaAsset } from "@/lib/types";

const EASE = [0.23, 1, 0.32, 1] as const;

/** Hero del estudio: papel a plena luz, nombre propio en serif y un solo CTA
 * dominante. Si hay fotos, entran como lámina lateral — nunca detrás del
 * texto, para no sacrificar contraste (DESIGN_SYSTEM.md §1). */
export default function Hero({ tagline, slides }: { tagline: string; slides: MediaAsset[] }) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <section className="grain texture-grid relative flex min-h-svh items-center overflow-hidden bg-paper">
      {/* Palabra-marca gigante de fondo, contorno en tinta */}
      <span
        aria-hidden
        className="display text-outline absolute -right-8 top-1/2 hidden -translate-y-1/2 text-[22vw] leading-none lg:block"
      >
        WS
      </span>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pt-24 pb-16 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div>
          <motion.p
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: EASE }}
            className="data mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-brand"
          >
            Barbería · Soacha, Cundinamarca
          </motion.p>

          <h1 className="display max-w-4xl text-6xl text-ink sm:text-7xl md:text-8xl">
            <span className="block overflow-hidden">
              <motion.span
                className="inline-block"
                initial={{ y: reduce ? 0 : "110%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.2, duration: reduce ? 0.2 : 0.55, ease: EASE }}
              >
                Will
              </motion.span>
            </span>
            <span className="block overflow-hidden text-brand">
              <motion.span
                className="inline-block"
                initial={{ y: reduce ? 0 : "110%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.34, duration: reduce ? 0.2 : 0.55, ease: EASE }}
              >
                Santoyo
              </motion.span>
            </span>
          </h1>

          <motion.div
            initial={{ scaleX: reduce ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.55, duration: reduce ? 0 : 0.45, ease: EASE }}
            className="barber-stripe mt-8 w-40 origin-left"
          />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="mt-6 max-w-xl text-lg text-ink-soft"
          >
            {tagline}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.3, ease: EASE }}
            className="mt-10 flex flex-wrap gap-4"
          >
            <Link
              href="/agendar"
              className="display block rounded-sm bg-brand px-8 py-4 text-lg text-on-brand transition-[transform,background-color] duration-150 ease-[var(--ease-out-strong)] hover:bg-brand-deep active:scale-[0.97]"
            >
              Reservar con Will
            </Link>
            <Link
              href="/#servicios"
              className="display block rounded-sm border border-line px-8 py-4 text-lg text-ink transition-[border-color,color] duration-150 ease-[var(--ease-out-strong)] hover:border-brand hover:text-brand"
            >
              Ver servicios
            </Link>
          </motion.div>
        </div>

        {/* Lámina de fotos: al costado, como retrato colgado del estudio */}
        {slides.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: reduce ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: reduce ? 0.2 : 0.5, ease: EASE }}
            className="card-frame relative hidden aspect-[4/5] overflow-hidden lg:block"
          >
            {slides.map((slide, i) => (
              <motion.div
                key={slide.id}
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${mediaUrl(slide.url)})` }}
                animate={{ opacity: i === index ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.8 }}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Indicador de scroll (quieto con reduced-motion) */}
      <motion.div
        className="absolute bottom-8 left-1/2 h-10 w-px -translate-x-1/2 bg-gradient-to-b from-brand to-transparent"
        animate={reduce ? { opacity: 0.6 } : { opacity: [0.2, 1, 0.2] }}
        transition={reduce ? undefined : { repeat: Infinity, duration: 2 }}
      />
    </section>
  );
}

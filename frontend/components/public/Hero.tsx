"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { mediaUrl } from "@/lib/api";
import type { MediaAsset } from "@/lib/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Hero con slides de la galería (si hay fotos) o composición tipográfica pura,
 * sobre textura de concreto + retícula urbana (misma paleta, cero colores nuevos). */
export default function Hero({ tagline, slides }: { tagline: string; slides: MediaAsset[] }) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <section className="grain texture-grid relative flex min-h-svh items-center overflow-hidden">
      {/* Fondo: foto en alto contraste o degradado de marca */}
      {slides.length > 0 ? (
        slides.map((slide, i) => (
          <motion.div
            key={slide.id}
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `linear-gradient(rgba(11,11,12,.72), rgba(11,11,12,.9)), url(${mediaUrl(slide.url)})`,
              filter: "grayscale(60%) contrast(1.1)",
            }}
            animate={{ opacity: i === index ? 1 : 0 }}
            transition={{ duration: 1.2 }}
          />
        ))
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,#1c1c21_0%,#0b0b0c_60%)]" />
      )}

      {/* Palabra-marca gigante de fondo, contorno dorado */}
      <span
        aria-hidden
        className="display text-outline absolute -right-8 top-1/2 hidden -translate-y-1/2 text-[22vw] leading-none lg:block"
      >
        BB
      </span>

      {/* Slash dorado diagonal — gesto urbano */}
      <motion.div
        aria-hidden
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ delay: 0.9, duration: reduce ? 0 : 0.8, ease: EASE }}
        className="absolute right-[16%] top-0 hidden h-full w-px origin-top rotate-12 bg-gradient-to-b from-transparent via-gold/30 to-transparent md:block"
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4 text-sm uppercase tracking-[0.35em] text-gold"
        >
          Barbería · Colombia
        </motion.p>

        <h1 className="display max-w-4xl text-6xl text-bone sm:text-7xl md:text-8xl">
          {/* Entrada palabra a palabra: más presencia sin estridencia */}
          <span className="block overflow-hidden">
            {["BAD", " ", "BOYS"].map((word, i) => (
              <motion.span
                key={i}
                className="inline-block"
                initial={{ y: "110%" }}
                animate={{ y: 0 }}
                transition={{ delay: 0.25 + i * 0.09, duration: reduce ? 0 : 0.7, ease: EASE }}
              >
                {word}
              </motion.span>
            ))}
          </span>
          <span className="block overflow-hidden text-gold">
            <motion.span
              className="inline-block"
              initial={{ y: "110%" }}
              animate={{ y: 0 }}
              transition={{ delay: 0.5, duration: reduce ? 0 : 0.7, ease: EASE }}
            >
              Barbershop
            </motion.span>
          </span>
        </h1>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.75, duration: reduce ? 0 : 0.6, ease: EASE }}
          className="barber-stripe mt-8 w-40 origin-left"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
          className="mt-6 max-w-xl text-lg text-bone-2"
        >
          {tagline}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95 }}
          className="mt-10 flex flex-wrap gap-4"
        >
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/agendar"
              className="display block rounded-sm bg-gold px-8 py-4 text-lg text-ink shadow-[0_0_0_rgba(201,162,75,0)] transition-shadow hover:shadow-[0_0_32px_rgba(201,162,75,0.25)]"
            >
              Agendar mi turno
            </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/#servicios"
              className="display block rounded-sm border border-bone/25 px-8 py-4 text-lg text-bone transition-colors hover:border-gold hover:text-gold"
            >
              Ver servicios
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Indicador de scroll */}
      <motion.div
        className="absolute bottom-8 left-1/2 h-10 w-px -translate-x-1/2 bg-gradient-to-b from-gold to-transparent"
        animate={{ opacity: [0.2, 1, 0.2] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
    </section>
  );
}

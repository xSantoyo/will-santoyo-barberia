"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { mediaUrl } from "@/lib/api";
import type { MediaAsset } from "@/lib/types";

/** Hero con slides de la galería (si hay fotos) o composición tipográfica pura. */
export default function Hero({ tagline, slides }: { tagline: string; slides: MediaAsset[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <section className="grain relative flex min-h-svh items-center overflow-hidden">
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

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pt-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-4 text-sm uppercase tracking-[0.35em] text-gold"
        >
          Barbería · Colombia
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="display max-w-4xl text-6xl text-bone sm:text-7xl md:text-8xl"
        >
          Bad Boys
          <span className="block text-gold">Barbershop</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 max-w-xl text-lg text-bone-2"
        >
          {tagline}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="mt-10 flex flex-wrap gap-4"
        >
          <Link
            href="/agendar"
            className="display rounded-sm bg-gold px-8 py-4 text-lg text-ink transition-transform hover:scale-[1.03]"
          >
            Agendar mi turno
          </Link>
          <Link
            href="/#servicios"
            className="display rounded-sm border border-bone/25 px-8 py-4 text-lg text-bone transition-colors hover:border-gold hover:text-gold"
          >
            Ver servicios
          </Link>
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

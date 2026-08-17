"use client";

/**
 * Hero — «Después de las 6».
 *
 * Composición: la luz cálida cae desde arriba (`.glow-warm`), el nombre ocupa
 * la pantalla en display XL con tracking cerrado, y al pie asoman tres datos
 * que responden lo único que importa antes de reservar: dónde estoy, cuándo
 * abro, cuánto cuesta empezar.
 *
 * Movimiento (skill `animate`, tier "primera visita" = donde vive el delight):
 * las líneas del nombre suben desde su propio alto con `translateY(110%)` bajo
 * un contenedor que las recorta — la palabra se revela, no aparece. Escalonado
 * de 90 ms entre líneas. Con `prefers-reduced-motion` todo se reduce a un
 * fundido: se conserva la comprensión, se elimina el desplazamiento.
 */
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, MapPin, Scissors } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { NEGOCIO } from "@/lib/negocio";
import type { MediaAsset } from "@/lib/types";

const EASE = [0.23, 1, 0.32, 1] as const;

export default function Hero({
  tagline,
  slides,
  desde,
}: {
  tagline: string;
  slides: MediaAsset[];
  /** Precio del servicio más barato, para el dato "desde". */
  desde: number | null;
}) {
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  /** Una línea del nombre: sube desde su propio alto, recortada por el padre. */
  const Line = ({
    children,
    delay,
    accent,
  }: {
    children: string;
    delay: number;
    accent?: boolean;
  }) => (
    <span className="block overflow-hidden">
      <motion.span
        className={accent ? "inline-block text-copper" : "inline-block"}
        initial={{
          transform: reduce ? "translateY(0%)" : "translateY(110%)",
          opacity: reduce ? 0 : 1,
        }}
        animate={{ transform: "translateY(0%)", opacity: 1 }}
        transition={{ delay, duration: reduce ? 0.2 : 0.6, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );

  return (
    <section className="grain glow-warm relative flex min-h-svh flex-col justify-center overflow-hidden bg-night">
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute -right-10 top-1/2 hidden -translate-y-1/2 text-[24vw] leading-none lg:block"
      >
        WB
      </span>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pt-28 pb-12 lg:grid-cols-[1.15fr_minmax(0,400px)]">
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="kicker mb-6 text-copper"
          >
            {NEGOCIO.ciudad} · {NEGOCIO.region}
          </motion.p>

          <h1 className="display-xl text-[clamp(3rem,8vw,5.5rem)] text-chalk">
            <Line delay={0.18}>Will</Line>
            <Line delay={0.27} accent>
              Barber Shop
            </Line>
          </h1>

          <motion.div
            initial={{ transform: reduce ? "scaleX(1)" : "scaleX(0)" }}
            animate={{ transform: "scaleX(1)" }}
            transition={{ delay: 0.5, duration: reduce ? 0 : 0.45, ease: EASE }}
            className="barber-stripe mt-8 w-44 origin-left"
          />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.3 }}
            className="mt-7 max-w-md text-lg leading-relaxed text-smoke"
          >
            {tagline}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(10px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ delay: 0.65, duration: 0.3, ease: EASE }}
            className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/agendar"
              className="group display inline-flex min-h-14 items-center justify-center gap-2 rounded-sm bg-copper px-8 text-lg text-on-copper transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-ember active:scale-[0.97]"
            >
              Reservar mi turno
              <ArrowRight
                size={18}
                className="transition-transform duration-150 ease-[var(--ease-out)] group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/hoy"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-sm px-6 text-base text-smoke transition-colors duration-150 hover:text-chalk"
            >
              Ver la fila de hoy
            </Link>
          </motion.div>
        </div>

        {/* Lámina lateral: el trabajo, no un adorno detrás del texto */}
        {slides.length > 0 && (
          <motion.div
            initial={{ opacity: 0, transform: reduce ? "translateY(0px)" : "translateY(16px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ delay: 0.4, duration: reduce ? 0.2 : 0.5, ease: EASE }}
            className="surface relative hidden aspect-[4/5] overflow-hidden lg:block"
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
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-night/80 to-transparent" />
          </motion.div>
        )}
      </div>

      {/* Barra de datos: lo que alguien necesita saber antes de reservar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="relative z-10 border-t border-edge/60"
      >
        <dl className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-edge/60 px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Dato icon={MapPin} label="Dónde" value={NEGOCIO.calle} />
          {/* Debe coincidir con SCHEDULE en backend/app/seed.py (08:00–20:00,
              lun a sáb). Si el hero promete una hora que la agenda no ofrece,
              el cliente llega al wizard y no encuentra el cupo. */}
          <Dato icon={Clock} label="Horario" value="Lun a sáb · 8:00 a 20:00" />
          <Dato
            icon={Scissors}
            label="Corte clásico"
            value={desde ? `$ ${desde.toLocaleString("es-CO")}` : "Consulta"}
          />
        </dl>
      </motion.div>
    </section>
  );
}

function Dato({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-5 sm:justify-center sm:px-6">
      <Icon size={16} className="shrink-0 text-copper" aria-hidden />
      <div className="min-w-0">
        <dt className="kicker text-smoke/70">{label}</dt>
        <dd className="mt-1 truncate text-sm text-chalk">{value}</dd>
      </div>
    </div>
  );
}

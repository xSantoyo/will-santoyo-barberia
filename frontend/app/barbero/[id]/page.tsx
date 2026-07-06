"use client";

/** Portafolio del barbero (Tanda 4, C5): su mini-sitio para compartir en redes
 * — trabajo, reseñas verificadas y agenda directa a su silla. */
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Instagram, Loader2, Star } from "lucide-react";
import { mediaUrl, publicApi } from "@/lib/api";
import type { BarberPortfolio } from "@/lib/types";
import { RazorDivider } from "@/components/public/Razor";

function instagramUrl(handle: string): string {
  return handle.startsWith("http")
    ? handle
    : `https://instagram.com/${handle.replace(/^@/, "")}`;
}

export default function BarberPortfolioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<BarberPortfolio | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    publicApi
      .portfolio(Number(id))
      .then(setData)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-5">
        <p className="display text-4xl text-bone">Barbero no encontrado</p>
        <Link href="/" className="display rounded-sm bg-gold px-6 py-3 text-ink">
          Volver al inicio
        </Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-svh items-center justify-center text-gold">
        <Loader2 className="animate-spin" size={32} />
      </main>
    );
  }

  const { barber, stats, reviews, cuts } = data;

  return (
    <main className="grain texture-grid relative min-h-svh overflow-hidden">
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 whitespace-nowrap text-[19vw] leading-none"
      >
        {barber.name.split(" ")[0].toUpperCase()}
      </span>

      <div className="relative mx-auto max-w-4xl px-5 pb-24 pt-10">
        <Link
          href="/"
          className="data text-xs uppercase tracking-[0.3em] text-bone-2 transition-colors hover:text-gold"
        >
          ← Bad Boys Barbershop
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:items-end"
        >
          <div className="grain clip-corner relative h-40 w-40 shrink-0 overflow-hidden border border-gold/30 bg-ink-3">
            {barber.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl(barber.photo_url) ?? ""}
                alt={barber.name}
                className="h-full w-full object-cover grayscale"
              />
            ) : (
              <div className="texture-pinstripe flex h-full items-center justify-center">
                <span className="display text-outline text-7xl">{barber.name.charAt(0)}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="display text-5xl text-bone sm:text-6xl">{barber.name}</h1>
            <p className="mt-1 text-bone-2">{barber.specialty}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {stats.rating !== null && (
                <span className="data flex items-center gap-1.5 text-sm text-gold">
                  <Star size={14} className="fill-gold" />
                  {stats.rating.toFixed(1)}
                  <span className="text-bone-2">({stats.review_count})</span>
                </span>
              )}
              <span className="data text-sm text-bone-2">
                {stats.completed_count} cortes en el sistema
              </span>
              {barber.instagram && (
                <a
                  href={instagramUrl(barber.instagram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="data flex items-center gap-1.5 text-sm text-bone-2 transition-colors hover:text-gold"
                >
                  <Instagram size={14} /> {barber.instagram}
                </a>
              )}
            </div>
            <div className="barber-stripe mt-4 w-28" />
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-8"
        >
          <Link
            href={`/agendar?barbero=${barber.id}`}
            className="display inline-block rounded-sm bg-gold px-8 py-4 text-lg text-ink transition-all hover:scale-[1.03] hover:shadow-[0_0_28px_rgba(201,162,75,0.3)] active:scale-95"
          >
            Agendar con {barber.name.split(" ")[0]}
          </Link>
        </motion.div>

        <div className="mt-12">
          <RazorDivider className="!px-0" />
        </div>

        {cuts.length > 0 && (
          <section className="mt-10">
            <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
              Trabajo reciente
            </p>
            <div className="mt-4 columns-2 gap-3 sm:columns-3 [&>img]:mb-3">
              {cuts.map((cut, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={mediaUrl(cut) ?? ""}
                  alt={`Corte de ${barber.name}`}
                  loading="lazy"
                  className="w-full rounded-sm border border-ink-3 grayscale-[30%]"
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <p className="data text-[11px] uppercase tracking-[0.3em] text-gold">
            Lo que dicen de su silla
          </p>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-bone-2">
              Aún sin reseñas — sé el primero después de tu corte.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {reviews.map((review, i) => (
                <figure key={i} className="plate clip-corner p-4">
                  <p className="data text-sm text-gold">
                    {"★".repeat(review.rating)}
                    <span className="text-bone-2/40">{"★".repeat(5 - review.rating)}</span>
                  </p>
                  {review.comment && (
                    <blockquote className="mt-2 text-sm text-bone">
                      “{review.comment}”
                    </blockquote>
                  )}
                  <figcaption className="data mt-3 text-[11px] uppercase tracking-wider text-bone-2">
                    {review.customer_label} · {review.date_local}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

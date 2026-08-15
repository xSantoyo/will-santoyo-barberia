/** Secciones del home de Will: quién es, servicios, trayectoria, galería, ubicación.
 *
 * Dirección de arte (feedback R1): negro dominante, texturas urbanas sutiles
 * (concreto, pinstripe, retícula) y palabras-marca gigantes de contorno — todo
 * dentro de la paleta original. Las entradas son escalonadas (StaggerGroup).
 */
import Link from "next/link";
import { Clock, Instagram, MapPin, Facebook, Music2, Scissors, Star } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import {
  formatCOP,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type Trayectoria as TrayectoriaType,
  type MediaAsset,
  type ProductPublic,
  type ReviewsResponse,
  type ServicePublic,
  type TenantPublic,
} from "@/lib/types";
import { DIRECCION_COMPLETA, MAPS_URL, NEGOCIO, whatsappUrl } from "@/lib/negocio";
import Reveal, { StaggerGroup, StaggerItem } from "./Reveal";
import { RazorDivider } from "./Razor";

function instagramUrl(handle: string): string {
  return handle.startsWith("http")
    ? handle
    : `https://instagram.com/${handle.replace(/^@/, "")}`;
}

/** Palabra-marca gigante de contorno al fondo de la sección. */
function Watermark({ word }: { word: string }) {
  return (
    <span
      aria-hidden
      className="display text-outline pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[24vw] leading-none sm:text-[17vw]"
    >
      {word}
    </span>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <Reveal>
      <p className="data mb-2 text-xs uppercase tracking-[0.3em] text-gold">{kicker}</p>
      <h2 className="display text-4xl text-bone sm:text-5xl">{title}</h2>
      <div className="gold-rule mt-4" />
    </Reveal>
  );
}

export function About({ tenant }: { tenant: TenantPublic }) {
  return (
    <section id="nosotros" className="texture-grid relative overflow-hidden">
      <Watermark word="ESTILO" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <div className="grid gap-12 md:grid-cols-2">
          <SectionTitle kicker="Quién te atiende" title="Soy Will, y corto yo" />
          <Reveal delay={0.15}>
            <p className="text-lg leading-relaxed text-bone-2">
              Para mí el corte es un ritual: precisión de estudio, actitud de barrio.
              Una silla, cero afán y un estándar que se nota en cada línea. Aquí no te
              atiende «alguien del equipo» — te atiendo yo, siempre. Llegas con una
              idea, sales con una declaración.
            </p>
            <ul className="mt-8 space-y-3 text-bone-2">
              {["Turno reservado en línea: sin filas ni llamadas", "Fades, barba y diseño — técnica y producto de primera", "Tu código de gestión en pantalla: consulta o cancela cuando quieras"].map(
                (item) => (
                  <li key={item} className="flex items-center gap-3">
                    <Scissors size={16} className="shrink-0 text-gold" />
                    {item}
                  </li>
                ),
              )}
            </ul>
            <div className="barber-stripe mt-10 w-28" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Services({ services }: { services: ServicePublic[] }) {
  return (
    <section
      id="servicios"
      className="grain texture-pinstripe relative overflow-hidden border-y border-ink-3 bg-ink-2"
    >
      <Watermark word="PRECIOS" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <RazorDivider className="mb-10 !px-0" />
        <SectionTitle kicker="Servicios" title="Precios claros" />
        <StaggerGroup className="mt-12 grid gap-x-10 gap-y-1 sm:grid-cols-2">
          {services.map((service) => (
            <StaggerItem key={service.id}>
              <div className="group flex items-baseline justify-between gap-4 border-b border-ink-3 px-2 py-5 transition-all duration-300 hover:border-gold/50 hover:bg-gold/[0.04] hover:pl-4">
                <div>
                  <h3 className="text-lg text-bone transition-colors group-hover:text-gold">
                    {service.name}
                  </h3>
                  <p className="data text-sm text-bone-2">{service.duration_min} min</p>
                </div>
                <p className="data whitespace-nowrap text-xl font-semibold text-gold transition-transform duration-300 group-hover:scale-110">
                  {formatCOP(service.price_cop)}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <Reveal delay={0.2}>
          <div className="mt-12 flex flex-wrap items-center gap-5">
            <Link
              href="/agendar"
              className="display inline-block rounded-sm bg-gold px-8 py-4 text-lg text-ink transition-all hover:scale-[1.03] hover:shadow-[0_0_32px_rgba(201,162,75,0.25)] active:scale-95"
            >
              Reservar con Will
            </Link>
            <Link
              href="/regalos"
              className="data text-xs uppercase tracking-[0.2em] text-bone-2 underline-offset-4 transition-colors hover:text-gold hover:underline"
            >
              🎁 Regala un corte →
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stars({ average, count }: { average: number; count: number }) {
  return (
    <span className="data flex items-center gap-1 text-xs text-gold">
      <Star size={12} className="fill-gold" />
      {average.toFixed(1)}
      <span className="text-bone-2">({count})</span>
    </span>
  );
}

/** La trayectoria de Will en cifras: lo que respalda la reserva. */
export function Trayectoria({ data }: { data: TrayectoriaType | null }) {
  if (!data || (data.completed_count === 0 && data.review_count === 0)) return null;
  const cifras = [
    { valor: String(data.completed_count), etiqueta: "cortes hechos" },
    ...(data.rating !== null
      ? [{ valor: data.rating.toFixed(1), etiqueta: `de ${data.review_count} reseñas` }]
      : []),
    { valor: "1", etiqueta: "silla, sin filas" },
  ];
  return (
    <section className="relative overflow-hidden border-y border-ink-3">
      <div className="relative mx-auto max-w-6xl px-5 py-16">
        <StaggerGroup className="grid gap-8 text-center sm:grid-cols-3">
          {cifras.map((cifra) => (
            <StaggerItem key={cifra.etiqueta}>
              <p className="display text-5xl text-gold sm:text-6xl">{cifra.valor}</p>
              <p className="data mt-2 text-[11px] uppercase tracking-[0.25em] text-bone-2">
                {cifra.etiqueta}
              </p>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}

export function Gallery({ items }: { items: MediaAsset[] }) {
  return (
    <section
      id="galeria"
      className="grain texture-pinstripe relative overflow-hidden border-y border-ink-3 bg-ink-2"
    >
      <Watermark word="GALERÍA" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <RazorDivider className="mb-10 !px-0" />
        <SectionTitle kicker="Galería" title="Mi trabajo" />
        {items.length === 0 ? (
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-lg text-bone-2">
              Muy pronto: fotos del local y de mis cortes. Sígueme en redes para
              ver el trabajo del día a día.
            </p>
            <div className="barber-stripe mt-10 w-28" />
          </Reveal>
        ) : (
          <StaggerGroup className="mt-12 columns-2 gap-4 md:columns-3 [&>div]:mb-4">
            {items.map((item) => (
              <StaggerItem key={item.id}>
                <div className="group overflow-hidden rounded-sm border border-ink-3 transition-colors hover:border-gold/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(item.url) ?? ""}
                    alt={item.title ?? "Corte de Will Santoyo"}
                    loading="lazy"
                    className="w-full grayscale-[40%] transition duration-500 group-hover:scale-[1.03] group-hover:grayscale-0"
                  />
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </div>
    </section>
  );
}

export function Reviews({ data }: { data: ReviewsResponse | null }) {
  if (!data || data.overall.count === 0) return null;
  return (
    <section id="resenas" className="relative overflow-hidden">
      <Watermark word="LA VOZ" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle kicker="Reseñas verificadas" title="Palabra de cliente" />
          <Reveal delay={0.1}>
            <p className="data text-right text-sm text-bone-2">
              <span className="stamped text-4xl text-gold">
                {data.overall.average?.toFixed(1)}
              </span>
              <span className="ml-2 text-gold">★</span>
              <span className="block">
                {data.overall.count} reseña{data.overall.count === 1 ? "" : "s"} de citas reales
              </span>
            </p>
          </Reveal>
        </div>
        <StaggerGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.slice(0, 6).map((review, i) => (
            <StaggerItem key={`${review.date_local}-${i}`}>
              <figure className="plate clip-corner h-full p-5">
                <p className="data text-sm text-gold">
                  {"★".repeat(review.rating)}
                  <span className="text-bone-2/40">{"★".repeat(5 - review.rating)}</span>
                </p>
                {review.comment && (
                  <blockquote className="mt-3 text-sm leading-relaxed text-bone">
                    “{review.comment}”
                  </blockquote>
                )}
                <figcaption className="data mt-4 text-[11px] uppercase tracking-wider text-bone-2">
                  {review.customer_label} · {review.date_local}
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <Reveal delay={0.15}>
          <p className="mt-8 text-xs text-bone-2/70">
            Solo pueden reseñar clientes con cita completada en el sistema — cero
            reseñas inventadas.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export function Vitrina({ products }: { products: ProductPublic[] }) {
  if (products.length === 0) return null;
  return (
    <section
      id="vitrina"
      className="grain texture-pinstripe relative overflow-hidden border-y border-ink-3 bg-ink-2"
    >
      <Watermark word="VITRINA" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <SectionTitle kicker="Productos del local" title="La vitrina" />
        <StaggerGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <StaggerItem key={product.id}>
              <div className="clip-corner group h-full border border-ink-3 bg-ink transition-all duration-300 hover:-translate-y-1 hover:border-gold/40">
                <div className="grain relative aspect-square overflow-hidden bg-ink-3">
                  {product.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(product.photo_url) ?? ""}
                      alt={product.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="texture-pinstripe flex h-full items-center justify-center">
                      <span className="display text-outline text-6xl">WS</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-bone">{product.name}</h3>
                  {product.description && (
                    <p className="mt-1 text-xs text-bone-2">{product.description}</p>
                  )}
                  <p className="data mt-2 text-lg font-semibold text-gold">
                    {formatCOP(product.price_cop)}
                  </p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <Reveal delay={0.15}>
          <p className="mt-8 text-xs text-bone-2/70">
            Se consiguen en el local — pregunta en tu próxima visita.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export function Location({ tenant }: { tenant: TenantPublic }) {
  const brand = tenant.brand_config;
  const hours = WEEKDAY_KEYS.map((key) => ({
    key,
    label: WEEKDAY_LABELS[key],
    block: tenant.business_hours?.[key] ?? null,
  }));
  return (
    <section id="ubicacion" className="texture-grid relative overflow-hidden">
      <Watermark word="VISÍTANOS" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <SectionTitle kicker="Dónde estoy" title="Ubicación y horarios" />
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <Reveal>
            <div className="space-y-5 text-bone-2">
              <p className="flex items-start gap-3">
                <MapPin className="mt-1 shrink-0 text-gold" size={18} />
                <span>
                  {NEGOCIO.calle}
                  <br />
                  {NEGOCIO.ciudad}, {NEGOCIO.region}
                </span>
              </p>
              {/* Deep link con el mensaje ya escrito: el cliente solo pulsa enviar */}
              <p className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0 fill-gold">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.1.2-3.4-.7-2.8-1.2-4.7-4-4.8-4.2-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .2 0 .8-.1 1.5Z" />
                </svg>
                <a
                  href={whatsappUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 leading-[2.75rem] transition-colors duration-150 hover:text-gold"
                >
                  {NEGOCIO.telefono}{" "}
                  <span className="data text-xs text-bone-2/70">— escríbeme</span>
                </a>
              </p>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="display inline-block rounded-sm border border-gold px-6 py-3.5 text-gold transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-strong)] hover:bg-gold hover:text-ink active:scale-[0.98]"
              >
                Abrir en Google Maps
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="clip-corner grain relative border border-ink-3 bg-ink-2 p-6">
              <p className="mb-4 flex items-center gap-2 text-sm uppercase tracking-widest text-gold">
                <Clock size={16} /> Horario
              </p>
              <ul className="divide-y divide-ink-3">
                {hours.map(({ key, label, block }) => (
                  <li
                    key={key}
                    className="flex justify-between py-2.5 text-sm transition-colors hover:bg-gold/[0.04]"
                  >
                    <span className="text-bone-2">{label}</span>
                    <span className={`data ${block ? "text-bone" : "text-wine"}`}>
                      {block ? `${block.start} – ${block.end}` : "Cerrado"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function Footer({ tenant }: { tenant: TenantPublic }) {
  const brand = tenant.brand_config;
  const socials = [
    { href: brand.instagram as string | undefined, icon: Instagram, label: "Instagram" },
    { href: brand.facebook as string | undefined, icon: Facebook, label: "Facebook" },
    { href: brand.tiktok as string | undefined, icon: Music2, label: "TikTok" },
  ].filter((s) => s.href);

  return (
    <footer className="relative overflow-hidden border-t border-ink-3 bg-ink-2">
      <div className="barber-stripe" />
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[18vw] leading-none"
      >
        WILL SANTOYO
      </span>
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-14 text-center">
        <p className="display text-3xl text-bone">
          WILL<span className="text-gold"> SANTOYO</span>
        </p>
        <div className="flex gap-6">
          {socials.map(({ href, icon: Icon, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="-m-2 p-2 text-bone-2 transition-all hover:scale-110 hover:text-gold"
            >
              <Icon size={22} />
            </a>
          ))}
        </div>
        <p className="text-xs text-bone-2/60">
          © {new Date().getFullYear()} {tenant.name}. Todos los derechos reservados.
          {" · "}
          <Link href="/admin" className="transition-colors hover:text-gold">
            Acceso administrador
          </Link>
        </p>
      </div>
    </footer>
  );
}

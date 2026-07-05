/** Secciones del home: Sobre nosotros, Servicios, Barberos, Galería, Ubicación.
 *
 * Dirección de arte (feedback R1): negro dominante, texturas urbanas sutiles
 * (concreto, pinstripe, retícula) y palabras-marca gigantes de contorno — todo
 * dentro de la paleta original. Las entradas son escalonadas (StaggerGroup).
 */
import Link from "next/link";
import { Clock, Instagram, MapPin, Facebook, Music2, Scissors } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import {
  formatCOP,
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type BarberPublic,
  type MediaAsset,
  type ServicePublic,
  type TenantPublic,
} from "@/lib/types";
import Reveal, { StaggerGroup, StaggerItem } from "./Reveal";

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
      <p className="mb-2 text-xs uppercase tracking-[0.3em] text-gold">{kicker}</p>
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
          <SectionTitle kicker="Sobre nosotros" title="Barrio, oficio y estilo" />
          <Reveal delay={0.15}>
            <p className="text-lg leading-relaxed text-bone-2">
              En <span className="text-bone">{tenant.name}</span> el corte es un ritual:
              precisión de estudio, actitud de barrio. Tres sillas, cero afán y un
              estándar que se nota en cada línea. Llegas con una idea, sales con una
              declaración.
            </p>
            <ul className="mt-8 space-y-3 text-bone-2">
              {["Turnos en línea, sin filas ni esperas", "Productos y técnica de primera", "Tu código de gestión en pantalla: consulta o cancela cuando quieras"].map(
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
        <SectionTitle kicker="Servicios" title="Precios claros" />
        <StaggerGroup className="mt-12 grid gap-x-10 gap-y-1 sm:grid-cols-2">
          {services.map((service) => (
            <StaggerItem key={service.id}>
              <div className="group flex items-baseline justify-between gap-4 border-b border-ink-3 px-2 py-5 transition-all duration-300 hover:border-gold/50 hover:bg-gold/[0.04] hover:pl-4">
                <div>
                  <h3 className="text-lg text-bone transition-colors group-hover:text-gold">
                    {service.name}
                  </h3>
                  <p className="text-sm text-bone-2">{service.duration_min} min</p>
                </div>
                <p className="display whitespace-nowrap text-2xl text-gold transition-transform duration-300 group-hover:scale-110">
                  {formatCOP(service.price_cop)}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <Reveal delay={0.2}>
          <Link
            href="/agendar"
            className="display mt-12 inline-block rounded-sm bg-gold px-8 py-4 text-lg text-ink transition-all hover:scale-[1.03] hover:shadow-[0_0_32px_rgba(201,162,75,0.25)] active:scale-95"
          >
            Reservar ahora
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function Barbers({ barbers }: { barbers: BarberPublic[] }) {
  return (
    <section id="barberos" className="relative overflow-hidden">
      <Watermark word="EQUIPO" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-28">
        <SectionTitle kicker="El equipo" title="Nuestros barberos" />
        <StaggerGroup className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {barbers.map((barber) => (
            <StaggerItem key={barber.id}>
              <div className="clip-corner group overflow-hidden border border-ink-3 bg-ink-2 transition-all duration-300 hover:-translate-y-1.5 hover:border-gold/50 hover:shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
                <div className="grain relative aspect-[4/5] overflow-hidden bg-ink-3">
                  {barber.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(barber.photo_url) ?? ""}
                      alt={barber.name}
                      className="h-full w-full object-cover grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0"
                    />
                  ) : (
                    <div className="texture-pinstripe flex h-full items-center justify-center">
                      <span className="display text-outline text-[9rem]">
                        {barber.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink to-transparent" />
                  {/* Detalle dorado de esquina */}
                  <span className="absolute left-0 top-0 h-10 w-px bg-gold/60" />
                  <span className="absolute left-0 top-0 h-px w-10 bg-gold/60" />
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="display text-2xl text-bone">{barber.name}</h3>
                    {barber.instagram && (
                      <a
                        href={instagramUrl(barber.instagram)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Instagram de ${barber.name}`}
                        title={barber.instagram}
                        className="-m-2 p-2 text-bone-2 transition-all hover:scale-110 hover:text-gold"
                      >
                        <Instagram size={20} />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 min-h-10 text-sm text-bone-2">{barber.specialty}</p>
                  <Link
                    href={`/agendar?barbero=${barber.id}`}
                    className="display mt-4 block rounded-sm border border-gold px-4 py-3.5 text-center text-gold transition-all duration-300 hover:bg-gold hover:text-ink active:scale-[0.98]"
                  >
                    Agendar con {barber.name.split(" ")[0]}
                  </Link>
                </div>
              </div>
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
        <SectionTitle kicker="Galería" title="Nuestro trabajo" />
        {items.length === 0 ? (
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-lg text-bone-2">
              Muy pronto: fotos del local y de nuestros cortes. Síguenos en redes para
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
                    alt={item.title ?? "Bad Boys Barbershop"}
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
        <SectionTitle kicker="Visítanos" title="Ubicación y horarios" />
        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <Reveal>
            <div className="space-y-5 text-bone-2">
              <p className="flex items-start gap-3">
                <MapPin className="mt-1 shrink-0 text-gold" size={18} />
                <span>{(brand.address as string) ?? "Dirección por confirmar"}</span>
              </p>
              {tenant.whatsapp_number && (
                <p className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" width="18" height="18" className="shrink-0 fill-gold">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.1.2-3.4-.7-2.8-1.2-4.7-4-4.8-4.2-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.2-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .2 0 .8-.1 1.5Z" />
                  </svg>
                  <a
                    href={`https://wa.me/${tenant.whatsapp_number.replace("+", "")}`}
                    className="transition-colors hover:text-gold"
                  >
                    {tenant.whatsapp_number}
                  </a>
                </p>
              )}
              {brand.maps_url ? (
                <a
                  href={brand.maps_url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="display inline-block rounded-sm border border-gold px-6 py-3.5 text-gold transition-all hover:bg-gold hover:text-ink active:scale-[0.98]"
                >
                  Abrir en Google Maps
                </a>
              ) : null}
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
                    <span className={block ? "text-bone" : "text-wine"}>
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
        BAD BOYS
      </span>
      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-14 text-center">
        <p className="display text-3xl text-bone">
          BAD<span className="text-gold"> BOYS</span>
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

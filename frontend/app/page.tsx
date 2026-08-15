import Navbar from "@/components/public/Navbar";
import Hero from "@/components/public/Hero";
import LiveStrip from "@/components/public/LiveStrip";
import {
  About,
  Footer,
  Gallery,
  Location,
  Reviews,
  Services,
  Trayectoria,
  Vitrina,
} from "@/components/public/Sections";
import { publicApi } from "@/lib/api";
import { NEGOCIO } from "@/lib/negocio";
import type {
  MediaAsset,
  ProductPublic,
  ReviewsResponse,
  ServicePublic,
  TenantPublic,
  Trayectoria as TrayectoriaData,
} from "@/lib/types";

// El contenido (precios, fotos, horarios) se edita desde el panel: siempre
// se sirve fresco desde la API.
export const dynamic = "force-dynamic";

const FALLBACK_TENANT: TenantPublic = {
  name: NEGOCIO.nombre,
  slug: "will-santoyo",
  whatsapp_number: NEGOCIO.telefonoE164,
  timezone: "America/Bogota",
  brand_config: { tagline: `${NEGOCIO.oficio} en ${NEGOCIO.ciudad}` },
  business_hours: {},
};

export default async function HomePage() {
  let tenant = FALLBACK_TENANT;
  let services: ServicePublic[] = [];
  let gallery: MediaAsset[] = [];
  let reviews: ReviewsResponse | null = null;
  let products: ProductPublic[] = [];
  let trayectoria: TrayectoriaData | null = null;

  try {
    [tenant, services, gallery, reviews, products, trayectoria] = await Promise.all([
      publicApi.tenant(),
      publicApi.services(),
      publicApi.media("gallery"),
      publicApi.reviews(),
      publicApi.products(),
      publicApi.trayectoria(),
    ]);
  } catch {
    // Backend no disponible: el sitio degrada con elegancia en vez de romperse.
  }

  return (
    <>
      <Navbar />
      <main>
        <Hero
          tagline={
            (tenant.brand_config.tagline as string) ??
            `${NEGOCIO.oficio} en ${NEGOCIO.ciudad}`
          }
          slides={gallery.slice(0, 4)}
          desde={
            services.length > 0
              ? Math.min(...services.map((s) => s.price_cop))
              : null
          }
        />
        <LiveStrip />
        <About tenant={tenant} />
        <Trayectoria data={trayectoria} />
        <Services services={services} />
        <Gallery items={gallery} />
        <Reviews data={reviews} />
        <Vitrina products={products} />
        <Location tenant={tenant} />
      </main>
      <Footer tenant={tenant} />
    </>
  );
}

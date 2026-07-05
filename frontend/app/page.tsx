import Navbar from "@/components/public/Navbar";
import Hero from "@/components/public/Hero";
import LiveStrip from "@/components/public/LiveStrip";
import {
  About,
  Barbers,
  Footer,
  Gallery,
  Location,
  Reviews,
  Services,
} from "@/components/public/Sections";
import { publicApi } from "@/lib/api";
import type {
  BarberPublic,
  MediaAsset,
  ReviewsResponse,
  ServicePublic,
  TenantPublic,
} from "@/lib/types";

// El contenido (precios, barberos, fotos) se edita desde el panel admin:
// siempre se sirve fresco desde la API.
export const dynamic = "force-dynamic";

const FALLBACK_TENANT: TenantPublic = {
  name: "Bad Boys Barbershop",
  slug: "bad-boys",
  whatsapp_number: null,
  timezone: "America/Bogota",
  brand_config: { tagline: "Elegancia con actitud" },
  business_hours: {},
};

export default async function HomePage() {
  let tenant = FALLBACK_TENANT;
  let barbers: BarberPublic[] = [];
  let services: ServicePublic[] = [];
  let gallery: MediaAsset[] = [];
  let reviews: ReviewsResponse | null = null;

  try {
    [tenant, barbers, services, gallery, reviews] = await Promise.all([
      publicApi.tenant(),
      publicApi.barbers(),
      publicApi.services(),
      publicApi.media("gallery"),
      publicApi.reviews(),
    ]);
  } catch {
    // Backend no disponible: el sitio degrada con elegancia en vez de romperse.
  }

  return (
    <>
      <Navbar />
      <main>
        <Hero
          tagline={(tenant.brand_config.tagline as string) ?? "Elegancia con actitud"}
          slides={gallery.slice(0, 4)}
        />
        <LiveStrip />
        <About tenant={tenant} />
        <Services services={services} />
        <Barbers barbers={barbers} ratings={reviews?.per_barber} />
        <Gallery items={gallery} />
        <Reviews data={reviews} />
        <Location tenant={tenant} />
      </main>
      <Footer tenant={tenant} />
    </>
  );
}

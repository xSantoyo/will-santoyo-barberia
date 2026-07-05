/** Pruebas de componentes clave del sitio público y utilidades. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Barbers, Services, Location } from "@/components/public/Sections";
import { StatusBadge } from "@/components/admin/shared";
import {
  formatCOP,
  type BarberPublic,
  type ServicePublic,
  type TenantPublic,
} from "@/lib/types";

const SERVICES: ServicePublic[] = [
  { id: 1, name: "Corte clásico", price_cop: 30000, duration_min: 45 },
  { id: 2, name: "Corte + barba", price_cop: 45000, duration_min: 60 },
];

const TENANT: TenantPublic = {
  name: "Bad Boys Barbershop",
  slug: "bad-boys",
  whatsapp_number: "+573000000000",
  timezone: "America/Bogota",
  brand_config: { address: "Cra. 00 # 00-00" },
  business_hours: {
    mon: { start: "09:00", end: "19:00" },
    sun: null,
  },
};

describe("formatCOP", () => {
  it("formatea pesos colombianos sin decimales", () => {
    const formatted = formatCOP(30000);
    expect(formatted).toMatch(/30\.000/); // es-CO usa punto de miles
    expect(formatted).toContain("$");
  });
});

describe("Services (sección de precios)", () => {
  it("muestra cada servicio con su precio y duración", () => {
    render(<Services services={SERVICES} />);
    expect(screen.getByText("Corte clásico")).toBeInTheDocument();
    expect(screen.getByText("Corte + barba")).toBeInTheDocument();
    expect(screen.getByText("45 min")).toBeInTheDocument();
    expect(screen.getByText(/30\.000/)).toBeInTheDocument();
    expect(screen.getByText(/45\.000/)).toBeInTheDocument();
  });

  it("incluye el llamado a reservar", () => {
    render(<Services services={SERVICES} />);
    expect(screen.getByRole("link", { name: /reservar/i })).toHaveAttribute(
      "href",
      "/agendar",
    );
  });
});

describe("Location (horarios del negocio)", () => {
  it("muestra días abiertos y cerrados", () => {
    render(<Location tenant={TENANT} />);
    expect(screen.getByText("Lunes")).toBeInTheDocument();
    expect(screen.getByText("09:00 – 19:00")).toBeInTheDocument();
    expect(screen.getByText("Domingo")).toBeInTheDocument();
    expect(screen.getAllByText("Cerrado").length).toBeGreaterThan(0);
  });
});

describe("Barbers (tarjetas del equipo)", () => {
  const BARBERS: BarberPublic[] = [
    {
      id: 1,
      name: "Barbero 1",
      specialty: "Fades",
      instagram: "@badboys.barbero1",
      photo_url: null,
      schedule: {},
    },
    {
      id: 2,
      name: "Barbero 2",
      specialty: "Barba",
      instagram: null,
      photo_url: null,
      schedule: {},
    },
  ];

  it("muestra el enlace de Instagram cuando el barbero lo tiene", () => {
    render(<Barbers barbers={BARBERS} />);
    const link = screen.getByRole("link", { name: /instagram de barbero 1/i });
    expect(link).toHaveAttribute("href", "https://instagram.com/badboys.barbero1");
    expect(link).toHaveAttribute("target", "_blank");
    // Barbero 2 no tiene Instagram: no debe renderizar el enlace
    expect(
      screen.queryByRole("link", { name: /instagram de barbero 2/i }),
    ).not.toBeInTheDocument();
  });

  it("mantiene el botón de agendar por barbero", () => {
    render(<Barbers barbers={BARBERS} />);
    // El CTA usa el primer nombre: "Agendar con Barbero"
    const links = screen.getAllByRole("link", { name: /agendar con/i });
    expect(links[0]).toHaveAttribute("href", "/agendar?barbero=1");
    expect(links[1]).toHaveAttribute("href", "/agendar?barbero=2");
  });
});

describe("StatusBadge", () => {
  it("traduce los estados a etiquetas en español", () => {
    render(<StatusBadge status="confirmado" />);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
  });
  it("marca los no-show", () => {
    render(<StatusBadge status="no_show" />);
    expect(screen.getByText("No asistió")).toBeInTheDocument();
  });
});

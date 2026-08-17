"use client";

/**
 * Layout del panel: guard de sesión en cliente + navegación.
 *
 * MÓVIL (la prioridad: Will gestiona su día desde el celular). Un rail de
 * iconos sin etiqueta se comía 64 de los 375 px y obligaba a adivinar cada
 * sección, así que en pantallas pequeñas se reemplaza por:
 *   · barra superior fija con el nombre de la sección actual,
 *   · cajón lateral que entra al pulsar el menú, con las etiquetas completas,
 *   · contenido a ancho completo, sin margen lateral robado.
 *
 * DESKTOP: se conserva la barra lateral permanente, que ahí sí sobra espacio.
 *
 * Movimiento del cajón (skill `animate`, receta "Drawer / sheet"): entra con
 * translateX desde su propio ancho usando --ease-drawer, la curva de iOS, y el
 * fondo oscurece en paralelo para que se lean como una sola superficie. Con
 * prefers-reduced-motion queda solo el fundido.
 */
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  ChartNoAxesColumn,
  Gift,
  Images,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Package,
  Scissors,
  ShieldAlert,
  Star,
  X,
} from "lucide-react";
import { adminApi, getAuth, type StoredAuth } from "@/lib/admin-api";

const NAV = [
  { href: "/admin", label: "Hoy", icon: LayoutDashboard },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/turnos", label: "Turnos", icon: ListChecks },
  { href: "/admin/resenas", label: "Reseñas", icon: Star },
  { href: "/admin/mi-desempeno", label: "Mi desempeño", icon: ChartNoAxesColumn },
  { href: "/admin/servicios", label: "Servicios", icon: Scissors },
  { href: "/admin/productos", label: "Vitrina", icon: Package },
  { href: "/admin/regalos", label: "Regalos", icon: Gift },
  { href: "/admin/galeria", label: "Galería", icon: Images },
  { href: "/admin/seguridad", label: "Seguridad", icon: ShieldAlert },
  { href: "/admin/cuenta", label: "Mi cuenta", icon: KeyRound },
];

const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [auth, setAuthState] = useState<StoredAuth | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const stored = getAuth();
    if (!stored && pathname !== "/admin/login") {
      router.replace("/admin/login");
      return;
    }
    setAuthState(stored);
    setReady(true);
  }, [pathname, router]);

  // Al cambiar de sección el cajón se cierra solo: dejarlo abierto tapando la
  // pantalla recién cargada es el error clásico de este patrón.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Con el cajón abierto no se scrollea el fondo (iOS lo permite si no se fija)
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (pathname === "/admin/login") return <>{children}</>;
  if (!ready || !auth) return null;

  const seccion = NAV.find((n) => n.href === pathname)?.label ?? "Panel";

  function cerrarSesion() {
    adminApi.logout();
    router.replace("/admin/login");
  }

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-12 items-center gap-3 rounded-sm px-3 text-sm transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
              active
                ? "bg-copper/15 text-copper"
                : "text-smoke hover:bg-ash hover:text-chalk"
            }`}
          >
            {active && (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-copper" />
            )}
            <Icon size={18} className="shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const Pie = () => (
    <div className="border-t border-edge p-3">
      <p className="truncate px-1 pb-2 text-xs text-smoke">
        {auth.username} · <span className="text-copper">{auth.role}</span>
      </p>
      <button
        onClick={cerrarSesion}
        className="flex min-h-12 w-full items-center gap-3 rounded-sm px-3 text-sm text-smoke transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] hover:bg-brick/20 hover:text-chalk active:scale-[0.98]"
      >
        <LogOut size={18} className="shrink-0" aria-hidden />
        <span>Salir</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-svh lg:flex">
      {/* ---------------------------------------------------------- móvil */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-edge bg-coal/95 px-4 backdrop-blur lg:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-sm text-chalk transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-95 active:bg-ash"
        >
          <Menu size={22} aria-hidden />
        </button>
        <span className="display truncate text-lg text-chalk">{seccion}</span>
        <Link href="/" className="display ml-auto text-sm text-copper">
          WB
        </Link>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 bg-night/70 lg:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ transform: reduce ? "translateX(0%)" : "translateX(-100%)", opacity: reduce ? 0 : 1 }}
              animate={{ transform: "translateX(0%)", opacity: 1 }}
              exit={{ transform: reduce ? "translateX(0%)" : "translateX(-100%)", opacity: reduce ? 0 : 1 }}
              transition={{ duration: reduce ? 0.2 : 0.32, ease: EASE_DRAWER }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-edge bg-coal lg:hidden"
            >
              <div className="flex items-center justify-between px-4 py-4">
                <Link href="/" className="display text-xl text-chalk">
                  Will<span className="text-copper"> Barber Shop</span>
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="-mr-2 flex h-11 w-11 items-center justify-center rounded-sm text-smoke transition-[background-color,transform] duration-150 ease-[var(--ease-out)] active:scale-95 active:bg-ash"
                >
                  <X size={20} aria-hidden />
                </button>
              </div>
              <div className="barber-stripe mx-4 mb-2 w-16" />
              <NavList onNavigate={() => setMenuOpen(false)} />
              <Pie />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* -------------------------------------------------------- desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-edge bg-coal lg:flex">
        <Link href="/" className="display px-5 py-6 text-xl text-chalk">
          Will<span className="text-copper"> Barber Shop</span>
        </Link>
        <div className="barber-stripe mx-5 mb-4 w-16" />
        <NavList />
        <Pie />
      </aside>

      {/* key=pathname reinicia la animación de entrada al cambiar de sección */}
      <main
        key={pathname}
        className="animate-fade-up min-w-0 flex-1 px-4 pb-16 pt-20 sm:px-5 lg:ml-56 lg:px-10 lg:pt-8"
      >
        {children}
      </main>
    </div>
  );
}

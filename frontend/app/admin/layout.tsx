"use client";

/**
 * Layout del panel: guard de sesión en cliente + navegación lateral.
 * El rol `barbero` solo ve Dashboard y Agenda (su propia agenda).
 */
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  ChartNoAxesColumn,
  CreditCard,
  Gift,
  Images,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Package,
  Scissors,
  ShieldAlert,
} from "lucide-react";
import { adminApi, getAuth, type StoredAuth } from "@/lib/admin-api";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/mi-desempeno", label: "Mi desempeño", icon: ChartNoAxesColumn },
  { href: "/admin/turnos", label: "Turnos", icon: ListChecks },
  { href: "/admin/servicios", label: "Servicios", icon: Scissors },
  { href: "/admin/productos", label: "Vitrina", icon: Package },
  { href: "/admin/regalos", label: "Regalos", icon: Gift },
  { href: "/admin/galeria", label: "Galería", icon: Images },
  { href: "/admin/seguridad", label: "Seguridad", icon: ShieldAlert },
  { href: "/admin/cuenta", label: "Mi cuenta", icon: KeyRound },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuthState] = useState<StoredAuth | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getAuth();
    if (!stored && pathname !== "/admin/login") {
      router.replace("/admin/login");
      return;
    }
    setAuthState(stored);
    setReady(true);
  }, [pathname, router]);

  if (pathname === "/admin/login") return <>{children}</>;
  if (!ready || !auth) return null;

  const links = NAV;

  return (
    <div className="flex min-h-svh">
      <aside className="texture-pinstripe fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-line bg-card lg:w-56">
        <Link href="/" className="display px-3 py-6 text-center text-xl text-ink lg:px-5 lg:text-left">
          <span className="hidden lg:inline">
            Will<span className="text-brand"> Santoyo</span>
          </span>
          <span className="text-brand lg:hidden">BB</span>
        </Link>
        <div className="barber-stripe mx-3 mb-4 lg:mx-5" />
        <nav className="flex-1 space-y-1 px-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-[background-color,color] duration-150 ease-[var(--ease-out-strong)] ${
                  active
                    ? "bg-brand/15 text-brand"
                    : "text-ink-soft hover:translate-x-0.5 hover:bg-wash hover:text-ink"
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand" />
                )}
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <p className="hidden truncate px-1 pb-2 text-xs text-ink-soft lg:block">
            {auth.username} · <span className="text-brand">{auth.role}</span>
          </p>
          <button
            onClick={() => {
              adminApi.logout();
              router.replace("/admin/login");
            }}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-err/20 hover:text-ink"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="hidden lg:inline">Salir</span>
          </button>
        </div>
      </aside>
      {/* key=pathname reinicia la animación de entrada al cambiar de sección */}
      <main key={pathname} className="animate-fade-up ml-16 flex-1 px-5 py-8 lg:ml-56 lg:px-10">
        {children}
      </main>
    </div>
  );
}

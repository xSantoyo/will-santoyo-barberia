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
  Images,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Scissors,
  Users,
} from "lucide-react";
import { adminApi, getAuth, type StoredAuth } from "@/lib/admin-api";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "barbero"] },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays, roles: ["admin", "barbero"] },
  { href: "/admin/turnos", label: "Turnos", icon: ListChecks, roles: ["admin"] },
  { href: "/admin/barberos", label: "Barberos", icon: Users, roles: ["admin"] },
  { href: "/admin/servicios", label: "Servicios", icon: Scissors, roles: ["admin"] },
  { href: "/admin/galeria", label: "Galería", icon: Images, roles: ["admin"] },
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

  const links = NAV.filter((item) => item.roles.includes(auth.role));

  return (
    <div className="flex min-h-svh">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col border-r border-ink-3 bg-ink-2 lg:w-56">
        <Link href="/" className="display px-3 py-5 text-center text-xl text-bone lg:text-left">
          <span className="hidden lg:inline">
            BAD<span className="text-gold"> BOYS</span>
          </span>
          <span className="lg:hidden text-gold">BB</span>
        </Link>
        <nav className="flex-1 space-y-1 px-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-gold/15 text-gold"
                    : "text-bone-2 hover:bg-ink-3 hover:text-bone"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-ink-3 p-3">
          <p className="hidden truncate px-1 pb-2 text-xs text-bone-2 lg:block">
            {auth.username} · {auth.role}
          </p>
          <button
            onClick={() => {
              adminApi.logout();
              router.replace("/admin/login");
            }}
            className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm text-bone-2 transition-colors hover:bg-wine/20 hover:text-bone"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="hidden lg:inline">Salir</span>
          </button>
        </div>
      </aside>
      <main className="ml-16 flex-1 px-5 py-8 lg:ml-56 lg:px-10">{children}</main>
    </div>
  );
}

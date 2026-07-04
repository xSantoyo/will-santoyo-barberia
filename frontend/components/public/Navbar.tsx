"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/#servicios", label: "Servicios" },
  { href: "/#barberos", label: "Barberos" },
  { href: "/#galeria", label: "Galería" },
  { href: "/#ubicacion", label: "Ubicación" },
  { href: "/turno", label: "Mi turno" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-ink/90 backdrop-blur border-b border-ink-3" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="display text-2xl text-bone">
          BAD<span className="text-gold"> BOYS</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm tracking-wide text-bone-2 transition-colors hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/agendar"
            className="display rounded-sm bg-gold px-5 py-2 text-sm text-ink transition-transform hover:scale-105"
          >
            Agendar
          </Link>
        </div>

        <button
          className="text-bone md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Abrir menú"
        >
          {open ? <X size={26} /> : <Menu size={26} />}
        </button>
      </nav>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-ink-3 bg-ink/95 px-5 pb-6 pt-2 backdrop-blur md:hidden"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block py-3 text-bone-2 hover:text-gold"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/agendar"
            onClick={() => setOpen(false)}
            className="display mt-3 block rounded-sm bg-gold px-5 py-3 text-center text-ink"
          >
            Agendar turno
          </Link>
        </motion.div>
      )}
    </header>
  );
}

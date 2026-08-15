"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

const LINKS = [
  { href: "/#servicios", label: "Servicios" },
  { href: "/#galeria", label: "Galería" },
  { href: "/hoy", label: "La fila" },
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
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-200 ease-[var(--ease-out-strong)] ${
        scrolled ? "bg-paper/90 backdrop-blur border-b border-line" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="display text-2xl text-ink">
          WILL<span className="text-brand"> SANTOYO</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm tracking-wide text-ink-soft transition-colors hover:text-brand"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/agendar"
            className="display rounded-sm bg-brand px-5 py-2 text-sm text-on-brand transition-transform hover:scale-105"
          >
            Agendar
          </Link>
        </div>

        <button
          className="text-ink md:hidden"
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
          className="border-t border-line bg-paper/95 px-5 pb-6 pt-2 backdrop-blur md:hidden"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block py-3 text-ink-soft hover:text-brand"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/agendar"
            onClick={() => setOpen(false)}
            className="display mt-3 block rounded-sm bg-brand px-5 py-3 text-center text-on-brand"
          >
            Agendar turno
          </Link>
        </motion.div>
      )}
    </header>
  );
}

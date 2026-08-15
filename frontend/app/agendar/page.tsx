import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import Wizard from "@/components/booking/Wizard";

export const metadata: Metadata = { title: "Agendar turno" };

export default function AgendarPage() {
  return (
    <main className="min-h-svh pt-10">
      <div className="mx-auto max-w-3xl px-5 pb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-brand"
        >
          <ArrowLeft size={16} /> Will Santoyo
        </Link>
        <h1 className="display mt-6 text-5xl text-ink">
          Agenda tu <span className="text-brand">turno</span>
        </h1>
        <p className="mt-2 text-ink-soft">Tres pasos y listo. Sin llamadas, sin filas.</p>
      </div>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-brand">
            <Loader2 className="animate-spin" size={32} />
          </div>
        }
      >
        <Wizard />
      </Suspense>
    </main>
  );
}

"use client";

/** Regala un corte (pago en línea): eliges el servicio, pagas y el código
 * G-XXXXXX sale al instante para compartir. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import { publicApi } from "@/lib/api";
import { track } from "@/lib/analytics";
import { formatCOP, type ServicePublic } from "@/lib/types";

export default function GiftShopPage() {
  const [services, setServices] = useState<ServicePublic[]>([]);
  const [selected, setSelected] = useState<ServicePublic | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(""); // opcional: el código llega al correo
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi.services().then((loaded) => {
      setServices(loaded);
      setSelected(loaded[0] ?? null);
    });
  }, []);

  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const payment = await publicApi.giftCheckout({
        service_id: selected.id,
        payer_name: name.trim(),
        payer_whatsapp: phone.trim() || null,
        payer_email: email.trim() || null,
      });
      if (payment.checkout_url) {
        track("regalo_checkout", {
          servicio_id: selected.id,
          con_correo: Boolean(email.trim()),
        });
        window.location.href = payment.checkout_url;
        return;
      }
      setError("No se pudo iniciar el pago.");
      setBusy(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("404")
          ? "La tienda de regalos no está habilitada por ahora — pregúntanos en el local."
          : err instanceof Error
            ? err.message
            : "No se pudo iniciar el pago.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="grain texture-grid relative min-h-svh overflow-hidden pt-10">
      <span
        aria-hidden
        className="display text-outline pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 whitespace-nowrap text-[18vw] leading-none"
      >
        REGALA
      </span>
      <div className="relative mx-auto max-w-md px-5 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-bone-2 transition-colors hover:text-gold"
        >
          <ArrowLeft size={16} /> Bad Boys Barbershop
        </Link>
        <h1 className="display mt-6 text-5xl text-bone">
          Regala un <span className="text-gold">corte</span>
        </h1>
        <p className="mt-2 text-bone-2">
          Pagas en línea, recibes el código al instante y lo compartes. Quien lo
          recibe lo aplica al agendar su turno.
        </p>

        <form onSubmit={checkout} className="mt-10 space-y-5">
          {error && (
            <div className="rounded-sm border border-wine bg-wine/15 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <fieldset>
            <legend className="data mb-2 text-[11px] uppercase tracking-[0.25em] text-bone-2">
              ¿Qué regalas?
            </legend>
            <div className="space-y-2.5">
              {services.map((service) => {
                const active = selected?.id === service.id;
                return (
                  <button
                    type="button"
                    key={service.id}
                    onClick={() => setSelected(service)}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-sm border px-4 text-left transition-all active:scale-[0.99] ${
                      active
                        ? "border-gold bg-gold/10"
                        : "border-ink-3 bg-ink-2 hover:border-gold/40"
                    }`}
                  >
                    <span className="text-bone">{service.name}</span>
                    <span className="data font-semibold text-gold">
                      {formatCOP(service.price_cop)}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm text-bone-2">Tu nombre (quien regala)</span>
            <input
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre y apellido"
              className="focus-gold min-h-13 w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5 text-base text-bone placeholder:text-bone-2/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-bone-2">Tu WhatsApp (opcional)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="300 123 4567"
              inputMode="tel"
              className="focus-gold min-h-13 w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5 text-base text-bone placeholder:text-bone-2/50"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-bone-2">Tu correo (opcional)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              type="email"
              inputMode="email"
              autoComplete="email"
              className="focus-gold min-h-13 w-full rounded-sm border border-ink-3 bg-ink-2 px-4 py-3.5 text-base text-bone placeholder:text-bone-2/50"
            />
            <span className="mt-1.5 block text-xs text-bone-2/70">
              Al aprobarse el pago, el código del regalo también te llega ahí.
            </span>
          </label>

          <button
            type="submit"
            disabled={busy || !selected || name.trim().length < 2}
            className="display flex min-h-13 w-full items-center justify-center gap-2 rounded-sm bg-gold px-6 text-lg text-ink transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Gift size={18} />}
            Pagar {selected ? formatCOP(selected.price_cop) : ""} y recibir el código
          </button>
          <p className="data text-center text-[10px] uppercase tracking-wider text-bone-2">
            Nequi · PSE · Tarjetas — vía Wompi · el código vence en 180 días
          </p>
        </form>
      </div>
    </main>
  );
}

"use client";

/** Códigos de regalo (Tanda 4, B4): el negocio los genera cuando alguien pagó
 * EN EL LOCAL; quien lo recibe lo redime al agendar. Cero cobros en línea. */
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2 } from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import type { GiftCodeAdmin } from "@/lib/types";
import { PageTitle, buttonPrimary, inputClass } from "@/components/admin/shared";

export default function RegalosPage() {
  const [codes, setCodes] = useState<GiftCodeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState("");
  const [expiresDays, setExpiresDays] = useState<string>("90");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi
      .giftCodes()
      .then(setCodes)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi.createGiftCode(
        description.trim(),
        expiresDays ? Number(expiresDays) : undefined,
      );
      setDescription("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function copy(gift: GiftCodeAdmin) {
    try {
      await navigator.clipboard.writeText(gift.code);
      setCopied(gift.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* código visible igual */
    }
  }

  function statusOf(gift: GiftCodeAdmin): { label: string; className: string } {
    if (gift.redeemed_at) return { label: "Redimido", className: "text-smoke" };
    if (gift.held_by_appointment_id)
      return { label: "Reservado", className: "text-copper" };
    if (gift.expires_at && new Date(gift.expires_at) < new Date())
      return { label: "Vencido", className: "text-brick" };
    return { label: "Disponible", className: "text-emerald-400" };
  }

  return (
    <>
      <PageTitle
        title="Regalos"
        subtitle="Genera el código cuando te lo paguen en el local; el cliente lo redime al agendar"
      />

      <form
        onSubmit={create}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-sm border border-edge bg-coal p-4"
      >
        <label className="min-w-64 flex-1 text-sm text-smoke">
          ¿Qué regala?
          <input
            required
            minLength={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Corte clásico de regalo — pagado por María"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="w-32 text-sm text-smoke">
          Vence (días)
          <input
            type="number"
            min={1}
            max={365}
            value={expiresDays}
            onChange={(e) => setExpiresDays(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <button type="submit" disabled={saving} className={buttonPrimary}>
          {saving ? (
            <Loader2 className="mr-1 inline animate-spin" size={15} />
          ) : (
            <Gift size={15} className="mr-1 inline" />
          )}
          Generar código
        </button>
      </form>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-copper">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-edge">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-edge bg-coal text-left text-xs uppercase tracking-wider text-smoke">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3">Creado por</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {codes.map((gift) => {
                const status = statusOf(gift);
                return (
                  <tr key={gift.id} className="bg-night hover:bg-coal">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copy(gift)}
                        className="data flex items-center gap-2 font-semibold tracking-[0.15em] text-copper"
                        title="Copiar"
                      >
                        {gift.code}
                        {copied === gift.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </td>
                    <td className="max-w-64 truncate px-4 py-3 text-chalk">
                      {gift.description}
                    </td>
                    <td className="data px-4 py-3 text-smoke">{gift.created_by}</td>
                    <td className="data px-4 py-3 text-smoke">
                      {gift.expires_at ? gift.expires_at.slice(0, 10) : "—"}
                    </td>
                    <td className={`data px-4 py-3 text-xs uppercase tracking-wider ${status.className}`}>
                      {status.label}
                    </td>
                  </tr>
                );
              })}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-smoke">
                    Aún no hay códigos de regalo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
